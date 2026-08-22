import type { DeviceProfile } from '../device-profile.js'
import { channels, numberedLabels } from './helpers.js'

const inputLabels = ['AES L', 'AES R', ...numberedLabels('MADI', 192)]
const outputLabels = ['AES L', 'AES R', 'PH 3', 'PH 4', ...numberedLabels('MADI', 192)]

export const hdspeMadiFx: DeviceProfile = {
	id: 'hdspe-madi-fx',
	label: 'HDSPe MADI FX',
	inputs: channels(inputLabels),
	playbacks: channels(outputLabels),
	outputs: channels(outputLabels),
	capabilities: {
		inputGainChannels: [],
		phantomChannels: [],
		instrumentChannels: [],
		padChannels: [],
		autosetChannels: [],
		duRec: false,
		channelFx: true,
		globalFx: true,
		roomEq: true,
	},
}
