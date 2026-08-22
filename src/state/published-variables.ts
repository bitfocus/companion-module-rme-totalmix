import type { MixerChannelTarget, SubmixTarget } from '../model/device-profile.js'
import type { RoomEqSide } from '../protocol/controller.js'

export type PublishedChannelField = 'name' | 'mute' | 'pfl' | 'levelLeft' | 'levelRight'
export type PublishedFaderUnit = 'db' | 'normalized'

export type PublishedVariableTarget =
	| { kind: 'channel'; target: MixerChannelTarget; field: PublishedChannelField }
	| { kind: 'routeFader'; target: SubmixTarget; unit: PublishedFaderUnit }
	| { kind: 'routePan'; target: SubmixTarget }
	| { kind: 'outputFader'; output: number; unit: PublishedFaderUnit }
	| { kind: 'outputPan'; output: number }
	| { kind: 'channelParameter'; target: MixerChannelTarget; parameter: string }
	| { kind: 'roomEqParameter'; output: number; side: RoomEqSide; parameter: string }

function safeId(value: string): string {
	return value
		.replace(/([a-z0-9])([A-Z])/g, '$1_$2')
		.replace(/[^A-Za-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '')
		.toLowerCase()
}

function channelId(target: MixerChannelTarget): string {
	return `${target.bus}_${target.index + 1}`
}

function routeId(target: SubmixTarget): string {
	return `route_${target.bus}_${target.index + 1}_to_output_${target.output + 1}`
}

export function publishedVariableId(target: PublishedVariableTarget): string {
	switch (target.kind) {
		case 'channel':
			return `${channelId(target.target)}_${safeId(target.field)}`
		case 'routeFader':
			return `${routeId(target.target)}_fader_${target.unit}`
		case 'routePan':
			return `${routeId(target.target)}_pan`
		case 'outputFader':
			return `output_${target.output + 1}_fader_${target.unit}`
		case 'outputPan':
			return `output_${target.output + 1}_pan`
		case 'channelParameter':
			return `${channelId(target.target)}_${safeId(target.parameter)}`
		case 'roomEqParameter':
			return `output_${target.output + 1}_room_eq_${target.side}_${safeId(target.parameter)}`
	}
}

export class PublishedVariableRegistry {
	private readonly targets = new Map<string, PublishedVariableTarget>()

	register(target: PublishedVariableTarget): boolean {
		const key = publishedVariableId(target)
		if (this.targets.has(key)) return false
		this.targets.set(key, target)
		return true
	}

	values(): PublishedVariableTarget[] {
		return [...this.targets.values()].sort((left, right) =>
			publishedVariableId(left).localeCompare(publishedVariableId(right)),
		)
	}
}
