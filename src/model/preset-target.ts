import { asIndex } from '../options.js'

export type PresetMixerTarget =
	{ row: 'input' | 'playback'; source: number; destination: number } | { row: 'output'; output: number }

export function stringifyPresetTarget(target: PresetMixerTarget): string {
	return target.row === 'output' ? `output:${target.output}` : `${target.row}:${target.source}:${target.destination}`
}

export function encodePresetTarget(options: Record<string, unknown>): string {
	const row = options.row === 'playback' ? 'playback' : options.row === 'output' ? 'output' : 'input'
	if (row === 'output') {
		return stringifyPresetTarget({ row, output: asIndex(options.output, 'hardware output') })
	}

	const source = asIndex(row === 'input' ? options.inputSource : options.playbackSource, `${row} source`)
	const destination = asIndex(options.destination, 'destination')
	return stringifyPresetTarget({ row, source, destination })
}

export function decodePresetTarget(value: unknown): PresetMixerTarget | undefined {
	if (value === undefined || value === null || value === '') return undefined

	let parsed: unknown = value
	if (typeof value === 'string') {
		const token = /^(input|playback):(\d+):(\d+)$/.exec(value)
		if (token) {
			return {
				row: token[1] as 'input' | 'playback',
				source: asIndex(token[2], `${token[1]} source`),
				destination: asIndex(token[3], 'destination'),
			}
		}
		const outputToken = /^output:(\d+)$/.exec(value)
		if (outputToken) return { row: 'output', output: asIndex(outputToken[1], 'hardware output') }

		try {
			parsed = JSON.parse(value)
		} catch {
			throw new Error('Invalid preset target')
		}
	}

	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid preset target')
	const target = parsed as Record<string, unknown>
	if (target.row === 'output') {
		return { row: 'output', output: asIndex(target.output, 'hardware output') }
	}
	if (target.row === 'input' || target.row === 'playback') {
		return {
			row: target.row,
			source: asIndex(target.source, `${target.row} source`),
			destination: asIndex(target.destination, 'destination'),
		}
	}

	throw new Error('Invalid preset target row')
}

export function presetTargetFromOptions(options: Record<string, unknown>): PresetMixerTarget | undefined {
	return decodePresetTarget(options.target)
}
