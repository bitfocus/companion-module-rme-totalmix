import type { DeviceProfile } from '../device-profile.js'
import { channels, inputGainRanges, numberedLabels } from './helpers.js'

const inputLabels = [...numberedLabels('AN', 8), 'SPDIF L', 'SPDIF R', ...numberedLabels('ADAT', 8)]
const outputLabels = [...numberedLabels('AN', 6), 'PH 7', 'PH 8', 'SPDIF L', 'SPDIF R', ...numberedLabels('ADAT', 8)]

export const firefaceUcx: DeviceProfile = {
	id: 'fireface-ucx',
	label: 'Fireface UCX',
	inputs: channels(inputLabels),
	playbacks: channels(outputLabels),
	outputs: channels(outputLabels),
	capabilities: {
		inputGainChannels: [0, 1, 2, 3],
		inputGainRanges: {
			...inputGainRanges([0, 1], 0, 65),
			...inputGainRanges([2, 3], 0, 12),
		},
		phantomChannels: [0, 1],
		instrumentChannels: [2, 3],
		padChannels: [],
		autosetChannels: [0, 1, 2, 3],
		duRec: false,
		channelFx: true,
		globalFx: true,
		roomEq: false,
	},
}
