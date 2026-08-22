import { InstanceBase, InstanceStatus, type SomeCompanionConfigField } from '@companion-module/base'
import { GetConfigFields, normalizeConfig, type ModuleConfig } from './config.js'
import { UpdateVariableDefinitions, UpdateVariableValues, type VariablesSchema } from './variables.js'
import { UpgradeScripts } from './upgrades.js'
import { UpdateActions, type ActionsSchema } from './actions.js'
import { UpdateFeedbacks, type FeedbacksSchema } from './feedbacks.js'
import { UpdatePresets } from './presets.js'
import { OscTransport } from './osc/transport.js'
import { TotalMixController, type RoomEqSide } from './protocol/controller.js'
import { detectDeviceProfile, getDeviceProfile } from './model/profiles/index.js'
import type {
	ChannelDefinition,
	DeviceCapabilities,
	DeviceProfile,
	MixerBus,
	MixerChannelTarget,
	SubmixTarget,
} from './model/device-profile.js'
import { TargetSynchronizer } from './state/target-synchronizer.js'
import {
	PublishedVariableRegistry,
	type PublishedChannelField,
	type PublishedFaderUnit,
	type PublishedVariableTarget,
} from './state/published-variables.js'

export type ModuleSchema = {
	config: ModuleConfig
	secrets: undefined
	actions: ActionsSchema
	feedbacks: FeedbacksSchema
	variables: VariablesSchema
}

export { UpgradeScripts }

type GlobalFeedbackTarget = 'snapshots' | 'groups' | 'controlRoom' | 'duRec' | 'globalFx'

export default class ModuleInstance extends InstanceBase<ModuleSchema> {
	config!: ModuleConfig
	controller!: TotalMixController
	connectionActive = false
	connectionState = 'disconnected'

	private transport?: OscTransport
	private monitorTimer?: NodeJS.Timeout
	private targetSyncTimer?: NodeJS.Timeout
	private definitionRefreshTimer?: NodeJS.Timeout
	private variableDefinitionRefreshTimer?: NodeJS.Immediate
	private presetDefinitionRefreshPending = false
	private targetSynchronizer?: TargetSynchronizer
	private unsubscribeState?: () => void
	private refreshPending = false
	private lastGlobalStatusRequestAt = 0
	private readonly globalFeedbackTargets = new Map<GlobalFeedbackTarget, { lastSeenAt: number; nextSyncAt: number }>()
	private readonly channelParameterFeedbackTargets = new Map<
		string,
		{ target: MixerChannelTarget; parameter: string; lastSeenAt: number; nextSyncAt: number }
	>()
	private readonly roomEqFeedbackTargets = new Map<
		string,
		{ output: number; side: RoomEqSide; parameter: string; lastSeenAt: number; nextSyncAt: number }
	>()
	private readonly publishedVariables = new PublishedVariableRegistry()

	constructor(internal: unknown) {
		super(internal)
	}

	get profile(): DeviceProfile {
		if (this.config.protocolMode === 'global' && this.controller?.state.detectedDevice) {
			const detected = detectDeviceProfile(this.controller.state.detectedDevice)
			if (detected) {
				if (detected.id === 'digiface-ravenna' && this.config.deviceProfile === 'digiface-ravenna-madi') {
					return getDeviceProfile(this.config.deviceProfile)
				}
				return detected
			}
		}
		return getDeviceProfile(this.config.deviceProfile)
	}

	get capabilities(): DeviceCapabilities {
		if (this.config.protocolMode === 'global' && this.controller?.state.hasGlobalDiscoveryData) {
			// Global OSC reports generic settings for channels that do not necessarily
			// implement the corresponding hardware control. A known device profile is
			// authoritative; discovery remains the fallback for unknown devices.
			if (this.controller.state.detectedDevice && detectDeviceProfile(this.controller.state.detectedDevice)) {
				return this.profile.capabilities
			}
			return this.controller.state.getDiscoveredCapabilities()
		}
		return this.profile.capabilities
	}

