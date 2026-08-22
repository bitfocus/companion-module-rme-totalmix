import type {
	ChannelDefinition,
	DeviceCapabilities,
	MixerBus,
	MixerChannelTarget,
	SourceTarget,
	SubmixTarget,
} from '../model/device-profile.js'
import { channelKey, outputKey, routeKey } from '../protocol/resolver.js'

export type StateQuality = 'unknown' | 'optimistic' | 'confirmed' | 'stale'

export interface ValueState<T> {
	value?: T
	quality: StateQuality
	updatedAt: number
	display?: string
	displayUpdatedAt?: number
}

export interface ChannelState {
	mute: ValueState<boolean>
	solo: ValueState<boolean>
	name?: string
	color?: number
	levelLeft: ValueState<number>
	levelRight: ValueState<number>
}

function unknown<T>(): ValueState<T> {
	return { quality: 'unknown', updatedAt: 0 }
}

export class TotalMixStateStore {
	private readonly routes = new Map<string, ValueState<number>>()
	private readonly outputs = new Map<string, ValueState<number>>()
	private readonly routePans = new Map<string, ValueState<number>>()
	private readonly outputPans = new Map<string, ValueState<number>>()
	private readonly channels = new Map<string, ChannelState>()
	private readonly snapshots = new Map<number, ValueState<boolean>>()
	private readonly channelParameters = new Map<string, ValueState<number | boolean | string>>()
	private readonly globalParameters = new Map<string, ValueState<number | boolean | string>>()
	private readonly discoveredChannels: Record<MixerBus, Set<number>> = {
		input: new Set(),
		playback: new Set(),
		output: new Set(),
	}
	private readonly discoveredInputCapabilities = {
		gain: new Set<number>(),
		phantom: new Set<number>(),
		instrument: new Set<number>(),
		pad: new Set<number>(),
		autoset: new Set<number>(),
	}
	private discoveredDuRec = false
	private discoveredChannelFx = false
	private discoveredGlobalFx = false
	private discoveredRoomEq = false
	private readonly listeners = new Set<() => void>()
	lastMessageAt = 0
	detectedDevice = ''
	discoveryRevision = 0

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener)
		return () => this.listeners.delete(listener)
	}

	touch(): void {
		this.lastMessageAt = Date.now()
	}

	getRoute(target: SubmixTarget): ValueState<number> {
		return this.routes.get(routeKey(target)) ?? unknown()
	}

	setRoute(target: SubmixTarget, value: number, quality: StateQuality, display?: string): void {
		this.routes.set(routeKey(target), {
			value,
			quality,
			display: display ?? this.getRoute(target).display,
			updatedAt: Date.now(),
		})
		this.emit()
	}

	setRouteDisplay(target: SubmixTarget, display: string): void {
		const current = this.getRoute(target)
		this.routes.set(routeKey(target), { ...current, display, updatedAt: Date.now() })
		this.emit()
	}

	getOutput(index: number): ValueState<number> {
		return this.outputs.get(outputKey(index)) ?? unknown()
	}

	setOutput(index: number, value: number, quality: StateQuality, display?: string): void {
		this.outputs.set(outputKey(index), {
			value,
			quality,
			display: display ?? this.getOutput(index).display,
			updatedAt: Date.now(),
		})
		this.emit()
	}

	setOutputDisplay(index: number, display: string): void {
		const current = this.getOutput(index)
		this.outputs.set(outputKey(index), { ...current, display, updatedAt: Date.now() })
		this.emit()
	}

	getRoutePan(target: SubmixTarget): ValueState<number> {
		return this.routePans.get(routeKey(target)) ?? unknown()
	}

	setRoutePan(target: SubmixTarget, value: number, quality: StateQuality, display?: string): void {
		this.routePans.set(routeKey(target), {
			value,
			quality,
			display: display ?? this.getRoutePan(target).display,
			updatedAt: Date.now(),
		})
		this.emit()
	}

	setRoutePanDisplay(target: SubmixTarget, display: string): void {
		const current = this.getRoutePan(target)
		this.routePans.set(routeKey(target), { ...current, display, updatedAt: Date.now() })
		this.emit()
	}

	getOutputPan(index: number): ValueState<number> {
		return this.outputPans.get(outputKey(index)) ?? unknown()
	}

	setOutputPan(index: number, value: number, quality: StateQuality, display?: string): void {
		this.outputPans.set(outputKey(index), {
			value,
			quality,
			display: display ?? this.getOutputPan(index).display,
			updatedAt: Date.now(),
		})
		this.emit()
	}

	setOutputPanDisplay(index: number, display: string): void {
		const current = this.getOutputPan(index)
		this.outputPans.set(outputKey(index), { ...current, display, updatedAt: Date.now() })
		this.emit()
	}

	getChannel(target: MixerChannelTarget): ChannelState {
		return (
			this.channels.get(channelKey(target)) ?? {
				mute: unknown(),
				solo: unknown(),
				levelLeft: unknown(),
				levelRight: unknown(),
			}
		)
	}

	setMute(target: SourceTarget, value: boolean, quality: StateQuality): void {
		const current = this.getChannel(target)
		this.channels.set(channelKey(target), {
			...current,
			mute: { value, quality, updatedAt: Date.now() },
		})
		this.emit()
	}

	setSolo(target: SourceTarget, value: boolean, quality: StateQuality): void {
		const current = this.getChannel(target)
		this.channels.set(channelKey(target), {
			...current,
			solo: { value, quality, updatedAt: Date.now() },
		})
		this.emit()
	}

	setChannelName(target: MixerChannelTarget, name: string): void {
		const current = this.getChannel(target)
		if (current.name === name) return
		this.channels.set(channelKey(target), { ...current, name })
		this.discoveryRevision++
		this.emit()
	}

	setChannelColor(target: MixerChannelTarget, color: number): void {
		const current = this.getChannel(target)
		if (current.color === color) return
		this.channels.set(channelKey(target), { ...current, color })
		this.discoveryRevision++
		this.emit()
	}

	setDetectedDevice(name: string): void {
		if (this.detectedDevice === name) return
		this.detectedDevice = name
		this.discoveryRevision++
		this.emit()
	}

	getNamedChannels(bus: MixerBus, maximum?: number): ChannelDefinition[] {
		const channels: ChannelDefinition[] = []
		for (const [key, channel] of this.channels) {
			if (!key.startsWith(`${bus}:`)) continue
			const index = Number(key.slice(bus.length + 1))
			if (!Number.isInteger(index) || (maximum !== undefined && index >= maximum)) continue
			const name = channel?.name
			if (name && name !== 'n.a.' && channel?.color !== 0) channels.push({ index, label: name })
		}
		return channels.sort((a, b) => a.index - b.index)
	}

	getDiscoveredChannels(bus: MixerBus, fallbackChannels: ChannelDefinition[] = []): ChannelDefinition[] {
		const fallbackLabels = new Map(fallbackChannels.map((channel) => [channel.index, channel.label]))
		return [...this.discoveredChannels[bus]]
			.sort((a, b) => a - b)
			.flatMap((index) => {
				const channel = this.channels.get(channelKey({ bus, index }))
				if (channel?.color === 0 || channel?.name === 'n.a.') return []
				if (index > 0) {
					const previousTarget = { bus, index: index - 1 }
					const previousStereo = this.getChannelParameter<boolean>(previousTarget, 'stereo').value
					const previousName = this.channels.get(channelKey(previousTarget))?.name
					const previousNameIsPair = previousStereo === undefined && /\d+\s*\/\s*\d+$/.test(previousName ?? '')
					if (previousStereo === true || previousNameIsPair) return []
				}
				const fallback = bus === 'input' ? 'Input' : bus === 'playback' ? 'Playback' : 'Output'
				return [{ index, label: channel?.name || fallbackLabels.get(index) || `${fallback} ${index + 1}` }]
			})
	}

	get hasGlobalDiscoveryData(): boolean {
		return Object.values(this.discoveredChannels).some((channels) => channels.size > 0)
	}

	getDiscoveredCapabilities(): DeviceCapabilities {
		const sorted = (values: Set<number>) => [...values].sort((a, b) => a - b)
		return {
			inputGainChannels: sorted(this.discoveredInputCapabilities.gain),
			phantomChannels: sorted(this.discoveredInputCapabilities.phantom),
			instrumentChannels: sorted(this.discoveredInputCapabilities.instrument),
			padChannels: sorted(this.discoveredInputCapabilities.pad),
			autosetChannels: sorted(this.discoveredInputCapabilities.autoset),
			duRec: this.discoveredDuRec,
			channelFx: this.discoveredChannelFx,
			globalFx: this.discoveredGlobalFx,
			roomEq: this.discoveredRoomEq,
		}
	}

	observeGlobalChannel(target: MixerChannelTarget, path: string): void {
		let changed = false
		const channels = this.discoveredChannels[target.bus]
		if (!channels.has(target.index)) {
			channels.add(target.index)
			changed = true
		}

		if (target.bus === 'input') {
			const capability =
				path === 'gain'
					? this.discoveredInputCapabilities.gain
					: path === '48v'
						? this.discoveredInputCapabilities.phantom
						: path === 'instrument'
							? this.discoveredInputCapabilities.instrument
							: path === 'pad'
								? this.discoveredInputCapabilities.pad
								: path === 'autoset'
									? this.discoveredInputCapabilities.autoset
									: undefined
			if (capability && !capability.has(target.index)) {
				capability.add(target.index)
				changed = true
			}
		}

		if (
			(path === 'fxsend' ||
				path === 'fxreturn' ||
				path.startsWith('lowcut/') ||
				path.startsWith('eq/') ||
				path.startsWith('dynamics/') ||
				path.startsWith('autolevel/')) &&
			!this.discoveredChannelFx
		) {
			this.discoveredChannelFx = true
			changed = true
		}
		if (target.bus === 'output' && path.startsWith('roomeq/') && !this.discoveredRoomEq) {
			this.discoveredRoomEq = true
			changed = true
		}
		if (changed) this.discoveryRevision++
	}

	observeGlobalCapability(capability: 'duRec' | 'globalFx'): void {
		if (capability === 'duRec') {
			if (this.discoveredDuRec) return
			this.discoveredDuRec = true
		} else {
			if (this.discoveredGlobalFx) return
			this.discoveredGlobalFx = true
		}
		this.discoveryRevision++
	}

	clearChannelNames(bus: MixerBus): void {
		let changed = false
		for (const [key, channel] of this.channels) {
			if (!key.startsWith(`${bus}:`) || channel.name === undefined) continue
			this.channels.set(key, { ...channel, name: undefined })
			changed = true
		}
		if (changed) this.emit()
	}

	setChannelLevel(target: MixerChannelTarget, side: 'left' | 'right', value: number, quality: StateQuality): void {
		const current = this.getChannel(target)
		const key = side === 'left' ? 'levelLeft' : 'levelRight'
		this.channels.set(channelKey(target), {
			...current,
			[key]: { value, quality, display: current[key].display, updatedAt: Date.now() },
		})
		this.emit()
	}

	setChannelLevelDisplay(target: MixerChannelTarget, side: 'left' | 'right', display: string): void {
		const current = this.getChannel(target)
		const key = side === 'left' ? 'levelLeft' : 'levelRight'
		this.channels.set(channelKey(target), {
			...current,
			[key]: { ...current[key], display, updatedAt: Date.now() },
		})
		this.emit()
	}

	getSnapshot(index: number): ValueState<boolean> {
		return this.snapshots.get(index) ?? unknown()
	}

	setSnapshot(index: number, active: boolean, quality: StateQuality): void {
		this.snapshots.set(index, { value: active, quality, updatedAt: Date.now() })
		this.emit()
	}

	setActiveSnapshot(index: number, quality: StateQuality): void {
		for (let snapshot = 1; snapshot <= 8; snapshot++) {
			this.snapshots.set(snapshot, { value: snapshot === index, quality, updatedAt: Date.now() })
		}
		this.emit()
	}

	get activeSnapshot(): number | undefined {
		for (let snapshot = 1; snapshot <= 8; snapshot++) {
			if (this.snapshots.get(snapshot)?.value === true) return snapshot
		}
		return undefined
	}

	getChannelParameter<T extends number | boolean | string>(
		target: MixerChannelTarget,
		parameter: string,
	): ValueState<T> {
		return (
			(this.channelParameters.get(`${target.bus}:${target.index}:${parameter}`) as ValueState<T> | undefined) ??
			unknown()
		)
	}

	setChannelParameter(
		target: MixerChannelTarget,
		parameter: string,
		value: number | boolean | string,
		quality: StateQuality,
		display?: string,
	): void {
		const current = this.getChannelParameter(target, parameter)
		const discoveryChanged = parameter === 'stereo' && current.value !== value
		this.channelParameters.set(`${target.bus}:${target.index}:${parameter}`, {
			value,
			quality,
			display: display ?? current.display,
			displayUpdatedAt:
				display === undefined ? current.displayUpdatedAt : Math.max(Date.now(), (current.displayUpdatedAt ?? 0) + 1),
			updatedAt: Math.max(Date.now(), current.updatedAt + 1),
		})
		if (discoveryChanged) this.discoveryRevision++
		this.emit()
	}

	setChannelParameterDisplay(target: MixerChannelTarget, parameter: string, display: string): void {
		const current = this.getChannelParameter(target, parameter)
		this.channelParameters.set(`${target.bus}:${target.index}:${parameter}`, {
			...current,
			display,
			displayUpdatedAt: Math.max(Date.now(), (current.displayUpdatedAt ?? 0) + 1),
			updatedAt: Math.max(Date.now(), current.updatedAt + 1),
		})
		this.emit()
	}

	getGlobalParameter<T extends number | boolean | string>(parameter: string): ValueState<T> {
		return (this.globalParameters.get(parameter) as ValueState<T> | undefined) ?? unknown()
	}

	setGlobalParameter(
		parameter: string,
		value: number | boolean | string,
		quality: StateQuality,
		display?: string,
	): void {
		const current = this.getGlobalParameter(parameter)
		this.globalParameters.set(parameter, {
			value,
			quality,
			display: display ?? current.display,
			updatedAt: Math.max(Date.now(), current.updatedAt + 1),
		})
		this.emit()
	}

	setGlobalParameterDisplay(parameter: string, display: string): void {
		const current = this.getGlobalParameter(parameter)
		this.globalParameters.set(parameter, { ...current, display, updatedAt: Date.now() })
		this.emit()
	}

	markStale(): void {
		for (const [key, value] of this.routes) this.routes.set(key, { ...value, quality: 'stale' })
		for (const [key, value] of this.outputs) this.outputs.set(key, { ...value, quality: 'stale' })
		for (const [key, value] of this.routePans) this.routePans.set(key, { ...value, quality: 'stale' })
		for (const [key, value] of this.outputPans) this.outputPans.set(key, { ...value, quality: 'stale' })
		for (const [key, value] of this.channels) {
			this.channels.set(key, {
				...value,
				mute: { ...value.mute, quality: 'stale' },
				solo: { ...value.solo, quality: 'stale' },
				levelLeft: { ...value.levelLeft, quality: 'stale' },
				levelRight: { ...value.levelRight, quality: 'stale' },
			})
		}
		for (const [key, value] of this.snapshots) this.snapshots.set(key, { ...value, quality: 'stale' })
		for (const [key, value] of this.channelParameters) {
			this.channelParameters.set(key, { ...value, quality: 'stale' })
		}
		for (const [key, value] of this.globalParameters) {
			this.globalParameters.set(key, { ...value, quality: 'stale' })
		}
		this.emit()
	}

	private emit(): void {
		for (const listener of this.listeners) listener()
	}
}
