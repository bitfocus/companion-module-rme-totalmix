import assert from 'node:assert/strict'
import test from 'node:test'
import { GetConfigFields, normalizeConfig } from '../dist/config.js'

test('TotalMix version offers only 1.96 or newer and 2.1 or newer (Global OSC)', () => {
	const field = GetConfigFields().find(({ id }) => id === 'protocolMode')
	assert.equal(field.label, 'TotalMix version')
	assert.deepEqual(field.choices, [
		{ id: '1.96', label: '1.96 or newer' },
		{ id: 'global', label: '2.1 or newer (Global OSC)' },
	])
})

test('unsupported saved protocol values safely normalize to 1.96', () => {
	assert.equal(normalizeConfig({ protocolMode: 'unsupported' }).protocolMode, '1.96')
	assert.equal(normalizeConfig({ protocolMode: 'global' }).protocolMode, 'global')
})

test('connection fields use concise host and bank-size labels', () => {
	const fields = GetConfigFields()
	assert.equal(fields.find(({ id }) => id === 'host').label, 'Host')
	assert.equal(fields.find(({ id }) => id === 'bankSize').label, 'OSC Bank size')
})