	getChoiceChannels(bus: MixerBus): ChannelDefinition[] {
		const fallback =
			bus === 'input' ? this.profile.inputs : bus === 'playback' ? this.profile.playbacks : this.profile.outputs
		if (!this.controller) return fallback
		const discovered = this.controller.isGlobalOsc
			? this.controller.state.getDiscoveredChannels(bus, fallback)
			: this.controller.state.getNamedChannels(bus, fallback.length)
		return discovered.length > 0 ? discovered : fallback
	}

	async init(config: ModuleConfig): Promise<void> {
		this.config = normalizeConfig(config)
		this.updateActions()
		this.updateFeedbacks()
		this.updatePresets()
		this.updateVariableDefinitions()
		this.startConnection()
	}

	async destroy(): Promise<void> {
		this.stopConnection()
		this.log('debug', 'RME TotalMix instance destroyed')
	}

	async configUpdated(config: ModuleConfig): Promise<void> {
		this.stopConnection()
		this.config = normalizeConfig(config)
		this.updateActions()
		this.updateFeedbacks()
		this.updatePresets()
		this.updateVariableDefinitions()
		this.startConnection()
	}

	getConfigFields(): SomeCompanionConfigField[] {
		return GetConfigFields()
	}

	updateActions(): void {
		UpdateActions(this)
	}

	updateFeedbacks(): void {
		UpdateFeedbacks(this)
	}

	updatePresets(): void {
		UpdatePresets(this)
	}

	updateVariableDefinitions(): void {
		UpdateVariableDefinitions(this)
		if (this.controller) UpdateVariableValues(this)
	}

	async runCommand(operation: () => Promise<void>): Promise<void> {
		try {
			await operation()
		} catch (error) {
			this.log('error', error instanceof Error ? error.message : String(error))
		}
	}

	getPublishedVariableTargets(): PublishedVariableTarget[] {
		return this.publishedVariables.values()
	}

	keepPublishedVariableTargetAlive(target: PublishedVariableTarget): void {
		switch (target.kind) {
			case 'routeFader':
			case 'routePan':
				this.targetSynchronizer?.registerRoute(target.target)
				return
			case 'outputFader':
			case 'outputPan':
				this.targetSynchronizer?.registerOutput(target.output)
				return
			case 'channel':
				if (target.target.bus === 'output') this.targetSynchronizer?.registerOutput(target.target.index)
				else this.targetSynchronizer?.registerChannel({ bus: target.target.bus, index: target.target.index })
				return
			case 'channelParameter': {
				const key = `${target.target.bus}:${target.target.index}:${target.parameter}`
				const now = Date.now()
				const current = this.channelParameterFeedbackTargets.get(key)
				if (current) current.lastSeenAt = now
				else
					this.channelParameterFeedbackTargets.set(key, {
						target: { ...target.target },
						parameter: target.parameter,
						lastSeenAt: now,
						nextSyncAt: 0,
					})
				return
			}
			case 'roomEqParameter': {
				const key = `${target.output}:${target.side}:${target.parameter}`
				const now = Date.now()
				const current = this.roomEqFeedbackTargets.get(key)
				if (current) current.lastSeenAt = now
				else
					this.roomEqFeedbackTargets.set(key, {
						output: target.output,
						side: target.side,
						parameter: target.parameter,
						lastSeenAt: now,
						nextSyncAt: 0,
					})
				return
			}
		}
	}

	registerFeedbackRoute(target: SubmixTarget, field: 'fader' | 'pan' = 'fader', unit: PublishedFaderUnit = 'db'): void {
		this.targetSynchronizer?.registerRoute(target)
		this.publishVariable(
			field === 'pan'
				? { kind: 'routePan', target: { ...target } }
				: { kind: 'routeFader', target: { ...target }, unit },
		)
	}

