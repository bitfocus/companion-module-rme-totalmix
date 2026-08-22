import assert from 'node:assert/strict'
import test from 'node:test'
import { babyface } from '../dist/model/profiles/babyface.js'
import { babyfaceProFs } from '../dist/model/profiles/babyface-pro-fs.js'
import { digifaceAes } from '../dist/model/profiles/digiface-aes.js'
import { digifaceDante } from '../dist/model/profiles/digiface-dante.js'
import { digifaceRavenna, digifaceRavennaMadi } from '../dist/model/profiles/digiface-ravenna.js'
import { fireface802Fs } from '../dist/model/profiles/fireface-802-fs.js'
import { firefaceUc } from '../dist/model/profiles/fireface-uc.js'
import { firefaceUcx } from '../dist/model/profiles/fireface-ucx.js'
import { firefaceUcxII } from '../dist/model/profiles/fireface-ucx-ii.js'
import { firefaceUfx } from '../dist/model/profiles/fireface-ufx.js'
import { firefaceUfxII } from '../dist/model/profiles/fireface-ufx-ii.js'
import { firefaceUfxIII } from '../dist/model/profiles/fireface-ufx-iii.js'
import { hdspeAes } from '../dist/model/profiles/hdspe-aes.js'
import { hdspeAioPro } from '../dist/model/profiles/hdspe-aio-pro.js'
import { hdspeMadiFx } from '../dist/model/profiles/hdspe-madi-fx.js'
import { hdspeRaydat } from '../dist/model/profiles/hdspe-raydat.js'
import { detectDeviceProfile, deviceProfileChoices, getDeviceProfile } from '../dist/model/profiles/index.js'

test('Global OSC device names select only matching built-in profiles', () => {
	assert.equal(detectDeviceProfile('Fireface UFX II (23978716)')?.id, 'fireface-ufx-ii')
	assert.equal(detectDeviceProfile('Fireface UFX III (12345678)')?.id, 'fireface-ufx-iii')
	assert.equal(detectDeviceProfile('Fireface UFX (12345678)')?.id, 'fireface-ufx')
	assert.equal(detectDeviceProfile('Fireface UCX II')?.id, 'fireface-ucx-ii')
	assert.equal(detectDeviceProfile('Fireface UCX')?.id, 'fireface-ucx')
	assert.equal(detectDeviceProfile('Fireface 802 FS')?.id, 'fireface-802-fs')
	assert.equal(detectDeviceProfile('Babyface Pro FS')?.id, 'babyface-pro-fs')
	assert.equal(detectDeviceProfile('Babyface (12345678)')?.id, 'babyface')
	assert.equal(detectDeviceProfile('Digiface AES')?.id, 'digiface-aes')
	assert.equal(detectDeviceProfile('Digiface Dante')?.id, 'digiface-dante')
	assert.equal(detectDeviceProfile('HDSPe AIO Pro')?.id, 'hdspe-aio-pro')
	assert.equal(detectDeviceProfile('HDSPe RayDAT (12345678)')?.id, 'hdspe-raydat')
	assert.equal(detectDeviceProfile('HDSPe MADI FX')?.id, 'hdspe-madi-fx')
	assert.equal(detectDeviceProfile('HDSPe AES')?.id, 'hdspe-aes')
	assert.equal(detectDeviceProfile('Fireface UC')?.id, 'fireface-uc')
})

test('included device profiles expose the documented TotalMix row sizes', () => {
	assert.deepEqual(
		[
			firefaceUfxII,
			firefaceUfxIII,
			firefaceUfx,
			firefaceUcxII,
			firefaceUcx,
			fireface802Fs,
			babyfaceProFs,
			babyface,
			firefaceUc,
			digifaceAes,
			digifaceDante,
			digifaceRavenna,
			digifaceRavennaMadi,
			hdspeAioPro,
			hdspeRaydat,
			hdspeMadiFx,
			hdspeAes,
		].map((profile) => [profile.id, profile.inputs.length, profile.playbacks.length, profile.outputs.length]),
		[
			['fireface-ufx-ii', 30, 30, 30],
			['fireface-ufx-iii', 94, 94, 94],
			['fireface-ufx', 30, 30, 30],
			['fireface-ucx-ii', 20, 20, 20],
			['fireface-ucx', 18, 18, 18],
			['fireface-802-fs', 30, 30, 30],
			['babyface-pro-fs', 12, 12, 12],
			['babyface', 10, 12, 12],
			['fireface-uc', 18, 18, 18],
			['digiface-aes', 14, 16, 16],
			['digiface-dante', 128, 128, 130],
			['digiface-ravenna', 128, 128, 130],
			['digiface-ravenna-madi', 128, 128, 130],
			['hdspe-aio-pro', 14, 16, 16],
			['hdspe-raydat', 36, 36, 36],
			['hdspe-madi-fx', 194, 196, 196],
			['hdspe-aes', 16, 16, 16],
		],
	)
	assert.deepEqual(
		deviceProfileChoices.map((choice) => choice.id),
		[
			'fireface-ufx-ii',
			'fireface-ufx-iii',
			'fireface-ufx',
			'fireface-ucx-ii',
			'fireface-ucx',
			'fireface-802-fs',
			'babyface-pro-fs',
			'babyface',
			'fireface-uc',
			'digiface-aes',
			'digiface-dante',
			'digiface-ravenna',
			'digiface-ravenna-madi',
			'hdspe-aio-pro',
			'hdspe-raydat',
			'hdspe-madi-fx',
			'hdspe-aes',
		],
	)
})

