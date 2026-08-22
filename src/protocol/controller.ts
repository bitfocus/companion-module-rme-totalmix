import type { MixerBus, MixerChannelTarget, SourceTarget, SubmixTarget } from '../model/device-profile.js'
import type { OscArgument, OscMessage } from '../osc/codec.js'
import { clampNormalized, dbToNormalized, formatDb, normalizedToDb } from './fader-curve.js'
import { resolveSlot } from './resolver.js'
import { TransactionQueue } from './transaction-queue.js'
import { TotalMixStateStore, type ValueState } from '../state/store.js'

export type BinaryOperation = 'on' | 'off' | 'toggle'
export type FaderUnit = 'normalized' | 'db'
export type GroupType = 'mute' | 'pfl' | 'fader'

interface SelectionContext {
	bus?: MixerBus
	submix?: number
	bankStart?: number
	offsetInBank?: number
	roomEqOutput?: number
	roomEqSide?: RoomEqSide
}

interface PendingInteractiveValue {
	value: number
	expiresAt: number
}

interface PendingLegacyGain extends PendingInteractiveValue {
	target: MixerChannelTarget
	key: string
	numericConfirmed: boolean
}

export type RoomEqSide = 'left' | 'right' | 'both'

const page2ToggleParameters = new Set([
	'mute',
	'phase',
	'phaseRight',
	'phantom',
	'instrument',
	'pad',
	'msProc',
	'autoset',
	'loopback',
	'stereo',
	'cue',
	'talkbackSel',
	'noTrim',
	'recordEnable',
	'lowcutEnable',
	'eqEnable',
	'compexpEnable',
	'alevEnable',
])

const controlRoomParameters = new Set([
	'globalMute',
	'globalSolo',
	'trim',
	'mainDim',
	'mainSpeakerB',
	'speakerBLinked',
	'mainMuteFx',
	'mainMono',
	'mainExtIn',
	'mainTalkback',
])

const globalFxToggleParameters = new Set(['reverbEnable', 'echoEnable'])
const roomEqToggleParameters = new Set(['leftChannel', 'rightChannel', 'reqEnable'])

const groupAddressNames: Record<GroupType, string> = {
	mute: 'muteGroups',
	pfl: 'soloGroups',
	fader: 'faderGroups',
}

export interface TotalMixControllerOptions {
	bankSize: number
	syncTimeoutMs: number
	selectionDelayMs?: number
	protocolMode?: '1.96' | 'global'
}

const globalChannelParameterPaths: Record<string, string> = {
	phantom: '48v',
	msProc: 'msproc',
	refLevel: 'reflevel',
	cue: 'pfl',
	talkbackSel: 'talkbacksel',
	recordEnable: 'record',
	reverbSend: 'fxsend',
	reverbReturn: 'fxreturn',
	lowcutEnable: 'lowcut/enable',
	lowcutGrade: 'lowcut/slope',
	lowcutFreq: 'lowcut/freq',
	eqEnable: 'eq/enable',
	eqType1: 'eq/band1type',
	eqGain1: 'eq/band1gain',
	eqFreq1: 'eq/band1freq',
	eqQ1: 'eq/band1q',
	eqGain2: 'eq/band2gain',
	eqFreq2: 'eq/band2freq',
	eqQ2: 'eq/band2q',
	eqType3: 'eq/band3type',
	eqGain3: 'eq/band3gain',
	eqFreq3: 'eq/band3freq',
	eqQ3: 'eq/band3q',
	compexpEnable: 'dynamics/enable',
	compexpGain: 'dynamics/gain',
	compexpAttack: 'dynamics/attack',
	compexpRelease: 'dynamics/release',
	compTrsh: 'dynamics/compthres',
	compRatio: 'dynamics/compratio',
	expTrsh: 'dynamics/expthres',
	expRatio: 'dynamics/expratio',
	alevEnable: 'autolevel/enable',
	alevMaxgain: 'autolevel/maxgain',
	alevHeadroom: 'autolevel/headroom',
	alevRisetime: 'autolevel/risetime',
}

const globalChannelPathParameters = new Map(
	Object.entries(globalChannelParameterPaths).map(([parameter, path]) => [path, parameter]),
)

const globalControlRoomPaths: Record<string, string> = {
	globalMute: '/globalmute',
	globalSolo: '/globalsolo',
	mainDim: '/controlroom/dim',
	mainSpeakerB: '/controlroom/speakerb',
	speakerBLinked: '/controlroom/linkab',
	mainMuteFx: '/controlroom/mutefx',
	mainMono: '/controlroom/mainmono',
	mainExtIn: '/controlroom/externalin',
	mainTalkback: '/controlroom/talkback',
}

const globalControlRoomParameters = new Map(
	Object.entries(globalControlRoomPaths).map(([parameter, path]) => [path, parameter]),
)

const globalFxPaths: Record<string, string> = {
	reverbEnable: '/reverb/enable',
	reverbType: '/reverb/type',
	reverbPredelay: '/reverb/predelay',
	reverbLowcut: '/reverb/lowcut',
	reverbHighcut: '/reverb/highcut',
	reverbRoomscale: '/reverb/roomscale',
	reverbAttack: '/reverb/attack',
	reverbHold: '/reverb/hold',
	reverbRelease: '/reverb/release',
	reverbTime: '/reverb/time',
	reverbHighdamp: '/reverb/highdamp',
	reverbSmooth: '/reverb/smooth',
	reverbWidth: '/reverb/width',
	reverbVolume: '/reverb/volume',
	echoEnable: '/echo/enable',
	echoType: '/echo/type',
	echoDelaytime: '/echo/delay',
	echoFeedback: '/echo/feedback',
	echoHighcut: '/echo/highcut',
	echoWidth: '/echo/width',
	echoVolume: '/echo/volume',
}

const globalFxParameters = new Map(Object.entries(globalFxPaths).map(([parameter, path]) => [path, parameter]))

function globalBusSegment(bus: MixerBus): string {
	return bus
}

function globalMixSegment(bus: SourceTarget['bus']): string {
	return bus === 'input' ? 'in' : 'pb'
}

export type OscSender = (address: string, ...args: OscArgument[]) => Promise<void>

export class TotalMixController {
	readonly state = new TotalMixStateStore()
	private readonly queue = new TransactionQueue()
	private readonly context: SelectionContext = {}
	private readonly selectionDelayMs: number
	private readonly pendingInteractiveValues = new Map<string, PendingInteractiveValue>()
	private pendingLegacyGain: PendingLegacyGain | undefined

	constructor(
		private readonly sendOsc: OscSender,
		private readonly options: TotalMixControllerOptions,
	) {
		this.selectionDelayMs = options.selectionDelayMs ?? 30
	}

	get isGlobalOsc(): boolean {
		return this.options.protocolMode === 'global'
	}

	get hasPendingInteractiveWrites(): boolean {
		this.expirePendingInteractiveValues()
		return this.pendingInteractiveValues.size > 0
	}

	invalidateContext(): void {
		this.context.bus = undefined
		this.context.submix = undefined
		this.context.bankStart = undefined
		this.context.offsetInBank = undefined
		this.context.roomEqOutput = undefined
		this.context.roomEqSide = undefined
	}

	async requestInitialState(): Promise<void> {
		return this.queue.run(async () => {
			if (!this.isGlobalOsc) return
			await this.sendOsc('/sendall', 2)
		})
	}

	async requestStatus(): Promise<void> {
		return this.queue.run(async () => {
			if (this.isGlobalOsc) await this.sendOsc('/sendstate', 1)
			else await this.sendOsc('/', 0)
		})
	}

