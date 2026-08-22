import type { DropdownChoice } from '@companion-module/base'
import { decodeSource, type SourceTarget, type SubmixTarget } from './model/device-profile.js'
import type { DeviceProfile } from './model/device-profile.js'

export function sourceChoices(profile: DeviceProfile): DropdownChoice[] {
	return [
		...profile.inputs.map((channel) => ({ id: `input:${channel.index}`, label: `Hardware input - ${channel.label}` })),
		...profile.playbacks.map((channel) => ({
			id: `playback:${channel.index}`,
			label: `Software playback - ${channel.label}`,
		})),
	]
}

export function outputChoices(profile: DeviceProfile): DropdownChoice[] {
	return profile.outputs.map((channel) => ({ id: channel.index, label: channel.label }))
}

export function sourceFromOptions(source: unknown): SourceTarget {
	const target = decodeSource(source)
	if (!target) throw new Error(`Invalid source: ${String(source)}`)
	return target
}

export function routeFromOptions(source: unknown, output: unknown): SubmixTarget {
	return { ...sourceFromOptions(source), output: asIndex(output, 'submix output') }
}

export function asIndex(value: unknown, label: string): number {
	const number = Number(value)
	if (!Number.isInteger(number) || number < 0) throw new Error(`Invalid ${label}: ${String(value)}`)
	return number
}

export function asNumber(value: unknown, label: string): number {
	const number = Number(value)
	if (!Number.isFinite(number)) throw new Error(`Invalid ${label}: ${String(value)}`)
	return number
}
