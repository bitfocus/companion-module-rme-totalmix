export type MixerBus = 'input' | 'playback' | 'output'

export interface ChannelDefinition {
	index: number
	label: string
}

export interface InputGainRange {
	min: number
	max: number
	step?: number
	instrument?: {
		min: number
		max: number
		step?: number
	}
}

export interface DeviceCapabilities {
	inputGainChannels: number[]
	inputGainRanges?: Record<number, InputGainRange>
	phantomChannels: number[]
	instrumentChannels: number[]
	padChannels: number[]
	autosetChannels: number[]
	duRec: boolean
	channelFx: boolean
	globalFx: boolean
	roomEq: boolean
}

export interface DeviceProfile {
	id: string
	label: string
	inputs: ChannelDefinition[]
	playbacks: ChannelDefinition[]
	outputs: ChannelDefinition[]
	capabilities: DeviceCapabilities
}

export interface MixerChannelTarget {
	bus: MixerBus
	index: number
}

export interface SourceTarget {
	bus: 'input' | 'playback'
	index: number
}

export interface SubmixTarget extends SourceTarget {
	output: number
}

export function encodeSource(target: SourceTarget): string {
	return `${target.bus}:${target.index}`
}

export function decodeSource(value: unknown): SourceTarget | undefined {
	if (typeof value !== 'string') return undefined
	const match = /^(input|playback):(\d+)$/.exec(value)
	if (!match) return undefined
	return { bus: match[1] as SourceTarget['bus'], index: Number(match[2]) }
}