	handleMessage(message: OscMessage): void {
		this.state.touch()
		if (message.address === '/') return
		if (this.handleGlobalMessage(message)) return

		const snapshot = /^\/3\/snapshots\/([1-8])\/1$/.exec(message.address)
		if (snapshot && typeof message.args[0] === 'number') {
			this.state.setSnapshot(9 - Number(snapshot[1]), message.args[0] >= 0.5, 'confirmed')
			return
		}

		const group = /^\/3\/(muteGroups|soloGroups|faderGroups)\/([1-4])\/1$/.exec(message.address)
		if (group && typeof message.args[0] === 'number') {
			const type: GroupType = group[1] === 'muteGroups' ? 'mute' : group[1] === 'soloGroups' ? 'pfl' : 'fader'
			this.state.setGlobalParameter(`group:${type}:${5 - Number(group[2])}`, message.args[0] >= 0.5, 'confirmed')
			return
		}

		const duRec = /^\/3\/(recordRecordStart|recordPlayPause|recordStop|recordTime|recordState)$/.exec(message.address)
		if (duRec) {
			const value = message.args[0]
			if (typeof value === 'string' || typeof value === 'number') {
				this.state.setGlobalParameter(duRec[1], value, 'confirmed')
			}
			return
		}

		const page3 = /^\/3\/((?:reverb|echo)[A-Za-z0-9]*?)(Val)?$/.exec(message.address)
		if (page3) {
			const parameter = page3[1]
			const value = message.args[0]
			if (page3[2] === 'Val' && typeof value === 'string') {
				this.state.setGlobalParameterDisplay(parameter, value)
			} else if (typeof value === 'number') {
				this.state.setGlobalParameter(
					parameter,
					globalFxToggleParameters.has(parameter) ? value >= 0.5 : value,
					'confirmed',
				)
			} else if (typeof value === 'string') {
				this.state.setGlobalParameter(parameter, value, 'confirmed')
			}
			return
		}

		const page4 = /^\/4\/([A-Za-z][A-Za-z0-9]*?)(Val)?$/.exec(message.address)
		if (page4 && this.context.roomEqOutput !== undefined && this.context.roomEqSide) {
			const target: MixerChannelTarget = { bus: 'output', index: this.context.roomEqOutput }
			const parameter = page4[1]
			const stateParameter =
				parameter === 'leftChannel' || parameter === 'rightChannel'
					? `roomEq:${parameter}`
					: `roomEq:${this.context.roomEqSide}:${parameter}`
			const value = message.args[0]
			if (page4[2] === 'Val' && typeof value === 'string') {
				this.state.setChannelParameterDisplay(target, stateParameter, value)
			} else if (typeof value === 'number') {
				this.state.setChannelParameter(
					target,
					stateParameter,
					roomEqToggleParameters.has(parameter) ? value >= 0.5 : value,
					'confirmed',
				)
			}
			return
		}

		const page2 = /^\/2\/([A-Za-z][A-Za-z0-9]*?)(Val)?$/.exec(message.address)
		if (page2) {
			const pendingGain = this.getPendingLegacyGain()
			const target = pendingGain?.target ?? this.selectedPage2Target()
			if (!target) return
			const parameter = page2[1]
			const value = message.args[0]
			if (pendingGain && parameter !== 'gain') return
			if (page2[2] === 'Val' && typeof value === 'string') {
				if (pendingGain && !pendingGain.numericConfirmed) return
				this.state.setChannelParameterDisplay(target, parameter, value)
				if (pendingGain) this.clearPendingLegacyGain(pendingGain)
			} else if (typeof value === 'number') {
				if (pendingGain) {
					if (Math.abs(pendingGain.value - value) > 0.0001) return
					pendingGain.numericConfirmed = true
				}
				this.state.setChannelParameter(
					target,
					parameter,
					page2ToggleParameters.has(parameter) ? value >= 0.5 : value,
					'confirmed',
				)
			} else if (typeof value === 'string') {
				this.state.setChannelParameter(target, parameter, value, 'confirmed')
			}
			return
		}

		const controlRoom = /^\/1\/([A-Za-z][A-Za-z0-9]*)$/.exec(message.address)
		if (controlRoom && controlRoomParameters.has(controlRoom[1]) && typeof message.args[0] === 'number') {
			this.state.setGlobalParameter(controlRoom[1], message.args[0] >= 0.5, 'confirmed')
			return
		}

		const volume = /^\/1\/volume(\d+)$/.exec(message.address)
		if (volume && typeof message.args[0] === 'number') {
			this.storeVolume(Number(volume[1]), message.args[0])
			return
		}

		const volumeDisplay = /^\/1\/volume(\d+)Val$/.exec(message.address)
		if (volumeDisplay && typeof message.args[0] === 'string') {
			this.storeVolumeDisplay(Number(volumeDisplay[1]), message.args[0])
			return
		}

		const pan = /^\/1\/pan(\d+)$/.exec(message.address)
		if (pan && typeof message.args[0] === 'number') {
			this.storePan(Number(pan[1]), message.args[0])
			return
		}

		const panDisplay = /^\/1\/pan(\d+)Val$/.exec(message.address)
		if (panDisplay && typeof message.args[0] === 'string') {
			this.storePanDisplay(Number(panDisplay[1]), message.args[0])
			return
		}

		const mute = /^\/1\/mute\/1\/(\d+)$/.exec(message.address)
		if (mute && typeof message.args[0] === 'number') {
			const target = this.channelAtSlot(Number(mute[1]))
			if (target?.bus === 'output') {
				this.state.setChannelParameter(target, 'mute', message.args[0] >= 0.5, 'confirmed')
			} else if (target?.bus === 'input' || target?.bus === 'playback') {
				this.state.setMute({ bus: target.bus, index: target.index }, message.args[0] >= 0.5, 'confirmed')
			}
			return
		}

		const solo = /^\/1\/solo\/1\/(\d+)$/.exec(message.address)
		if (solo && typeof message.args[0] === 'number') {
			const target = this.sourceAtSlot(Number(solo[1]))
			if (target) this.state.setSolo(target, message.args[0] >= 0.5, 'confirmed')
			return
		}

		const trackName = /^\/1\/trackname(\d+)$/.exec(message.address)
		if (trackName && typeof message.args[0] === 'string') {
			const target = this.channelAtSlot(Number(trackName[1]))
			if (target) this.state.setChannelName(target, message.args[0])
			return
		}

		const phantom = /^\/1\/phantom\/1\/(\d+)$/.exec(message.address)
		if (phantom && typeof message.args[0] === 'number' && this.context.bankStart !== undefined) {
			const target: MixerChannelTarget = { bus: 'input', index: this.context.bankStart + Number(phantom[1]) - 1 }
			this.state.setChannelParameter(target, 'phantom', message.args[0] >= 0.5, 'confirmed')
			return
		}

		const level = /^\/1\/level(\d+)(Left|Right)(Val)?$/.exec(message.address)
		if (level) {
			const target = this.channelAtSlot(Number(level[1]))
			if (!target) return
			const side = level[2] === 'Left' ? 'left' : 'right'
			const value = message.args[0]
			if (level[3] === 'Val' && typeof value === 'string') this.state.setChannelLevelDisplay(target, side, value)
			else if (typeof value === 'number') this.state.setChannelLevel(target, side, value, 'confirmed')
		}
	}

