import type { DeviceProfile } from '../device-profile.js'
import { channels } from './helpers.js'

const inputLabels = [
	'AN 1',
	'AN 2',
	'AN 3',
	'AN 4',
	'AN 5',
	'AN 6',
	'AN 7',
	'AN 8',
	'Mic 9',
	'Mic 10',
	'Mic 11',
	'Mic 12',
	'AES L',
	'AES R',
	...Array.from({ length: 16 }, (_, index) => `ADAT ${index + 1}`),
]

const outputLabels = [
	'AN 1',
	'AN 2',
	'AN 3',
	'AN 4',
	'AN 5',
	'AN 6',
	'AN 7',
	'AN 8',
	'PH 9',
	'PH 10',
	'PH 11',
	'PH 12',
	'AES L',
	'AES R',
	...Array.from({ length: 16 }, (_, index) => `ADAT ${index + 1}`),
]

export const firefaceUfxII: DeviceProfile = {
	id: 'fireface-ufx-ii',
	label: 'Fireface UFX II',
	inputs: channels(inputLabels),
	playbacks: channels(outputLabels),
	outputs: channels(outputLabels),
	capabilities: {
		inputGainChannels: Array.from({ length: 12 }, (_, index) => index),
		inputGainRanges: {
			...Object.fromEntries([0, 1, 2, 3, 4, 5, 6, 7].map((index) => [index, { min: 0, max: 12, step: 0.5 }])),
			...Object.fromEntries(
				[8, 9, 10, 11].map((index) => [index, { min: 0, max: 75, step: 1, instrument: { min: 8, max: 50, step: 1 } }]),
			),
		},
		phantomChannels: [8, 9, 10, 11],
		instrumentChannels: [8, 9, 10, 11],
		padChannels: [],
		autosetChannels: [8, 9, 10, 11],
		duRec: true,
		channelFx: true,
		globalFx: true,
		roomEq: true,
	},
}
