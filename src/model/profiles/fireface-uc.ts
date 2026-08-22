import type { DeviceProfile } from '../device-profile.js'
import { channels, inputGainRanges, numberedLabels } from './helpers.js'

const analogLabels = numberedLabels('AN', 8)
const spdifLabels = ['SPDIF L', 'SPDIF R']
const adatLabels = numberedLabels('ADAT', 8)
const sourceLabels = [...analogLabels, ...spdifLabels, ...adatLabels]
const outputLabels = [...numberedLabels('AN', 6), 'PH 7', 'PH 8', ...spdifLabels, ...adatLabels]

export const firefaceUc: DeviceProfile = {
	id: 'fireface-uc',
	label: 'Fireface UC',
	inputs: channels(sourceLabels),
	playbacks: channels(sourceLabels),
	outputs: channels(outputLabels),
	capabilities: {
		inputGainChannels: [0, 1, 2, 3],
		inputGainRanges: {
			...inputGainRanges([0, 1], 0, 65),
			...inputGainRanges([2, 3], 0, 18),
		},
		phantomChannels: [0, 1],
		instrumentChannels: [2, 3],
		padChannels: [2, 3],
		autosetChannels: [],
		duRec: false,
		channelFx: false,
		globalFx: false,
		roomEq: false,
	},
}