test('HDSPe PCIe profiles follow their documented single-speed TotalMix order', () => {
	assert.deepEqual(
		hdspeAioPro.inputs.slice(0, 7).map((channel) => channel.label),
		['AN 1', 'AN 2', 'AES L', 'AES R', 'SPDIF L', 'SPDIF R', 'ADAT 1'],
	)
	assert.deepEqual(
		hdspeAioPro.outputs.slice(0, 9).map((channel) => channel.label),
		['AN 1', 'AN 2', 'PH 3', 'PH 4', 'AES L', 'AES R', 'SPDIF L', 'SPDIF R', 'ADAT 1'],
	)
	assert.equal(hdspeRaydat.inputs[0].label, 'ADAT 1')
	assert.equal(hdspeRaydat.inputs[31].label, 'ADAT 32')
	assert.deepEqual(
		hdspeRaydat.inputs.slice(32).map((channel) => channel.label),
		['AES L', 'AES R', 'SPDIF L', 'SPDIF R'],
	)
	assert.deepEqual(
		hdspeMadiFx.inputs.slice(0, 4).map((channel) => channel.label),
		['AES L', 'AES R', 'MADI 1', 'MADI 2'],
	)
	assert.equal(hdspeMadiFx.inputs.at(-1).label, 'MADI 192')
	assert.deepEqual(
		hdspeMadiFx.outputs.slice(0, 6).map((channel) => channel.label),
		['AES L', 'AES R', 'PH 3', 'PH 4', 'MADI 1', 'MADI 2'],
	)
	assert.equal(hdspeMadiFx.outputs.at(-1).label, 'MADI 192')
	assert.equal(hdspeAes.inputs[0].label, 'AES 1')
	assert.equal(hdspeAes.outputs.at(-1).label, 'AES 16')
})

test('new Fireface profiles follow their documented analog, digital, and MADI order', () => {
	assert.deepEqual(
		firefaceUcx.inputs.slice(6, 12).map((channel) => channel.label),
		['AN 7', 'AN 8', 'SPDIF L', 'SPDIF R', 'ADAT 1', 'ADAT 2'],
	)
	assert.deepEqual(
		firefaceUcx.outputs.slice(4, 10).map((channel) => channel.label),
		['AN 5', 'AN 6', 'PH 7', 'PH 8', 'SPDIF L', 'SPDIF R'],
	)
	assert.deepEqual(
		firefaceUfx.inputs.slice(8, 16).map((channel) => channel.label),
		['Mic 9', 'Mic 10', 'Mic 11', 'Mic 12', 'AES L', 'AES R', 'ADAT 1', 'ADAT 2'],
	)
	assert.deepEqual(
		firefaceUfx.outputs.slice(8, 14).map((channel) => channel.label),
		['PH 9', 'PH 10', 'PH 11', 'PH 12', 'AES L', 'AES R'],
	)
	assert.deepEqual(
		firefaceUcxII.inputs.slice(6, 14).map((channel) => channel.label),
		['AN 7', 'AN 8', 'SPDIF L', 'SPDIF R', 'AES L', 'AES R', 'ADAT 1', 'ADAT 2'],
	)
	assert.deepEqual(
		firefaceUcxII.outputs.slice(4, 12).map((channel) => channel.label),
		['AN 5', 'AN 6', 'PH 7', 'PH 8', 'SPDIF L', 'SPDIF R', 'AES L', 'AES R'],
	)
	assert.equal(firefaceUfxIII.inputs[30].label, 'MADI 1')
	assert.equal(firefaceUfxIII.inputs[93].label, 'MADI 64')
	assert.deepEqual(
		fireface802Fs.inputs.slice(8, 14).map((channel) => channel.label),
		['Mic 9', 'Mic 10', 'Mic 11', 'Mic 12', 'AES L', 'AES R'],
	)
})

