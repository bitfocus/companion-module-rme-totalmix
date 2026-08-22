import type { DeviceProfile } from '../device-profile.js'
import { babyface } from './babyface.js'
import { babyfaceProFs } from './babyface-pro-fs.js'
import { digifaceAes } from './digiface-aes.js'
import { digifaceDante } from './digiface-dante.js'
import { digifaceRavenna, digifaceRavennaMadi } from './digiface-ravenna.js'
import { fireface802Fs } from './fireface-802-fs.js'
import { firefaceUc } from './fireface-uc.js'
import { firefaceUcx } from './fireface-ucx.js'
import { firefaceUcxII } from './fireface-ucx-ii.js'
import { firefaceUfx } from './fireface-ufx.js'
import { firefaceUfxII } from './fireface-ufx-ii.js'
import { firefaceUfxIII } from './fireface-ufx-iii.js'
import { hdspeAes } from './hdspe-aes.js'
import { hdspeAioPro } from './hdspe-aio-pro.js'
import { hdspeMadiFx } from './hdspe-madi-fx.js'
import { hdspeRaydat } from './hdspe-raydat.js'

const profiles: Record<string, DeviceProfile> = {
	[firefaceUfxII.id]: firefaceUfxII,
	[firefaceUfxIII.id]: firefaceUfxIII,
	[firefaceUfx.id]: firefaceUfx,
	[firefaceUcxII.id]: firefaceUcxII,
	[firefaceUcx.id]: firefaceUcx,
	[fireface802Fs.id]: fireface802Fs,
	[babyfaceProFs.id]: babyfaceProFs,
	[babyface.id]: babyface,
	[firefaceUc.id]: firefaceUc,
	[digifaceAes.id]: digifaceAes,
	[digifaceDante.id]: digifaceDante,
	[digifaceRavenna.id]: digifaceRavenna,
	[digifaceRavennaMadi.id]: digifaceRavennaMadi,
	[hdspeAioPro.id]: hdspeAioPro,
	[hdspeRaydat.id]: hdspeRaydat,
	[hdspeMadiFx.id]: hdspeMadiFx,
	[hdspeAes.id]: hdspeAes,
}

export function getDeviceProfile(id: string): DeviceProfile {
	return profiles[id] ?? firefaceUfxII
}

export function detectDeviceProfile(name: string): DeviceProfile | undefined {
	const normalized = name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim()
	if (/\bfireface ufx iii\b/.test(normalized)) return firefaceUfxIII
	if (/\bfireface ufx ii\b/.test(normalized)) return firefaceUfxII
	if (/\bfireface ufx\b/.test(normalized)) return firefaceUfx
	if (/\bfireface ucx ii\b/.test(normalized)) return firefaceUcxII
	if (/\bfireface ucx\b/.test(normalized)) return firefaceUcx
	if (/\bfireface 802 fs\b/.test(normalized)) return fireface802Fs
	if (/\bbabyface pro fs\b/.test(normalized)) return babyfaceProFs
	if (/\bbabyface\b/.test(normalized)) return babyface
	if (/\bfireface uc\b/.test(normalized)) return firefaceUc
	if (/\bdigiface aes\b/.test(normalized)) return digifaceAes
	if (/\bdigiface dante\b/.test(normalized)) return digifaceDante
	if (/\bdigiface ravenna\b/.test(normalized)) return digifaceRavenna
	if (/\bhdspe aio pro\b/.test(normalized)) return hdspeAioPro
	if (/\bhdspe raydat\b/.test(normalized)) return hdspeRaydat
	if (/\bhdspe madi fx\b/.test(normalized)) return hdspeMadiFx
	if (/\bhdspe aes\b/.test(normalized)) return hdspeAes
	return undefined
}

export const deviceProfileChoices = Object.values(profiles).map((profile) => ({
	id: profile.id,
	label: profile.label,
}))