	registerFeedbackChannel(target: MixerChannelTarget, field: PublishedChannelField = 'name'): void {
		if (target.bus === 'output') this.targetSynchronizer?.registerOutput(target.index)
		else this.targetSynchronizer?.registerChannel({ bus: target.bus, index: target.index })
		this.publishVariable({ kind: 'channel', target: { ...target }, field })
	}

	registerFeedbackOutput(output: number, field: 'fader' | 'pan' = 'fader', unit: PublishedFaderUnit = 'db'): void {
		this.targetSynchronizer?.registerOutput(output)
		this.publishVariable(field === 'pan' ? { kind: 'outputPan', output } : { kind: 'outputFader', output, unit })
	}

	registerGlobalFeedback(target: GlobalFeedbackTarget): void {
		const now = Date.now()
		const current = this.globalFeedbackTargets.get(target)
		if (current) current.lastSeenAt = now
		else this.globalFeedbackTargets.set(target, { lastSeenAt: now, nextSyncAt: 0 })
	}

	registerChannelParameterFeedback(target: MixerChannelTarget, parameter: string): void {
		const key = `${target.bus}:${target.index}:${parameter}`
		const now = Date.now()
		const current = this.channelParameterFeedbackTargets.get(key)
		if (current) current.lastSeenAt = now
		else
			this.channelParameterFeedbackTargets.set(key, {
				target: { ...target },
				parameter,
				lastSeenAt: now,
				nextSyncAt: 0,
			})
		this.publishVariable({ kind: 'channelParameter', target: { ...target }, parameter })
	}

	registerRoomEqFeedback(output: number, side: RoomEqSide, parameter: string): void {
		const key = `${output}:${side}:${parameter}`
		const now = Date.now()
		const current = this.roomEqFeedbackTargets.get(key)
		if (current) current.lastSeenAt = now
		else this.roomEqFeedbackTargets.set(key, { output, side, parameter, lastSeenAt: now, nextSyncAt: 0 })
		this.publishVariable({ kind: 'roomEqParameter', output, side, parameter })
	}

	private publishVariable(target: PublishedVariableTarget): void {
		if (!this.publishedVariables.register(target)) return
		this.scheduleVariableDefinitionRefresh()
	}

	refreshChannelNames(): void {
		void this.discoverChannelNames()
	}

	private startConnection(): void {
		this.connectionActive = false
		this.connectionState = 'connecting'
		this.updateStatus(InstanceStatus.Connecting)

		this.transport = new OscTransport(
			{
				host: this.config.host,
				targetPort: this.config.targetPort,
				feedbackPort: this.config.feedbackPort,
			},
			{
				onListening: () => {
					this.log('info', `Listening for TotalMix OSC feedback on UDP ${this.config.feedbackPort}`)
					if (this.controller.isGlobalOsc) void this.controller.requestInitialState()
					else void this.discoverChannelNames()
					void this.syncNextBackgroundTarget()
				},
				onMessage: (message) => {
					const discoveryRevision = this.controller.state.discoveryRevision
					this.controller.handleMessage(message)
					const discoveryChanged = this.controller.state.discoveryRevision !== discoveryRevision
					if (discoveryChanged) this.scheduleDefinitionRefresh(true)
					if (!this.connectionActive) {
						this.connectionActive = true
						this.connectionState = 'connected'
						this.updateStatus(InstanceStatus.Ok)
					}
					this.scheduleRefresh()
				},
				onError: (error) => {
					this.connectionActive = false
					this.connectionState = 'error'
					this.updateStatus(InstanceStatus.ConnectionFailure, error.message)
					this.log('error', `OSC transport: ${error.message}`)
					this.scheduleRefresh()
				},
			},
		)

		this.controller = new TotalMixController(
			async (address, ...args) => {
				if (!this.transport) throw new Error('OSC transport is not available')
				return this.transport.send(address, ...args)
			},
			{
				bankSize: this.config.bankSize,
				syncTimeoutMs: this.config.syncTimeoutMs,
				protocolMode: this.config.protocolMode,
			},
		)
		this.unsubscribeState = this.controller.state.subscribe(() => this.scheduleRefresh())
		this.targetSynchronizer = new TargetSynchronizer(
			async (target) => this.controller.syncSubmixFader(target),
			async (target) => this.controller.syncChannel(target),
			async (output) => this.controller.syncOutputFader(output),
		)
		this.transport.start()
		this.monitorTimer = setInterval(() => this.monitorConnection(), 1000)
		this.targetSyncTimer = setInterval(() => void this.syncNextBackgroundTarget(), 250)
		this.scheduleRefresh()
	}

