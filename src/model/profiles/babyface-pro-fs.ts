import type { DeviceProfile } from '../device-profile.js'
import { channels, inputGainRanges, numberedLabels } from './helpers.js'

const analogLabels = numberedLabels('AN', 4)
const adatLabels = numberedLabels('ADAT', 8)
const sourceLabels = [...analogLabels, ...adatLabels]
const outputLabels = ['AN 1', 'AN 2', 'PH 3', 'PH 4', ...adatLabels]

export const babyfaceProFs: DeviceProfile = {
	id: 'babyface-pro-fs',
	label: 'Babyface Pro FS',
	inputs: channels(sourceLabels),
	playbacks: channels(sourceLabels),
	outputs: channels(outputLabels),
	capabilities: {
		inputGainChannels: [0, 1, 2, 3],
		inputGainRanges: {
			...inputGainRanges([0, 1], -11, 65),
			...inputGainRanges([2, 3], 0, 9),
		},
		phantomChannels: [0, 1],
		// Inputs 3/4 are permanently Hi-Z; TotalMix does not expose an Instrument switch for them.
		instrumentChannels: [],
		padChannels: [0, 1],
		autosetChannels: [],
		duRec: false,
		channelFx: true,
		globalFx: true,
		roomEq: true,
	},
}
