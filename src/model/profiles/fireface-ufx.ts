import type { DeviceProfile } from '../device-profile.js'
import { channels, inputGainRanges, numberedLabels } from './helpers.js'

const inputLabels = [
	...numberedLabels('AN', 8),
	...numberedLabels('Mic', 4, 9),
	'AES L',
	'AES R',
	...numberedLabels('ADAT', 16),
]

const outputLabels = [
	...numberedLabels('AN', 8),
	...numberedLabels('PH', 4, 9),
	'AES L',
	'AES R',
	...numberedLabels('ADAT', 16),
]

export const firefaceUfx: DeviceProfile = {
	id: 'fireface-ufx',
	label: 'Fireface UFX',
	inputs: channels(inputLabels),
	playbacks: channels(outputLabels),
	outputs: channels(outputLabels),
	capabilities: {
		inputGainChannels: [8, 9, 10, 11],
		inputGainRanges: inputGainRanges([8, 9, 10, 11], 0, 65, { min: 10, max: 65 }),
		phantomChannels: [8, 9, 10, 11],
		instrumentChannels: [8, 9, 10, 11],
		padChannels: [],
		autosetChannels: [8, 9, 10, 11],
		duRec: true,
		channelFx: true,
		globalFx: true,
		roomEq: false,
	},
}
