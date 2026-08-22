import type { DeviceProfile } from '../device-profile.js'
import { channels, inputGainRanges, numberedLabels } from './helpers.js'

const inputLabels = [...numberedLabels('AN', 2), ...numberedLabels('ADAT', 8)]
const outputLabels = ['AN 1', 'AN 2', 'PH 3', 'PH 4', ...numberedLabels('ADAT', 8)]

export const babyface: DeviceProfile = {
	id: 'babyface',
	label: 'Babyface',
	inputs: channels(inputLabels),
	playbacks: channels(outputLabels),
	outputs: channels(outputLabels),
	capabilities: {
		inputGainChannels: [0, 1],
		inputGainRanges: inputGainRanges([0, 1], 9, 60),
		phantomChannels: [0, 1],
		instrumentChannels: [1],
		padChannels: [],
		autosetChannels: [],
		duRec: false,
		channelFx: false,
		globalFx: true,
		roomEq: false,
	},
}