	private handleGlobalMessage(message: OscMessage): boolean {
		const value = message.args[0]
		const status = /^\/status\/(device|connection|dsp)$/.exec(message.address)
		if (status && (typeof value === 'number' || typeof value === 'string')) {
			if (status[1] === 'device' && typeof value === 'string') this.state.setDetectedDevice(value)
			this.state.setGlobalParameter(`status:${status[1]}`, value, 'confirmed')
			return true
		}

		const snapshot = /^\/snapshot\/load\/(\d+)$/.exec(message.address)
		if (snapshot && typeof value === 'number') {
			this.state.setSnapshot(Number(snapshot[1]), value >= 2, 'confirmed')
			return true
		}

		const level = /^\/level\/(in|pb|out)\/(\d+)$/.exec(message.address)
		if (level && typeof value === 'number') {
			const bus: MixerBus = level[1] === 'in' ? 'input' : level[1] === 'pb' ? 'playback' : 'output'
			const target = { bus, index: Number(level[2]) }
			this.state.observeGlobalChannel(target, 'level')
			this.state.setChannelLevel(target, 'left', value, 'confirmed')
			this.state.setChannelLevelDisplay(target, 'left', formatDb(value))
			return true
		}

		const mix = /^\/mix\/(in|pb)\/(\d+)\/(\d+)\/(fader|faderlin|balpan|solo|groupflags)$/.exec(message.address)
		if (mix && typeof value === 'number') {
			const target: SubmixTarget = {
				bus: mix[1] === 'in' ? 'input' : 'playback',
				index: Number(mix[2]),
				output: Number(mix[3]),
			}
			this.state.observeGlobalChannel(target, `mix/${mix[4]}`)
			this.state.observeGlobalChannel({ bus: 'output', index: target.output }, 'mix/destination')
			if (mix[4] === 'faderlin') this.state.setRoute(target, clampNormalized(value), 'confirmed')
			else if (mix[4] === 'fader') this.state.setRoute(target, dbToNormalized(value), 'confirmed', formatDb(value))
			else if (mix[4] === 'balpan') this.state.setRoutePan(target, clampNormalized((value + 1) / 2), 'confirmed')
			else this.state.setChannelParameter(target, `mix:${mix[4]}`, value, 'confirmed')
			return true
		}

		const channel = /^\/(input|playback|output)\/(\d+)\/(.+)$/.exec(message.address)
		if (channel && (typeof value === 'number' || typeof value === 'string')) {
			const target: MixerChannelTarget = { bus: channel[1] as MixerBus, index: Number(channel[2]) }
			const path = channel[3]
			this.state.observeGlobalChannel(target, path)
			if (path === 'name' && typeof value === 'string') this.state.setChannelName(target, value)
			else if (path === 'color' && typeof value === 'number') this.state.setChannelColor(target, value)
			else if (path === 'mute' && target.bus !== 'output' && typeof value === 'number')
				this.state.setMute({ bus: target.bus, index: target.index }, value >= 0.5, 'confirmed')
			else if (path === 'pfl' && target.bus !== 'output' && typeof value === 'number')
				this.state.setSolo({ bus: target.bus, index: target.index }, value >= 0.5, 'confirmed')
			else if (path === 'faderlin' && target.bus === 'output' && typeof value === 'number')
				this.state.setOutput(target.index, clampNormalized(value), 'confirmed')
			else if (path === 'volume' && target.bus === 'output' && typeof value === 'number')
				this.state.setOutput(target.index, dbToNormalized(value), 'confirmed', formatDb(value))
			else if (path === 'balpan' && target.bus === 'output' && typeof value === 'number')
				this.state.setOutputPan(target.index, clampNormalized((value + 1) / 2), 'confirmed')
			else if (path.startsWith('roomeq/') && typeof value === 'number') {
				const suffix = path.slice('roomeq/'.length)
				const parameter = this.roomEqParameterFromGlobalPath(suffix)
				this.storeGlobalRoomEqParameter(target, parameter, value)
			} else if (target.bus === 'output' && (path === 'delay' || path === 'gain') && typeof value === 'number') {
				this.storeGlobalRoomEqParameter(target, path === 'delay' ? 'reqDelay' : 'reqVolumeCorr', value)
			} else {
				const parameter = globalChannelPathParameters.get(path) ?? path
				const binary = page2ToggleParameters.has(parameter)
				this.state.setChannelParameter(
					target,
					parameter,
					typeof value === 'number' && binary ? value >= 0.5 : value,
					'confirmed',
					typeof value === 'number' && !binary ? String(value) : undefined,
				)
				if ((path === 'phase' || path === 'gain') && target.index > 0) {
					const leftTarget = { bus: target.bus, index: target.index - 1 }
					if (this.state.getChannelParameter<boolean>(leftTarget, 'stereo').value === true) {
						this.state.setChannelParameter(
							leftTarget,
							path === 'phase' ? 'phaseRight' : 'gainRight',
							typeof value === 'number' && path === 'phase' ? value >= 0.5 : value,
							'confirmed',
							typeof value === 'number' && path === 'gain' ? String(value) : undefined,
						)
					}
				}
			}
			return true
		}

		const globalParameter = globalControlRoomParameters.get(message.address) ?? globalFxParameters.get(message.address)
		if (globalParameter && typeof value === 'number') {
			if (globalFxParameters.has(message.address)) this.state.observeGlobalCapability('globalFx')
			const binary = controlRoomParameters.has(globalParameter) || globalFxToggleParameters.has(globalParameter)
			this.state.setGlobalParameter(globalParameter, binary ? value >= 0.5 : value, 'confirmed', String(value))
			return true
		}

		const duRec = /^\/durec\/(time|state)$/.exec(message.address)
		if (duRec && (typeof value === 'string' || typeof value === 'number')) {
			this.state.observeGlobalCapability('duRec')
			this.state.setGlobalParameter(duRec[1] === 'time' ? 'recordTime' : 'recordState', value, 'confirmed')
			return true
		}

		const group = /^\/(mute|solo|fader)group\/(\d+)$/.exec(message.address)
		if (group && typeof value === 'number') {
			const type = group[1] === 'solo' ? 'pfl' : group[1]
			this.state.setGlobalParameter(`group:${type}:${group[2]}`, value >= 0.5, 'confirmed')
			return true
		}

		return false
	}

	async setSubmixFader(target: SubmixTarget, value: number, unit: FaderUnit): Promise<void> {
		return this.queue.run(async () => {
			const normalized = unit === 'db' ? dbToNormalized(value) : clampNormalized(value)
			if (this.isGlobalOsc) {
				await this.sendOsc(`/mix/${globalMixSegment(target.bus)}/${target.index}/${target.output}/faderlin`, normalized)
				this.state.setRoute(target, normalized, 'optimistic', formatDb(normalizedToDb(normalized)))
				return
			}
			await this.writeLegacySubmixValue(target, 'fader', normalized)
		})
	}

	async adjustSubmixFader(target: SubmixTarget, amount: number, unit: FaderUnit): Promise<void> {
		return this.queue.run(async () => {
			let current = this.state.getRoute(target)
			if (!this.isUsable(current)) {
				await this.syncSubmixFaderInternal(target)
				current = this.state.getRoute(target)
			}
			if (current.value === undefined) throw new Error('No fader state received from TotalMix')
			const normalized =
				unit === 'db' ? dbToNormalized(normalizedToDb(current.value) + amount) : clampNormalized(current.value + amount)
			if (this.isGlobalOsc) {
				await this.sendOsc(`/mix/${globalMixSegment(target.bus)}/${target.index}/${target.output}/faderlin`, normalized)
				this.state.setRoute(target, normalized, 'optimistic', formatDb(normalizedToDb(normalized)))
				return
			}
			await this.writeLegacySubmixValue(target, 'fader', normalized)
		})
	}

	async setOutputFader(output: number, value: number, unit: FaderUnit): Promise<void> {
		return this.queue.run(async () => {
			const normalized = unit === 'db' ? dbToNormalized(value) : clampNormalized(value)
			if (this.isGlobalOsc) {
				await this.sendOsc(`/output/${output}/faderlin`, normalized)
				this.state.setOutput(output, normalized, 'optimistic', formatDb(normalizedToDb(normalized)))
				return
			}
			await this.writeLegacyOutputValue(output, 'fader', normalized)
		})
	}

	async adjustOutputFader(output: number, amount: number, unit: FaderUnit): Promise<void> {
		return this.queue.run(async () => {
			let current = this.state.getOutput(output)
			if (!this.isUsable(current)) {
				await this.syncOutputInternal(output)
				current = this.state.getOutput(output)
			}
			if (current.value === undefined) throw new Error('No output fader state received from TotalMix')
			const normalized =
				unit === 'db' ? dbToNormalized(normalizedToDb(current.value) + amount) : clampNormalized(current.value + amount)
			if (this.isGlobalOsc) {
				await this.sendOsc(`/output/${output}/faderlin`, normalized)
				this.state.setOutput(output, normalized, 'optimistic', formatDb(normalizedToDb(normalized)))
				return
			}
			await this.writeLegacyOutputValue(output, 'fader', normalized)
		})
	}

	async setMute(target: SourceTarget, operation: BinaryOperation): Promise<void> {
		return this.setBinary(target, operation, 'mute')
	}

	async setSolo(target: SourceTarget, operation: BinaryOperation): Promise<void> {
		return this.setBinary(target, operation, 'solo')
	}

	async recallSnapshot(snapshot: number): Promise<void> {
		return this.queue.run(async () => {
			if (!Number.isInteger(snapshot) || snapshot < 1 || snapshot > 8) throw new Error(`Invalid snapshot: ${snapshot}`)
			await this.sendOsc(this.isGlobalOsc ? `/snapshot/load/${snapshot}` : `/3/snapshots/${9 - snapshot}/1`, 1)
			this.state.setActiveSnapshot(snapshot, 'optimistic')
			this.invalidateContext()
		})
	}

	async saveSnapshot(snapshot: number): Promise<void> {
		return this.queue.run(async () => {
			if (!this.isGlobalOsc) throw new Error('Saving snapshots requires TotalMix Global OSC')
			if (!Number.isInteger(snapshot) || snapshot < 1 || snapshot > 8) throw new Error(`Invalid snapshot: ${snapshot}`)
			await this.sendOsc(`/snapshot/save/${snapshot}`, 1)
		})
	}

	async loadLayoutPreset(layout: number): Promise<void> {
		return this.queue.run(async () => {
			if (!this.isGlobalOsc) throw new Error('Layout presets require TotalMix Global OSC')
			if (!Number.isInteger(layout) || layout < 1 || layout > 6) throw new Error(`Invalid layout preset: ${layout}`)
			await this.sendOsc(`/layout/load/${layout}`, 1)
		})
	}

	async showWindow(show: boolean): Promise<void> {
		return this.queue.run(async () => {
			if (!this.isGlobalOsc) throw new Error('Window control requires TotalMix Global OSC')
			await this.sendOsc('/showwindow', show ? 1 : 0)
		})
	}