	private stopConnection(): void {
		if (this.monitorTimer) clearInterval(this.monitorTimer)
		this.monitorTimer = undefined
		if (this.targetSyncTimer) clearInterval(this.targetSyncTimer)
		this.targetSyncTimer = undefined
		if (this.definitionRefreshTimer) clearTimeout(this.definitionRefreshTimer)
		this.definitionRefreshTimer = undefined
		if (this.variableDefinitionRefreshTimer) clearImmediate(this.variableDefinitionRefreshTimer)
		this.variableDefinitionRefreshTimer = undefined
		this.presetDefinitionRefreshPending = false
		this.targetSynchronizer?.clear()
		this.targetSynchronizer = undefined
		this.globalFeedbackTargets.clear()
		this.channelParameterFeedbackTargets.clear()
		this.roomEqFeedbackTargets.clear()
		this.unsubscribeState?.()
		this.unsubscribeState = undefined
		this.transport?.close()
		this.transport = undefined
		this.connectionActive = false
		this.connectionState = 'disconnected'
	}

	private monitorConnection(): void {
		const lastMessageAt = this.controller.state.lastMessageAt
		const now = Date.now()
		const age = lastMessageAt ? now - lastMessageAt : Number.POSITIVE_INFINITY
		if (this.controller.isGlobalOsc && age > 2000 && now - this.lastGlobalStatusRequestAt > 2000) {
			this.lastGlobalStatusRequestAt = now
			void this.controller
				.requestStatus()
				.catch((error) =>
					this.log('debug', `Global OSC status request: ${error instanceof Error ? error.message : String(error)}`),
				)
		}
		const timeoutMs = this.controller.isGlobalOsc ? 10_000 : 3000
		if (this.connectionActive && (!lastMessageAt || age > timeoutMs)) {
			this.connectionActive = false
			this.connectionState = 'timed out'
			this.controller.state.markStale()
			this.updateStatus(
				InstanceStatus.ConnectionFailure,
				`No OSC feedback from TotalMix for ${timeoutMs / 1000} seconds`,
			)
		}
		this.scheduleRefresh()
	}

	private scheduleRefresh(): void {
		if (this.refreshPending || !this.controller) return
		this.refreshPending = true
		setImmediate(() => {
			this.refreshPending = false
			UpdateVariableValues(this)
			this.checkFeedbacks(
				'connection_active',
				'totalmix_device_connected',
				'detected_device_name',
				'dsp_load_value',
				'mute_state',
				'solo_state',
				'fader_threshold',
				'target_confirmed',
				'submix_fader_value',
				'output_fader_value',
				'active_snapshot',
				'group_state',
				'input_gain_value',
				'phantom_state',
				'instrument_state',
				'pad_state',
				'autoset_state',
				'channel_option_state',
				'channel_option_value',
				'pan_value',
				'pan_display_value',
				'pan_centered',
				'preset_value',
				'preset_state',
				'loopback_state',
				'control_room_state',
				'channel_name',
				'channel_level',
				'channel_level_threshold',
				'durec_state',
				'durec_time',
				'durec_recording',
				'durec_playing',
				'channel_processing_state',
				'channel_processing_value',
				'global_fx_state',
				'global_fx_value',
				'room_eq_state',
				'room_eq_value',
			)
		})
	}

