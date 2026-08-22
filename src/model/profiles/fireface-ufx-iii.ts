import type { DeviceProfile } from '../device-profile.js'
import { channels, inputGainRanges, numberedLabels } from './helpers.js'

const inputLabels = [
	...numberedLabels('AN', 8),
	...numberedLabels('Mic', 4, 9),
	'AES L',
	'AES R',
	...numberedLabels('ADAT', 16),
	...numberedLabels('MADI', 64),
]

const outputLabels = [
	...numberedLabels('AN', 8),
	...numberedLabels('PH', 4, 9),
	'AES L',
	'AES R',
	...numberedLabels('ADAT', 16),
	...numberedLabels('MADI', 64),
]

export const firefaceUfxIII: DeviceProfile = {
	id: 'fireface-ufx-iii',
	label: 'Fireface UFX III',
	inputs: channels(inputLabels),
	playbacks: channels(outputLabels),
	outputs: channels(outputLabels),
	capabilities: {
		inputGainChannels: Array.from({ length: 12 }, (_, index) => index),
		inputGainRanges: {
			...inputGainRanges(
				Array.from({ length: 8 }, (_, index) => index),
				0,
				12,
			),
			...inputGainRanges([8, 9, 10, 11], 0, 75, { min: 8, max: 50 }),
		},
		phantomChannels: [8, 9, 10, 11],
		instrumentChannels: [8, 9, 10, 11],
		padChannels: [],
		autosetChannels: [8, 9, 10, 11],
		duRec: true,
		channelFx: true,
		globalFx: true,
		roomEq: true,
	},
}
