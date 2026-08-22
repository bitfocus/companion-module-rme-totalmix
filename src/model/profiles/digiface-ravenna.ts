import type { DeviceProfile } from '../device-profile.js'
import { channels, numberedLabels } from './helpers.js'

function createProfile(id: string, label: string, sourceLabels: string[]): DeviceProfile {
	return {
		id,
		label,
		inputs: channels(sourceLabels),
		playbacks: channels(sourceLabels),
		outputs: channels([...sourceLabels, 'PH 129', 'PH 130']),
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
}

export const digifaceRavenna: DeviceProfile = createProfile(
	'digiface-ravenna',
	'Digiface Ravenna (RAVENNA mode)',
	numberedLabels('RAVENNA', 128),
)

export const digifaceRavennaMadi: DeviceProfile = createProfile(
	'digiface-ravenna-madi',
	'Digiface Ravenna (MADI mode)',
	[...numberedLabels('RAVENNA', 64), ...numberedLabels('MADI', 64)],
)