	async setChannelName(target: MixerChannelTarget, name: string): Promise<void> {
		return this.queue.run(async () => {
			if (!this.isGlobalOsc) throw new Error('Renaming channels requires TotalMix Global OSC')
			await this.sendOsc(`/${globalBusSegment(target.bus)}/${target.index}/name`, name)
			this.state.setChannelName(target, name)
		})
	}

	async loadQuickWorkspace(workspace: number): Promise<void> {
		return this.queue.run(async () => {
			if (!Number.isInteger(workspace) || workspace < 1 || workspace > 30)
				throw new Error(`Invalid Quick Workspace: ${workspace}`)
			await this.sendOsc('/loadQuickWorkspace', workspace)
			this.invalidateContext()
		})
	}

	async setGroup(type: GroupType, group: number, operation: BinaryOperation): Promise<void> {
		return this.queue.run(async () => {
			if (!Number.isInteger(group) || group < 1 || group > 4) throw new Error(`Invalid ${type} group: ${group}`)
			const stateKey = `group:${type}:${group}`
			let current = this.state.getGlobalParameter<boolean>(stateKey)
			if (!this.isUsable(current)) {
				await this.syncGroupInternal(type, group)
				current = this.state.getGlobalParameter<boolean>(stateKey)
			}
			if (operation === 'toggle' && current.value === undefined)
				throw new Error(`No ${type} group ${group} state received from TotalMix`)
			const desired = operation === 'on' || (operation === 'toggle' && !current.value)
			if (current.value === desired) return
			if (this.isGlobalOsc) {
				const groupName = type === 'pfl' ? 'sologroup' : `${type}group`
				await this.sendOsc(`/${groupName}/${group}`, desired ? 1 : 0)
				this.state.setGlobalParameter(stateKey, desired, 'optimistic')
				return
			}
			await this.sendOsc(`/3/${groupAddressNames[type]}/${5 - group}/1`, 1)
			this.state.setGlobalParameter(stateKey, desired, 'optimistic')
		})
	}

	async undoRedo(command: 'undo' | 'redo'): Promise<void> {
		return this.queue.run(async () => {
			await this.sendOsc(this.isGlobalOsc ? `/${command}` : `/3/${command}`, 1)
			this.invalidateContext()
		})
	}

	async duRecTransport(command: 'recordStop' | 'record' | 'playPause' | 'stop' | 'next' | 'previous'): Promise<void> {
		return this.queue.run(async () => {
			if (command === 'recordStop') {
				const state = await this.getCurrentDuRecState()
				command = String(state.value).toLowerCase() === 'record' ? 'stop' : 'record'
			}
			if (this.isGlobalOsc) {
				let globalCommand: 'record' | 'play' | 'pause' | 'stop' | 'next' | 'previous'
				if (command === 'playPause') {
					const state = await this.getCurrentDuRecState()
					globalCommand = state.value === 'Play' ? 'pause' : 'play'
				} else globalCommand = command
				await this.sendOsc(`/durec/${globalCommand}`, globalCommand === 'stop' ? 11 : 1)
				if (globalCommand === 'record') {
					this.state.setGlobalParameter('recordState', 'Record', 'optimistic')
					this.state.setGlobalParameter('recordTime', '00:00:00', 'optimistic')
				} else if (globalCommand === 'play') this.state.setGlobalParameter('recordState', 'Play', 'optimistic')
				else if (globalCommand === 'pause') this.state.setGlobalParameter('recordState', 'Pause', 'optimistic')
				else if (globalCommand === 'stop') this.state.setGlobalParameter('recordState', 'Stop', 'optimistic')
				if (globalCommand !== 'next' && globalCommand !== 'previous') {
					// DURec passes through a short Not ready state after Stop and can
					// still return the preceding transport state when queried too early.
					await this.delay(500)
					await this.sendOsc('/sendstate', 1)
				}
				return
			}
			if (command === 'next' || command === 'previous') throw new Error(`${command} requires TotalMix Global OSC`)
			const address = {
				record: '/3/recordRecordStart',
				playPause: '/3/recordPlayPause',
				stop: '/3/recordStop',
			}[command]
			await this.sendOsc(address, 1)
			if (command === 'stop') {
				// Legacy TotalMix uses the first Stop trigger to open its recording
				// confirmation and the second trigger to confirm it.
				await this.delay()
				await this.sendOsc(address, 1)
			}
			this.invalidateContext()
		})
	}

	private async getCurrentDuRecState(): Promise<ValueState<string>> {
		let state = this.state.getGlobalParameter<string>('recordState')
		if (this.isUsable(state) && Date.now() - state.updatedAt < 1000) return state
		const previousUpdatedAt = state.updatedAt
		await this.sendOsc(this.isGlobalOsc ? '/sendstate' : '/3/recordStop', this.isGlobalOsc ? 1 : 0)
		try {
			await this.waitFor(() => {
				const current = this.state.getGlobalParameter('recordState')
				return current.quality === 'confirmed' && current.updatedAt > previousUpdatedAt
			})
		} catch (error) {
			if (!this.isUsable(state)) throw error
		}
		state = this.state.getGlobalParameter<string>('recordState')
		return state
	}

	async syncDuRec(): Promise<void> {
		return this.queue.run(async () => {
			if (this.isGlobalOsc) {
				await this.sendOsc('/sendstate', 1)
				return
			}
			// A zero value selects Page 3 and requests current DURec state without triggering Stop.
			await this.sendOsc('/3/recordStop', 0)
		})
	}

	async setGlobalFxOption(parameter: 'reverbEnable' | 'echoEnable', operation: BinaryOperation): Promise<void> {
		return this.queue.run(async () => {
			let current = this.state.getGlobalParameter<boolean>(parameter)
			if (!this.isUsable(current)) {
				await this.syncGlobalFxParameterInternal(parameter)
				current = this.state.getGlobalParameter<boolean>(parameter)
			}
			if (current.value === undefined) throw new Error(`No ${parameter} state received from TotalMix`)
			const desired = operation === 'on' || (operation === 'toggle' && !current.value)
			if (current.value === desired) return
			await this.sendOsc(
				this.isGlobalOsc ? globalFxPaths[parameter] : `/3/${parameter}`,
				this.isGlobalOsc ? (desired ? 1 : 0) : 1,
			)
			this.state.setGlobalParameter(parameter, desired, 'optimistic')
		})
	}

	async setGlobalFxParameter(parameter: string, value: number): Promise<void> {
		return this.queue.run(async () => {
			const sentValue = this.isGlobalOsc ? value : clampNormalized(value)
			await this.sendOsc(
				this.isGlobalOsc ? (globalFxPaths[parameter] ?? `/${parameter}`) : `/3/${parameter}`,
				sentValue,
			)
			this.state.setGlobalParameter(parameter, sentValue, 'optimistic', this.isGlobalOsc ? String(value) : undefined)
			this.invalidateContext()
		})
	}

	async syncGlobalFx(): Promise<void> {
		return this.queue.run(async () => {
			await this.sendOsc(this.isGlobalOsc ? '/sendsettings' : '/3/reverbEnable', this.isGlobalOsc ? 1 : 0)
		})
	}

	async setRoomEqOption(output: number, side: RoomEqSide, operation: BinaryOperation): Promise<void> {
		return this.queue.run(async () => {
			const target: MixerChannelTarget = { bus: 'output', index: output }
			const parameter = `roomEq:${side}:reqEnable`
			if (this.isGlobalOsc) {
				let current = this.state.getChannelParameter<boolean>(target, parameter)
				if (operation === 'toggle' && !this.isUsable(current)) {
					await this.syncChannelParameterInternal(target, parameter)
					current = this.state.getChannelParameter<boolean>(target, parameter)
				}
				if (operation === 'toggle' && current.value === undefined)
					throw new Error('No Room EQ state received from TotalMix')
				const desired = operation === 'on' || (operation === 'toggle' && !current.value)
				for (const index of this.roomEqOutputIndices(output, side))
					await this.sendOsc(`/output/${index}/roomeq/enable`, desired ? 1 : 0)
				this.state.setChannelParameter(target, parameter, desired, 'optimistic')
				return
			}
			await this.selectRoomEqOutput(output, side)
			await this.waitFor(() => this.state.getChannelParameter(target, parameter).quality === 'confirmed')
			const current = this.state.getChannelParameter<boolean>(target, parameter)
			if (current.value === undefined) throw new Error('No Room EQ enable state received from TotalMix')
			const desired = operation === 'on' || (operation === 'toggle' && !current.value)
			if (current.value === desired) return
			await this.sendOsc('/4/reqEnable', 1)
			this.state.setChannelParameter(target, parameter, desired, 'optimistic')
		})
	}