test('Digiface AES preserves its asymmetric 14-input and 16-output channel order', () => {
	assert.deepEqual(
		digifaceAes.inputs.slice(0, 7).map((channel) => channel.label),
		['AES L', 'AES R', 'SPDIF L', 'SPDIF R', 'Mic 1', 'Mic 2', 'ADAT 1'],
	)
	assert.deepEqual(
		digifaceAes.outputs.slice(0, 9).map((channel) => channel.label),
		['AES L', 'AES R', 'SPDIF L', 'SPDIF R', 'AN 5', 'AN 6', 'PH 7', 'PH 8', 'ADAT 1'],
	)
	assert.deepEqual(digifaceAes.capabilities.phantomChannels, [4, 5])
})

test('Digiface Dante profile maps Dante, MADI, and Phones channels in TotalMix order', () => {
	assert.equal(digifaceDante.inputs[0].label, 'Dante 1')
	assert.equal(digifaceDante.inputs[63].label, 'Dante 64')
	assert.equal(digifaceDante.inputs[64].label, 'MADI 1')
	assert.equal(digifaceDante.inputs[127].label, 'MADI 64')
	assert.deepEqual(
		digifaceDante.outputs.slice(-2).map((channel) => channel.label),
		['PH 129', 'PH 130'],
	)
})

test('Digiface Ravenna profiles reflect both official channel 65–128 modes', () => {
	assert.equal(digifaceRavenna.label, 'Digiface Ravenna (RAVENNA mode)')
	assert.equal(digifaceRavennaMadi.label, 'Digiface Ravenna (MADI mode)')
	assert.equal(digifaceRavenna.inputs[63].label, 'RAVENNA 64')
	assert.equal(digifaceRavenna.inputs[64].label, 'RAVENNA 65')
	assert.equal(digifaceRavenna.inputs[127].label, 'RAVENNA 128')
	assert.equal(digifaceRavennaMadi.inputs[63].label, 'RAVENNA 64')
	assert.equal(digifaceRavennaMadi.inputs[64].label, 'MADI 1')
	assert.equal(digifaceRavennaMadi.inputs[127].label, 'MADI 64')
	assert.equal(getDeviceProfile('digiface-ravenna-madi'), digifaceRavennaMadi)
})

test('Babyface Pro FS profile keeps analog, phones, and ADAT channel order', () => {
	assert.deepEqual(
		babyfaceProFs.inputs.map((channel) => channel.label),
		['AN 1', 'AN 2', 'AN 3', 'AN 4', 'ADAT 1', 'ADAT 2', 'ADAT 3', 'ADAT 4', 'ADAT 5', 'ADAT 6', 'ADAT 7', 'ADAT 8'],
	)
	assert.deepEqual(
		babyfaceProFs.outputs.slice(0, 4).map((channel) => channel.label),
		['AN 1', 'AN 2', 'PH 3', 'PH 4'],
	)
})

test('original Babyface profile preserves its asymmetric TotalMix rows and hardware options', () => {
	assert.deepEqual(
		babyface.inputs.map((channel) => channel.label),
		['AN 1', 'AN 2', 'ADAT 1', 'ADAT 2', 'ADAT 3', 'ADAT 4', 'ADAT 5', 'ADAT 6', 'ADAT 7', 'ADAT 8'],
	)
	assert.deepEqual(
		babyface.outputs.slice(0, 6).map((channel) => channel.label),
		['AN 1', 'AN 2', 'PH 3', 'PH 4', 'ADAT 1', 'ADAT 2'],
	)
	assert.deepEqual(babyface.capabilities.inputGainChannels, [0, 1])
	assert.deepEqual(babyface.capabilities.phantomChannels, [0, 1])
	assert.deepEqual(babyface.capabilities.instrumentChannels, [1])
	assert.equal(babyface.capabilities.channelFx, false)
	assert.equal(babyface.capabilities.globalFx, true)
	assert.equal(babyface.capabilities.roomEq, false)
})

