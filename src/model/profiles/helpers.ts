import type { ChannelDefinition, InputGainRange } from '../device-profile.js'

export function channels(labels: string[]): ChannelDefinition[] {
	return labels.map((label, index) => ({ index, label }))
}

export function numberedLabels(prefix: string, count: number, start = 1): string[] {
	return Array.from({ length: count }, (_, index) => `${prefix} ${index + start}`)
}

export function inputGainRanges(
	indices: number[],
	min: number,
	max: number,
	instrument?: InputGainRange['instrument'],
): Record<number, InputGainRange> {
	return Object.fromEntries(indices.map((index) => [index, { min, max, ...(instrument ? { instrument } : {}) }]))
}