	private scheduleDefinitionRefresh(includePresets = false): void {
		this.presetDefinitionRefreshPending ||= includePresets
		if (this.definitionRefreshTimer) clearTimeout(this.definitionRefreshTimer)
		this.definitionRefreshTimer = setTimeout(() => {
			this.definitionRefreshTimer = undefined
			this.updateActions()
			this.updateFeedbacks()
			this.updateVariableDefinitions()
			if (this.presetDefinitionRefreshPending) this.updatePresets()
			this.presetDefinitionRefreshPending = false
		}, 100)
	}

	private scheduleVariableDefinitionRefresh(): void {
		if (this.variableDefinitionRefreshTimer) return
		this.variableDefinitionRefreshTimer = setImmediate(() => {
			this.variableDefinitionRefreshTimer = undefined
			this.updateVariableDefinitions()
		})
	}

	private async discoverChannelNames(): Promise<void> {
		try {
			if (this.controller.isGlobalOsc) {
				await this.controller.syncChannelNames('input', this.profile.inputs.length)
				this.scheduleDefinitionRefresh()
				return
			}
			await this.controller.syncChannelNames('input', this.profile.inputs.length)
			await this.controller.syncChannelNames('playback', this.profile.playbacks.length)
			await this.controller.syncChannelNames('output', this.profile.outputs.length)
			this.scheduleDefinitionRefresh()
		} catch (error) {
			this.log('debug', `OSC channel-name discovery: ${error instanceof Error ? error.message : String(error)}`)
		}
	}

	private async syncNextBackgroundTarget(): Promise<void> {
		if (!this.targetSynchronizer || this.connectionState === 'error') return
		if (!this.controller.isGlobalOsc && this.controller.hasPendingInteractiveWrites) return
		try {
			const now = Date.now()
			const duRecTarget = this.globalFeedbackTargets.get('duRec')
			if (duRecTarget && duRecTarget.nextSyncAt <= now) {
				const state = String(this.controller.state.getGlobalParameter('recordState').value ?? '').toLowerCase()
				duRecTarget.nextSyncAt = now + (state === 'record' || state === 'play' ? 500 : 2000)
				await this.controller.syncDuRec()
				return
			}
			if (await this.targetSynchronizer.syncNext()) return
			for (const [key, target] of this.channelParameterFeedbackTargets) {
				if (now - target.lastSeenAt > 10_000) {
					this.channelParameterFeedbackTargets.delete(key)
					continue
				}
				if (target.nextSyncAt > now) continue
				const nextSyncAt = now + 2000
				target.nextSyncAt = nextSyncAt
				if (!this.controller.isGlobalOsc) {
					// One legacy Page 2 selection returns every channel option. Avoid
					// requesting the same block once per feedback parameter.
					for (const sibling of this.channelParameterFeedbackTargets.values()) {
						if (sibling.target.bus === target.target.bus && sibling.target.index === target.target.index)
							sibling.nextSyncAt = nextSyncAt
					}
				}
				await this.controller.syncChannelParameter(target.target, target.parameter)
				return
			}
			for (const [key, target] of this.roomEqFeedbackTargets) {
				if (now - target.lastSeenAt > 10_000) {
					this.roomEqFeedbackTargets.delete(key)
					continue
				}
				if (target.nextSyncAt > now) continue
				target.nextSyncAt = now + 2000
				await this.controller.syncRoomEqParameter(target.output, target.side, target.parameter)
				return
			}
			for (const [key, target] of this.globalFeedbackTargets) {
				if (key === 'duRec') continue
				if (now - target.lastSeenAt > 10_000) {
					this.globalFeedbackTargets.delete(key)
					continue
				}
				if (target.nextSyncAt > now) continue
				target.nextSyncAt = now + 2000
				if (key === 'snapshots') await this.controller.syncSnapshots()
				else if (key === 'groups') await this.controller.syncGroups()
				else if (key === 'controlRoom') await this.controller.syncControlRoom()
				else if (key === 'globalFx') await this.controller.syncGlobalFx()
				return
			}
		} catch (error) {
			this.log('debug', `Background OSC sync: ${error instanceof Error ? error.message : String(error)}`)
		}
	}
}