	async setRoomEqParameter(output: number, side: RoomEqSide, parameter: string, value: number): Promise<void> {
		return this.queue.run(async () => {
			const target: MixerChannelTarget = { bus: 'output', index: output }
			const normalized = clampNormalized(value)
			if (this.isGlobalOsc) {
				const path = this.roomEqGlobalPath(parameter)
				for (const index of this.roomEqOutputIndices(output, side))
					await this.sendOsc(`/output/${index}/${path}`, value)
				this.state.setChannelParameter(target, `roomEq:${side}:${parameter}`, value, 'optimistic', String(value))
				return
			}
			await this.selectRoomEqOutput(output, side)
			await this.sendOsc(`/4/${parameter}`, normalized)
			this.state.setChannelParameter(target, `roomEq:${side}:${parameter}`, normalized, 'optimistic')
		})
	}

	async syncRoomEqParameter(output: number, side: RoomEqSide, parameter: string): Promise<void> {
		return this.queue.run(async () => {
			if (this.isGlobalOsc) {
				await this.sendOsc(`/sendchan/output/${side === 'right' ? output + 1 : output}`, 1)
				return
			}
			const target: MixerChannelTarget = { bus: 'output', index: output }
			await this.selectRoomEqOutput(output, side)
			await this.waitFor(
				() => this.state.getChannelParameter(target, `roomEq:${side}:${parameter}`).quality === 'confirmed',
			)
		})
	}

	async syncSnapshots(): Promise<void> {
		return this.queue.run(async () => {
			if (this.isGlobalOsc) {
				await this.sendOsc('/sendsettings', 1)
				return
			}
			// A zero value selects Page 3 and requests its state dump without recalling a snapshot.
			await this.sendOsc('/3/snapshots/8/1', 0)
			await this.waitFor(() =>
				Array.from({ length: 8 }, (_, index) => this.state.getSnapshot(index + 1)).every(
					(snapshot) => snapshot.quality === 'confirmed',
				),
			)
		})
	}

	async syncGroups(): Promise<void> {
		return this.queue.run(async () => {
			if (this.isGlobalOsc) {
				await this.sendOsc('/sendall', 2)
				return
			}
			// A zero value selects Page 3 and requests all group states without toggling a group.
			await this.sendOsc('/3/muteGroups/4/1', 0)
		})
	}

	async setInputGain(input: number, value: number): Promise<void> {
		return this.queue.run(async () => {
			const target: MixerChannelTarget = { bus: 'input', index: input }
			if (this.isGlobalOsc) {
				await this.sendOsc(`/input/${input}/gain`, value)
				this.state.setChannelParameter(target, 'gain', value, 'optimistic', String(value))
				return
			}
			const normalized = clampNormalized(value)
			await this.writeLegacyGain(target, normalized)
		})
	}

	async adjustInputGain(input: number, amount: number): Promise<void> {
		return this.queue.run(async () => {
			const target: MixerChannelTarget = { bus: 'input', index: input }
			let current = this.state.getChannelParameter<number>(target, 'gain')
			if (!this.isUsable(current)) {
				await this.syncChannelParameterInternal(target, 'gain')
				current = this.state.getChannelParameter<number>(target, 'gain')
			}
			if (current.value === undefined) throw new Error('No input gain state received from TotalMix')
			const normalized = this.isGlobalOsc ? current.value + amount : clampNormalized(current.value + amount)
			if (this.isGlobalOsc) {
				await this.sendOsc(`/input/${input}/gain`, normalized)
				this.state.setChannelParameter(target, 'gain', normalized, 'optimistic', String(normalized))
				return
			}
			if (normalized === current.value) return
			await this.writeLegacyGain(target, normalized)
		})
	}

	async setChannelOption(target: MixerChannelTarget, parameter: string, operation: BinaryOperation): Promise<void> {
		return this.queue.run(async () => {
			let current = this.state.getChannelParameter<boolean>(target, parameter)
			if (!this.isUsable(current)) {
				await this.syncChannelParameterInternal(target, parameter)
				current = this.state.getChannelParameter<boolean>(target, parameter)
			}
			if (current.value === undefined) throw new Error(`No ${parameter} state received from TotalMix`)
			const desired = operation === 'on' || (operation === 'toggle' && !current.value)
			if (current.value === desired) return
			if (this.isGlobalOsc) {
				const { target: resolvedTarget, path } = this.globalChannelParameterTarget(target, parameter)
				if (!path) throw new Error(`${parameter} is not available in TotalMix Global OSC`)
				await this.sendOsc(`/${globalBusSegment(resolvedTarget.bus)}/${resolvedTarget.index}/${path}`, desired ? 1 : 0)
				this.state.setChannelParameter(target, parameter, desired, 'optimistic')
				return
			}
			if (parameter === 'mute' && target.bus === 'output') {
				const slot = await this.selectOutput(target.index)
				await this.sendOsc(`/1/mute/1/${slot}`, desired ? 1 : 0)
				this.state.setChannelParameter(target, parameter, desired, 'optimistic')
				return
			}
			await this.writeLegacyPage2Parameter(target, parameter, 1, desired)
		})
	}

	async setChannelParameterValue(target: MixerChannelTarget, parameter: string, value: number): Promise<void> {
		return this.queue.run(async () => {
			if (this.isGlobalOsc) {
				const { target: resolvedTarget, path } = this.globalChannelParameterTarget(target, parameter)
				if (!path) throw new Error(`${parameter} is not available in TotalMix Global OSC`)
				await this.sendOsc(`/${globalBusSegment(resolvedTarget.bus)}/${resolvedTarget.index}/${path}`, value)
				this.state.setChannelParameter(target, parameter, value, 'optimistic', String(value))
				return
			}
			const normalized = clampNormalized(value)
			await this.writeLegacyPage2Parameter(target, parameter, normalized, normalized)
		})
	}

	async setChannelParameterDirect(target: MixerChannelTarget, parameter: string, value: number): Promise<void> {
		return this.queue.run(async () => {
			if (!Number.isInteger(value)) throw new Error(`${parameter} must be an integer`)
			if (parameter === 'refLevel' && (value < 0 || value > 3)) throw new Error('refLevel must be between 0 and 3')
			if (this.isGlobalOsc) {
				const resolved = this.globalChannelParameterTarget(target, parameter)
				if (!resolved.path) throw new Error(`${parameter} is not available in TotalMix Global OSC`)
				await this.sendOsc(`/${globalBusSegment(resolved.target.bus)}/${resolved.target.index}/${resolved.path}`, value)
				this.state.setChannelParameter(target, parameter, value, 'optimistic')
				return
			}
			await this.writeLegacyPage2Parameter(target, parameter, value, value)
		})
	}

	async syncChannelParameter(target: MixerChannelTarget, parameter: string): Promise<void> {
		return this.queue.run(async () => this.syncChannelParameterInternal(target, parameter))
	}

	async setSubmixPan(target: SubmixTarget, value: number): Promise<void> {
		return this.queue.run(async () => {
			const normalized = this.panToNormalized(value)
			if (this.isGlobalOsc) {
				await this.sendOsc(
					`/mix/${globalMixSegment(target.bus)}/${target.index}/${target.output}/balpan`,
					normalized * 2 - 1,
				)
				this.state.setRoutePan(target, normalized, 'optimistic')
				return
			}
			await this.writeLegacySubmixValue(target, 'pan', normalized)
		})
	}

	async adjustSubmixPan(target: SubmixTarget, amount: number): Promise<void> {
		return this.queue.run(async () => {
			let current = this.state.getRoutePan(target)
			if (!this.isUsable(current)) {
				await this.syncSubmixPanInternal(target)
				current = this.state.getRoutePan(target)
			}
			if (current.value === undefined) throw new Error('No pan state received from TotalMix')
			const normalized = clampNormalized(current.value + amount / 200)
			if (this.isGlobalOsc) {
				await this.sendOsc(
					`/mix/${globalMixSegment(target.bus)}/${target.index}/${target.output}/balpan`,
					normalized * 2 - 1,
				)
				this.state.setRoutePan(target, normalized, 'optimistic')
				return
			}
			await this.writeLegacySubmixValue(target, 'pan', normalized)
		})
	}

	async setOutputPan(output: number, value: number): Promise<void> {
		return this.queue.run(async () => {
			const normalized = this.panToNormalized(value)
			if (this.isGlobalOsc) {
				await this.sendOsc(`/output/${output}/balpan`, normalized * 2 - 1)
				this.state.setOutputPan(output, normalized, 'optimistic')
				return
			}
			await this.writeLegacyOutputValue(output, 'pan', normalized)
		})
	}

