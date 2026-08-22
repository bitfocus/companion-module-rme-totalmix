import type { DeviceProfile } from '../device-profile.js'
import { channels, inputGainRanges, numberedLabels } from './helpers.js'

const inputLabels = [...numberedLabels('AN', 8), 'SPDIF L', 'SPDIF R', 'AES L', 'AES R', ...numberedLabels('ADAT', 8)]

const outputLabels = [
	...numberedLabels('AN', 6),
	'PH 7',
	'PH 8',
	'SPDIF L',
	'SPDIF R',
	'AES L',
	'AES R',
	...numberedLabels('ADAT', 8),
]

export const firefaceUcxII: DeviceProfile = {
	id: 'fireface-ucx-ii',
	label: 'Fireface UCX II',
	inputs: channels(inputLabels),
	playbacks: channels(outputLabels),
	outputs: channels(outputLabels),
	capabilities: {
		inputGainChannels: Array.from({ length: 8 }, (_, index) => index),
		inputGainRanges: {
			...inputGainRanges([0, 1], 0, 75),
			...inputGainRanges([2, 3, 4, 5, 6, 7], 0, 12),
		},
		phantomChannels: [0, 1],
		instrumentChannels: [2, 3],
		padChannels: [],
		autosetChannels: [0, 1, 2, 3],
		duRec: true,
		channelFx: true,
		globalFx: true,
		roomEq: true,
	},
}
