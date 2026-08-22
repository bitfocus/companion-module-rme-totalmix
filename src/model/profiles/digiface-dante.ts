import type { DeviceProfile } from '../device-profile.js'
import { channels, numberedLabels } from './helpers.js'

const networkLabels = numberedLabels('Dante', 64)
const madiLabels = numberedLabels('MADI', 64)
const sourceLabels = [...networkLabels, ...madiLabels]
const outputLabels = [...sourceLabels, 'PH 129', 'PH 130']

export const digifaceDante: DeviceProfile = {
	id: 'digiface-dante',
	label: 'Digiface Dante',
	inputs: channels(sourceLabels),
	playbacks: channels(sourceLabels),
	outputs: channels(outputLabels),
	capabilities: {
		inputGainChannels: [],
		phantomChannels: [],
		instrumentChannels: [],
		padChannels: [],
		autosetChannels: [],
		duRec: false,
		channelFx: false,
		globalFx: false,
		roomEq: false,
	},
}