test('Fireface UC profile keeps analog, SPDIF, and ADAT channel order', () => {
	assert.deepEqual(
		firefaceUc.inputs.slice(6, 12).map((channel) => channel.label),
		['AN 7', 'AN 8', 'SPDIF L', 'SPDIF R', 'ADAT 1', 'ADAT 2'],
	)
	assert.deepEqual(
		firefaceUc.outputs.slice(4, 10).map((channel) => channel.label),
		['AN 5', 'AN 6', 'PH 7', 'PH 8', 'SPDIF L', 'SPDIF R'],
	)
	assert.equal(getDeviceProfile('fireface-uc'), firefaceUc)
})

test('device capability lists only expose controls implemented by the hardware', () => {
	assert.deepEqual(firefaceUfxII.capabilities.phantomChannels, [8, 9, 10, 11])
	assert.deepEqual(firefaceUfxII.capabilities.instrumentChannels, [8, 9, 10, 11])
	assert.deepEqual(firefaceUfxII.capabilities.padChannels, [])
	assert.equal(firefaceUfxII.capabilities.duRec, true)
	assert.deepEqual(
		firefaceUfxIII.capabilities.inputGainChannels,
		Array.from({ length: 12 }, (_, index) => index),
	)
	assert.deepEqual(firefaceUcxII.capabilities.autosetChannels, [0, 1, 2, 3])
	assert.deepEqual(firefaceUcx.capabilities.autosetChannels, [0, 1, 2, 3])
	assert.equal(firefaceUcx.capabilities.duRec, false)
	assert.equal(firefaceUcx.capabilities.channelFx, true)
	assert.equal(firefaceUcx.capabilities.roomEq, false)
	assert.deepEqual(firefaceUfx.capabilities.autosetChannels, [8, 9, 10, 11])
	assert.equal(firefaceUfx.capabilities.duRec, true)
	assert.equal(firefaceUfx.capabilities.channelFx, true)
	assert.equal(firefaceUfx.capabilities.roomEq, false)
	assert.deepEqual(fireface802Fs.capabilities.instrumentChannels, [8, 9, 10, 11])
	assert.equal(fireface802Fs.capabilities.duRec, false)

	assert.deepEqual(babyfaceProFs.capabilities.phantomChannels, [0, 1])
	assert.deepEqual(babyfaceProFs.capabilities.instrumentChannels, [])
	assert.deepEqual(babyfaceProFs.capabilities.padChannels, [0, 1])
	assert.deepEqual(babyfaceProFs.capabilities.autosetChannels, [])

	assert.deepEqual(firefaceUc.capabilities.instrumentChannels, [2, 3])
	assert.deepEqual(firefaceUc.capabilities.padChannels, [2, 3])
	assert.deepEqual(firefaceUc.capabilities.autosetChannels, [])

	for (const profile of [digifaceDante, digifaceRavenna, digifaceRavennaMadi]) {
		assert.deepEqual(profile.capabilities.inputGainChannels, [])
		assert.equal(profile.capabilities.duRec, false)
		assert.equal(profile.capabilities.channelFx, false)
		assert.equal(profile.capabilities.globalFx, false)
		assert.equal(profile.capabilities.roomEq, false)
	}

	for (const profile of [hdspeAioPro, hdspeRaydat, hdspeAes]) {
		assert.deepEqual(profile.capabilities.inputGainChannels, [])
		assert.equal(profile.capabilities.duRec, false)
		assert.equal(profile.capabilities.channelFx, false)
		assert.equal(profile.capabilities.globalFx, false)
		assert.equal(profile.capabilities.roomEq, false)
	}
	assert.equal(hdspeMadiFx.capabilities.duRec, false)
	assert.equal(hdspeMadiFx.capabilities.channelFx, true)
	assert.equal(hdspeMadiFx.capabilities.globalFx, true)
	assert.equal(hdspeMadiFx.capabilities.roomEq, true)
})

test('UFX II fallback labels use TotalMix terminology instead of optical-port notation', () => {
	assert.deepEqual(
		firefaceUfxII.inputs.slice(8, 14).map((channel) => channel.label),
		['Mic 9', 'Mic 10', 'Mic 11', 'Mic 12', 'AES L', 'AES R'],
	)
	assert.equal(firefaceUfxII.inputs.at(-1).label, 'ADAT 16')
	assert.equal(firefaceUfxII.outputs.at(-1).label, 'ADAT 16')
	assert.deepEqual(firefaceUfxII.capabilities.inputGainChannels, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
	assert.deepEqual(firefaceUfxII.capabilities.inputGainRanges[0], { min: 0, max: 12, step: 0.5 })
	assert.deepEqual(firefaceUfxII.capabilities.inputGainRanges[8], {
		min: 0,
		max: 75,
		step: 1,
		instrument: { min: 8, max: 50, step: 1 },
	})
})
