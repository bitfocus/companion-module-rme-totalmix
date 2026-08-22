import type { MixerChannelTarget, SubmixTarget } from '../model/device-profile.js'

export interface ResolvedSlot {
	bankStart: number
	slot: number
}

export function resolveSlot(channelIndex: number, bankSize: number): ResolvedSlot {
	if (!Number.isInteger(channelIndex) || channelIndex < 0)
		throw new Error('Channel index must be a non-negative integer')
	if (!Number.isInteger(bankSize) || bankSize < 1) throw new Error('Bank size must be a positive integer')
	const bankStart = Math.floor(channelIndex / bankSize) * bankSize
	return { bankStart, slot: channelIndex - bankStart + 1 }
}

export function routeKey(target: SubmixTarget): string {
	return `${target.bus}:${target.index}:${target.output}`
}

export function channelKey(target: MixerChannelTarget): string {
	return `${target.bus}:${target.index}`
}

export function outputKey(index: number): string {
	return String(index)
}
