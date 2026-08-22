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

export const fireface802Fs: DeviceProfile = {
	id: 'fireface-802-fs',
	label: 'Fireface 802 FS',
	inputs: channels(inputLabels),
	playbacks: channels(outputLabels),
	outputs: channels(outputLabels),
	capabilities: {
		inputGainChannels: Array.from({ length: 12 }, (_, index) => index),
		inputGainRanges: {
			...inputGainRanges(
				Array.from({ length: 8 }, (_, index) => index),
				0,
				12,
			),
			...inputGainRanges([8, 9, 10, 11], 6, 60),
		},
		phantomChannels: [8, 9, 10, 11],
		instrumentChannels: [8, 9, 10, 11],
		padChannels: [],
		autosetChannels: [],
		duRec: false,
		channelFx: true,
		globalFx: true,
		roomEq: true,
	},
}
