import type { DeviceProfile } from '../device-profile.js'
import { channels, numberedLabels } from './helpers.js'

const channelLabels = [...numberedLabels('ADAT', 32), 'AES L', 'AES R', 'SPDIF L', 'SPDIF R']

export const hdspeRaydat: DeviceProfile = {
	id: 'hdspe-raydat',
	label: 'HDSPe RayDAT',
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