	async adjustOutputPan(output: number, amount: number): Promise<void> {
		return this.queue.run(async () => {
			let current = this.state.getOutputPan(output)
			if (!this.isUsable(current)) {
				await this.syncOutputPanInternal(output)
				current = this.state.getOutputPan(output)
			}
			if (current.value === undefined) throw new Error('No output balance state received from TotalMix')
			const normalized = clampNormalized(current.value + amount / 200)
			if (this.isGlobalOsc) {
				await this.sendOsc(`/output/${output}/balpan`, normalized * 2 - 1)
				this.state.setOutputPan(output, normalized, 'optimistic')
				return
			}
			await this.writeLegacyOutputValue(output, 'pan', normalized)
		})
	}

	async setControlRoom(parameter: string, operation: BinaryOperation): Promise<void> {
		return this.queue.run(async () => {
			if (!controlRoomParameters.has(parameter)) throw new Error(`Unsupported Control Room function: ${parameter}`)
			let current = this.state.getGlobalParameter<boolean>(parameter)
			if (!this.isUsable(current)) {
				await this.syncGlobalParameterInternal(parameter)
				current = this.state.getGlobalParameter<boolean>(parameter)
			}
			if (current.value === undefined) throw new Error(`No ${parameter} state received from TotalMix`)
			const desired = operation === 'on' || (operation === 'toggle' && !current.value)
			if (current.value === desired) return
			const address = this.isGlobalOsc ? globalControlRoomPaths[parameter] : `/1/${parameter}`
			if (!address) throw new Error(`${parameter} is not available in TotalMix Global OSC`)
			await this.sendOsc(address, this.isGlobalOsc ? (desired ? 1 : 0) : 1)
			this.state.setGlobalParameter(parameter, desired, 'optimistic')
		})
	}

	async recallMainOutputVolume(): Promise<void> {
		return this.queue.run(async () => this.sendOsc(this.isGlobalOsc ? '/controlroom/recall' : '/1/mainRecall', 1))
	}

	async syncControlRoom(): Promise<void> {
		return this.queue.run(async () => {
			await this.sendOsc(this.isGlobalOsc ? '/sendsettings' : '/1/busInput', 1)
		})
	}

	async syncChannelNames(bus: MixerBus, maximumChannels: number): Promise<void> {
		return this.queue.run(async () => {
			if (this.isGlobalOsc) {
				await this.sendOsc('/sendsettings', 1)
				return
			}
			this.state.clearChannelNames(bus)
			for (let bankStart = 0; bankStart < maximumChannels; bankStart += this.options.bankSize) {
				await this.selectBank(bankStart)
				await this.selectBus(bus)
			}
		})
	}

	async syncSubmixFader(target: SubmixTarget): Promise<void> {
		return this.queue.run(async () => this.syncSubmixFaderInternal(target))
	}

	async syncChannel(target: SourceTarget): Promise<void> {
		return this.queue.run(async () => {
			if (this.isGlobalOsc) {
				await this.sendOsc(`/sendchan/${target.bus}/${target.index}`, 1)
				return
			}
			await this.selectSource(target)
			await this.requestDump(target.bus)
			await this.waitFor(() => {
				const channel = this.state.getChannel(target)
				return channel.mute.quality === 'confirmed' && channel.solo.quality === 'confirmed'
			})
		})
	}

	async syncOutputFader(output: number): Promise<void> {
		return this.queue.run(async () => this.syncOutputInternal(output))
	}

	private async setBinary(target: SourceTarget, operation: BinaryOperation, kind: 'mute' | 'solo'): Promise<void> {
		return this.queue.run(async () => {
			let current = this.state.getChannel(target)[kind]
			if (operation === 'toggle' && !this.isUsable(current)) {
				if (this.isGlobalOsc) await this.sendOsc(`/sendchan/${target.bus}/${target.index}`, 1)
				else {
					await this.selectSource(target)
					await this.requestDump(target.bus)
				}
				await this.waitFor(() => this.state.getChannel(target)[kind].quality === 'confirmed')
				current = this.state.getChannel(target)[kind]
			}
			if (operation === 'toggle' && current.value === undefined)
				throw new Error(`No ${kind} state received from TotalMix`)
			const desired = operation === 'on' || (operation === 'toggle' && !current.value)
			if (this.isGlobalOsc) {
				await this.sendOsc(`/${target.bus}/${target.index}/${kind === 'solo' ? 'pfl' : 'mute'}`, desired ? 1 : 0)
				if (kind === 'mute') this.state.setMute(target, desired, 'optimistic')
				else this.state.setSolo(target, desired, 'optimistic')
				return
			}
			const slot = await this.selectSource(target)
			await this.sendOsc(`/1/${kind}/1/${slot}`, desired ? 1 : 0)
			if (kind === 'mute') this.state.setMute(target, desired, 'optimistic')
			else this.state.setSolo(target, desired, 'optimistic')
		})
	}

	private async syncSubmixFaderInternal(target: SubmixTarget): Promise<void> {
		if (this.isGlobalOsc) {
			await this.sendOsc(`/sendsubmix/${target.output}`, 1)
			await this.waitFor(() => this.state.getRoute(target).quality === 'confirmed')
			return
		}
		await this.selectSource(target, target.output)
		await this.requestDump(target.bus)
		await this.waitFor(() => this.state.getRoute(target).quality === 'confirmed')
	}

	private async syncOutputInternal(output: number): Promise<void> {
		if (this.isGlobalOsc) {
			await this.sendOsc(`/sendchan/output/${output}`, 1)
			await this.waitFor(() => this.state.getOutput(output).quality === 'confirmed')
			return
		}
		await this.selectOutput(output)
		await this.requestDump('output')
		await this.waitFor(() => this.state.getOutput(output).quality === 'confirmed')
	}

	private async syncSubmixPanInternal(target: SubmixTarget): Promise<void> {
		if (this.isGlobalOsc) {
			await this.sendOsc(`/sendsubmix/${target.output}`, 1)
			await this.waitFor(() => this.state.getRoutePan(target).quality === 'confirmed')
			return
		}
		await this.selectSource(target, target.output)
		await this.requestDump(target.bus)
		await this.waitFor(() => this.state.getRoutePan(target).quality === 'confirmed')
	}

	private async syncOutputPanInternal(output: number): Promise<void> {
		if (this.isGlobalOsc) {
			await this.sendOsc(`/sendchan/output/${output}`, 1)
			await this.waitFor(() => this.state.getOutputPan(output).quality === 'confirmed')
			return
		}
		await this.selectOutput(output)
		await this.requestDump('output')
		await this.waitFor(() => this.state.getOutputPan(output).quality === 'confirmed')
	}

	private async syncGlobalParameterInternal(parameter: string): Promise<void> {
		await this.sendOsc(this.isGlobalOsc ? '/sendsettings' : '/1/busInput', 1)
		await this.waitFor(() => this.state.getGlobalParameter(parameter).quality === 'confirmed')
	}

	private async syncGlobalFxParameterInternal(parameter: string): Promise<void> {
		await this.sendOsc(this.isGlobalOsc ? '/sendsettings' : '/3/reverbEnable', this.isGlobalOsc ? 1 : 0)
		await this.waitFor(() => this.state.getGlobalParameter(parameter).quality === 'confirmed')
	}

	private async syncGroupInternal(type: GroupType, group: number): Promise<void> {
		if (this.isGlobalOsc) {
			await this.sendOsc('/sendsettings', 1)
			await this.waitFor(() => this.state.getGlobalParameter(`group:${type}:${group}`).quality === 'confirmed')
			return
		}
		await this.sendOsc(`/3/${groupAddressNames[type]}/${5 - group}/1`, 0)
		await this.waitFor(() => this.state.getGlobalParameter(`group:${type}:${group}`).quality === 'confirmed')
	}

	private async writeLegacySubmixValue(target: SubmixTarget, parameter: 'fader' | 'pan', value: number): Promise<void> {
		const key = this.routeWriteKey(target, parameter)
		this.markInteractiveValue(key, value)
		if (parameter === 'fader') this.state.setRoute(target, value, 'optimistic', formatDb(normalizedToDb(value)))
		else this.state.setRoutePan(target, value, 'optimistic')
		try {
			const slot = await this.selectSourceForWrite(target, target.output)
			await this.sendOsc(`/1/${parameter === 'fader' ? 'volume' : 'pan'}${slot}`, value)
		} catch (error) {
			this.pendingInteractiveValues.delete(key)
			throw error
		}
	}

	private async writeLegacyOutputValue(output: number, parameter: 'fader' | 'pan', value: number): Promise<void> {
		const key = this.outputWriteKey(output, parameter)
		this.markInteractiveValue(key, value)
		if (parameter === 'fader') this.state.setOutput(output, value, 'optimistic', formatDb(normalizedToDb(value)))
		else this.state.setOutputPan(output, value, 'optimistic')
		try {
			const slot = await this.selectOutputForWrite(output)
			await this.sendOsc(`/1/${parameter === 'fader' ? 'volume' : 'pan'}${slot}`, value)
		} catch (error) {
			this.pendingInteractiveValues.delete(key)
			throw error
		}
	}

