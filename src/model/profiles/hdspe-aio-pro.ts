import type { DeviceProfile } from '../device-profile.js'
import { channels, numberedLabels } from './helpers.js'

const inputLabels = ['AN 1', 'AN 2', 'AES L', 'AES R', 'SPDIF L', 'SPDIF R', ...numberedLabels('ADAT', 8)]

const outputLabels = [
	'AN 1',
	'AN 2',
	'PH 3',
	'PH 4',
	'AES L',
	'AES R',
	'SPDIF L',
	'SPDIF R',
	...numberedLabels('ADAT', 8),
]

export const hdspeAioPro: DeviceProfile = {
	id: 'hdspe-aio-pro',
	label: 'HDSPe AIO Pro',
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
		channelFx: false,
		globalFx: false,
		roomEq: false,
	},
}
