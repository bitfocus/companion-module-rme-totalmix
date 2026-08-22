import type { DeviceProfile } from '../device-profile.js'
import { channels, numberedLabels } from './helpers.js'

const channelLabels = numberedLabels('AES', 16)

export const hdspeAes: DeviceProfile = {
	id: 'hdspe-aes',
	label: 'HDSPe AES',
	inputs: channels(channelLabels),
	playbacks: channels(channelLabels),
	outputs: channels(channelLabels),
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