	private async writeLegacyGain(target: MixerChannelTarget, value: number): Promise<void> {
		const key = this.channelParameterWriteKey(target, 'gain')
		this.markInteractiveValue(key, value)
		this.pendingLegacyGain = {
			target,
			key,
			value,
			expiresAt: Date.now() + 350,
			numericConfirmed: false,
		}
		this.state.setChannelParameter(target, 'gain', value, 'optimistic')
		try {
			await this.selectPage2ChannelForWrite(target)
			await this.sendOsc('/2/gain', value)
		} catch (error) {
			this.pendingInteractiveValues.delete(key)
			if (this.pendingLegacyGain?.key === key) this.pendingLegacyGain = undefined
			throw error
		}
	}

	private async selectSourceForWrite(target: SourceTarget, submix: number): Promise<number> {
		const { bankStart, slot } = resolveSlot(target.index, this.options.bankSize)
		this.context.submix = submix
		await this.sendOsc('/setSubmix', submix)
		await this.selectBankForWrite(bankStart)
		await this.selectBusForWrite(target.bus)
		return slot
	}

	private async selectOutputForWrite(output: number): Promise<number> {
		const { bankStart, slot } = resolveSlot(output, this.options.bankSize)
		await this.selectBankForWrite(bankStart)
		await this.selectBusForWrite('output')
		return slot
	}

	private async selectPage2ChannelForWrite(target: MixerChannelTarget): Promise<void> {
		const { bankStart, slot } = resolveSlot(target.index, this.options.bankSize)
		await this.selectBankForWrite(bankStart)
		this.context.offsetInBank = slot - 1
		await this.sendOsc('/setOffsetInBank', slot - 1)
		await this.selectBusForWrite(target.bus, 2)
	}

	private async selectBankForWrite(bankStart: number): Promise<void> {
		this.context.bankStart = bankStart
		this.context.offsetInBank = 0
		await this.sendOsc('/setBankStart', bankStart)
	}

	private async selectBusForWrite(bus: MixerBus, page = 1): Promise<void> {
		this.context.bus = bus
		await this.sendOsc(`/${page}/bus${bus[0].toUpperCase()}${bus.slice(1)}`, 1)
	}

	private async selectSource(target: SourceTarget, submix?: number): Promise<number> {
		const { bankStart, slot } = resolveSlot(target.index, this.options.bankSize)
		if (submix !== undefined) {
			this.context.submix = submix
			await this.sendOsc('/setSubmix', submix)
			await this.delay()
		}
		await this.selectBank(bankStart)
		await this.selectBus(target.bus)
		return slot
	}

	private async selectOutput(output: number): Promise<number> {
		const { bankStart, slot } = resolveSlot(output, this.options.bankSize)
		await this.selectBank(bankStart)
		await this.selectBus('output')
		return slot
	}

	private async selectBank(bankStart: number): Promise<void> {
		this.context.bankStart = bankStart
		// TotalMix resets the Page 2 channel offset to the first slot whenever the
		// bank is selected and immediately emits a state dump for that slot. Mirror
		// the reset before sending so the dump cannot be attributed to the channel
		// that was selected before this transaction.
		this.context.offsetInBank = 0
		await this.sendOsc('/setBankStart', bankStart)
		await this.delay()
	}

	private async selectBus(bus: MixerBus, page = 1): Promise<void> {
		this.context.bus = bus
		await this.sendOsc(`/${page}/bus${bus[0].toUpperCase()}${bus.slice(1)}`, 1)
		await this.delay()
	}

	private async selectPage2Channel(target: MixerChannelTarget): Promise<void> {
		const { bankStart, slot } = resolveSlot(target.index, this.options.bankSize)
		await this.selectBank(bankStart)
		this.context.offsetInBank = slot - 1
		await this.sendOsc('/setOffsetInBank', slot - 1)
		await this.delay()
		await this.selectBus(target.bus, 2)
	}

	private async selectRoomEqOutput(output: number, side: RoomEqSide): Promise<void> {
		const { bankStart, slot } = resolveSlot(output, this.options.bankSize)
		await this.selectBank(bankStart)
		this.context.offsetInBank = slot - 1
		this.context.bus = 'output'
		this.context.roomEqOutput = output
		this.context.roomEqSide = side
		await this.sendOsc('/setOffsetInBank', slot - 1)
		await this.delay()
		// Select Page 4 and request its current state without toggling Room EQ.
		await this.sendOsc('/4/reqEnable', 0)
		await this.delay()

		const target: MixerChannelTarget = { bus: 'output', index: output }
		await this.waitFor(
			() =>
				this.state.getChannelParameter(target, 'roomEq:leftChannel').quality === 'confirmed' &&
				this.state.getChannelParameter(target, 'roomEq:rightChannel').quality === 'confirmed',
		)
		const desiredLeft = side !== 'right'
		const desiredRight = side !== 'left'
		const currentLeft = this.state.getChannelParameter<boolean>(target, 'roomEq:leftChannel').value
		const currentRight = this.state.getChannelParameter<boolean>(target, 'roomEq:rightChannel').value
		if (currentLeft !== desiredLeft) {
			await this.sendOsc('/4/leftChannel', 1)
			this.state.setChannelParameter(target, 'roomEq:leftChannel', desiredLeft, 'optimistic')
		}
		if (currentRight !== desiredRight) {
			await this.sendOsc('/4/rightChannel', 1)
			this.state.setChannelParameter(target, 'roomEq:rightChannel', desiredRight, 'optimistic')
		}
	}

	private selectedPage2Target(): MixerChannelTarget | undefined {
		if (!this.context.bus || this.context.bankStart === undefined || this.context.offsetInBank === undefined)
			return undefined
		return { bus: this.context.bus, index: this.context.bankStart + this.context.offsetInBank }
	}

	private async syncChannelParameterInternal(target: MixerChannelTarget, parameter: string): Promise<void> {
		if (this.isGlobalOsc) {
			const resolved = this.globalChannelParameterTarget(target, parameter)
			await this.sendOsc(`/sendchan/${resolved.target.bus}/${resolved.target.index}`, 1)
			await this.waitFor(() => this.state.getChannelParameter(target, parameter).quality === 'confirmed')
			return
		}
		const previousUpdate = this.state.getChannelParameter(target, parameter).updatedAt
		const previousDumpMarker = this.state.getChannelParameter(target, 'trackname').updatedAt
		if (parameter === 'mute' && target.bus === 'output') {
			await this.selectOutput(target.index)
			await this.requestDump('output')
			await this.waitForFreshChannelParameter(target, parameter, previousUpdate)
			await this.delay()
			return
		}
		await this.selectPage2Channel(target)
		await this.waitForFreshChannelParameter(target, parameter, previousUpdate)
		// Legacy Page 2 replies contain no channel index. Trackname is the final
		// mandatory setting in the documented block, so keep the selector context
		// stable until it arrives. Optional meter values may follow, but they are not
		// interpreted as channel-option state.
		await this.waitForFreshChannelParameter(target, 'trackname', previousDumpMarker)
	}

	private async waitForFreshChannelParameter(
		target: MixerChannelTarget,
		parameter: string,
		previousUpdate: number,
	): Promise<void> {
		await this.waitFor(() => {
			const state = this.state.getChannelParameter(target, parameter)
			return state.quality === 'confirmed' && state.updatedAt > previousUpdate
		})
	}

	private async writeLegacyPage2Parameter(
		target: MixerChannelTarget,
		parameter: string,
		sentValue: number,
		optimisticValue: number | boolean,
	): Promise<void> {
		const previousDumpMarker = this.state.getChannelParameter(target, 'trackname').updatedAt
		await this.selectPage2Channel(target)
		await this.waitForFreshChannelParameter(target, 'trackname', previousDumpMarker)

		const previousDisplayUpdate = this.state.getChannelParameter(target, parameter).displayUpdatedAt ?? 0
		this.state.setChannelParameter(target, parameter, optimisticValue, 'optimistic')
		const optimisticUpdate = this.state.getChannelParameter(target, parameter).updatedAt
		await this.sendOsc(`/2/${parameter}`, sentValue)
		await this.waitForFreshChannelParameter(target, parameter, optimisticUpdate)

		if (!page2ToggleParameters.has(parameter)) {
			await this.waitFor(
				() => (this.state.getChannelParameter(target, parameter).displayUpdatedAt ?? 0) > previousDisplayUpdate,
			)
		}
	}

