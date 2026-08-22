import type { DeviceProfile } from '../device-profile.js'
import { channels, inputGainRanges, numberedLabels } from './helpers.js'

const inputLabels = ['AES L', 'AES R', 'SPDIF L', 'SPDIF R', 'Mic 1', 'Mic 2', ...numberedLabels('ADAT', 8)]

const outputLabels = [
	'AES L',
	'AES R',
	'SPDIF L',
	'SPDIF R',
	'AN 5',
	'AN 6',
	'PH 7',
	'PH 8',
	...numberedLabels('ADAT', 8),
]

export const digifaceAes: DeviceProfile = {
	id: 'digiface-aes',
	label: 'Digiface AES',
	inputs: channels(inputLabels),
	playbacks: channels(outputLabels),
	outputs: channels(outputLabels),
	capabilities: {
		inputGainChannels: [4, 5],
		inputGainRanges: inputGainRanges([4, 5], 0, 75),
		phantomChannels: [4, 5],
		instrumentChannels: [],
		padChannels: [4, 5],
		autosetChannels: [4, 5],
		duRec: false,
		// Digiface AES provides channel EQ and Low Cut, but not the complete processing block
		// represented by the module's combined legacy processing actions.
		channelFx: false,
		globalFx: false,
		roomEq: false,
	},
}