	private async requestDump(bus: MixerBus): Promise<void> {
		await this.sendOsc(`/1/bus${bus[0].toUpperCase()}${bus.slice(1)}`, 1)
	}

	private storeVolume(slot: number, value: number): void {
		if (!this.context.bus || this.context.bankStart === undefined) return
		const index = this.context.bankStart + slot - 1
		if (this.context.bus === 'output') {
			if (!this.acceptInteractiveValue(this.outputWriteKey(index, 'fader'), value)) return
			this.state.setOutput(index, value, 'confirmed')
		} else if (this.context.submix !== undefined) {
			const target = { bus: this.context.bus, index, output: this.context.submix }
			if (!this.acceptInteractiveValue(this.routeWriteKey(target, 'fader'), value)) return
			this.state.setRoute(target, value, 'confirmed')
		}
	}

	private storeVolumeDisplay(slot: number, display: string): void {
		if (!this.context.bus || this.context.bankStart === undefined) return
		const index = this.context.bankStart + slot - 1
		if (this.context.bus === 'output') {
			if (this.hasPendingInteractiveValue(this.outputWriteKey(index, 'fader'))) return
			this.state.setOutputDisplay(index, display)
		} else if (this.context.submix !== undefined) {
			const target = { bus: this.context.bus, index, output: this.context.submix }
			if (this.hasPendingInteractiveValue(this.routeWriteKey(target, 'fader'))) return
			this.state.setRouteDisplay(target, display)
		}
	}

	private storePan(slot: number, value: number): void {
		if (!this.context.bus || this.context.bankStart === undefined) return
		const index = this.context.bankStart + slot - 1
		if (this.context.bus === 'output') {
			if (!this.acceptInteractiveValue(this.outputWriteKey(index, 'pan'), value)) return
			this.state.setOutputPan(index, value, 'confirmed')
		} else if (this.context.submix !== undefined) {
			const target = { bus: this.context.bus, index, output: this.context.submix }
			if (!this.acceptInteractiveValue(this.routeWriteKey(target, 'pan'), value)) return
			this.state.setRoutePan(target, value, 'confirmed')
		}
	}

	private storePanDisplay(slot: number, display: string): void {
		if (!this.context.bus || this.context.bankStart === undefined) return
		const index = this.context.bankStart + slot - 1
		if (this.context.bus === 'output') {
			if (this.hasPendingInteractiveValue(this.outputWriteKey(index, 'pan'))) return
			this.state.setOutputPanDisplay(index, display)
		} else if (this.context.submix !== undefined) {
			const target = { bus: this.context.bus, index, output: this.context.submix }
			if (this.hasPendingInteractiveValue(this.routeWriteKey(target, 'pan'))) return
			this.state.setRoutePanDisplay(target, display)
		}
	}

	private globalChannelParameterTarget(
		target: MixerChannelTarget,
		parameter: string,
	): { target: MixerChannelTarget; path?: string } {
		if (parameter === 'phaseRight' || parameter === 'gainRight') {
			return {
				target: { ...target, index: target.index + 1 },
				path: parameter === 'phaseRight' ? 'phase' : 'gain',
			}
		}
		if (parameter === 'noTrim') return { target }
		return { target, path: globalChannelParameterPaths[parameter] ?? parameter.toLowerCase() }
	}

	private roomEqGlobalPath(parameter: string): string {
		if (parameter === 'reqDelay') return 'delay'
		if (parameter === 'reqVolumeCorr') return 'gain'
		const match = /^req(Gain|Freq|Q|Type)([1-9])$/.exec(parameter)
		if (!match) throw new Error(`Unsupported Room EQ parameter: ${parameter}`)
		return `roomeq/band${match[2]}${match[1].toLowerCase()}`
	}

	private roomEqParameterFromGlobalPath(path: string): string {
		if (path === 'enable') return 'reqEnable'
		const match = /^band([1-9])(gain|freq|q|type)$/.exec(path)
		if (!match) return path
		const kind = match[2][0].toUpperCase() + match[2].slice(1)
		return `req${kind}${match[1]}`
	}

	private roomEqOutputIndices(output: number, side: RoomEqSide): number[] {
		if (side === 'left') return [output]
		if (side === 'right') return [output + 1]
		return [output, output + 1]
	}

	private routeWriteKey(target: SubmixTarget, parameter: 'fader' | 'pan'): string {
		return `route:${target.bus}:${target.index}:${target.output}:${parameter}`
	}

	private outputWriteKey(output: number, parameter: 'fader' | 'pan'): string {
		return `output:${output}:${parameter}`
	}

	private channelParameterWriteKey(target: MixerChannelTarget, parameter: string): string {
		return `channel:${target.bus}:${target.index}:${parameter}`
	}

	private markInteractiveValue(key: string, value: number): void {
		this.pendingInteractiveValues.set(key, { value, expiresAt: Date.now() + 350 })
	}

	private hasPendingInteractiveValue(key: string): boolean {
		const pending = this.pendingInteractiveValues.get(key)
		if (!pending) return false
		if (pending.expiresAt >= Date.now()) return true
		this.pendingInteractiveValues.delete(key)
		return false
	}

	private acceptInteractiveValue(key: string, value: number): boolean {
		const pending = this.pendingInteractiveValues.get(key)
		if (!pending) return true
		if (pending.expiresAt < Date.now()) {
			this.pendingInteractiveValues.delete(key)
			return true
		}
		if (Math.abs(pending.value - value) > 0.0001) return false
		this.pendingInteractiveValues.delete(key)
		return true
	}

	private expirePendingInteractiveValues(): void {
		const now = Date.now()
		for (const [key, pending] of this.pendingInteractiveValues) {
			if (pending.expiresAt < now) this.pendingInteractiveValues.delete(key)
		}
		this.getPendingLegacyGain()
	}

	private getPendingLegacyGain(): PendingLegacyGain | undefined {
		if (!this.pendingLegacyGain) return undefined
		if (this.pendingLegacyGain.expiresAt >= Date.now()) return this.pendingLegacyGain
		this.pendingInteractiveValues.delete(this.pendingLegacyGain.key)
		this.pendingLegacyGain = undefined
		return undefined
	}

	private clearPendingLegacyGain(pending: PendingLegacyGain): void {
		this.pendingInteractiveValues.delete(pending.key)
		if (this.pendingLegacyGain === pending) this.pendingLegacyGain = undefined
	}

	private storeGlobalRoomEqParameter(target: MixerChannelTarget, parameter: string, value: number): void {
		const storedValue: number | boolean = parameter === 'reqEnable' ? value >= 0.5 : value
		this.state.setChannelParameter(target, `roomEq:left:${parameter}`, storedValue, 'confirmed', String(value))
		if (target.index > 0) {
			const leftTarget: MixerChannelTarget = { bus: 'output', index: target.index - 1 }
			if (this.state.getChannelParameter<boolean>(leftTarget, 'stereo').value === true) {
				this.state.setChannelParameter(leftTarget, `roomEq:right:${parameter}`, storedValue, 'confirmed', String(value))
				const leftValue = this.state.getChannelParameter(leftTarget, `roomEq:left:${parameter}`).value
				if (leftValue === storedValue) {
					this.state.setChannelParameter(
						leftTarget,
						`roomEq:both:${parameter}`,
						storedValue,
						'confirmed',
						String(value),
					)
				}
			}
		}
	}

	private panToNormalized(value: number): number {
		return clampNormalized((value + 100) / 200)
	}

	private sourceAtSlot(slot: number): SourceTarget | undefined {
		if ((this.context.bus !== 'input' && this.context.bus !== 'playback') || this.context.bankStart === undefined)
			return undefined
		return { bus: this.context.bus, index: this.context.bankStart + slot - 1 }
	}

	private channelAtSlot(slot: number): MixerChannelTarget | undefined {
		if (!this.context.bus || this.context.bankStart === undefined) return undefined
		return { bus: this.context.bus, index: this.context.bankStart + slot - 1 }
	}

	private isUsable<T>(state: ValueState<T>): boolean {
		return (state.quality === 'confirmed' || state.quality === 'optimistic') && state.value !== undefined
	}

	private async delay(milliseconds = this.selectionDelayMs): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, milliseconds))
	}

	private async waitFor(predicate: () => boolean): Promise<void> {
		if (predicate()) return Promise.resolve()
		return new Promise((resolve, reject) => {
			const unsubscribe = this.state.subscribe(() => {
				if (!predicate()) return
				clearTimeout(timeout)
				unsubscribe()
				resolve()
			})
			const timeout = setTimeout(() => {
				unsubscribe()
				reject(new Error(`No matching OSC feedback within ${this.options.syncTimeoutMs} ms`))
			}, this.options.syncTimeoutMs)
		})
	}
}
