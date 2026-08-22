import assert from 'node:assert/strict'
import test from 'node:test'
import { dbToNormalized, normalizedToDb } from '../dist/protocol/fader-curve.js'

test('official TotalMix curve matches observed 0.66 feedback', () => {
	assert.ok(Math.abs(normalizedToDb(0.66) - -5.16) < 0.02)
})

test('fader conversion round-trips representative values', () => {
	for (const db of [-65, -40, -20, -6, 0, 6]) {
		assert.ok(Math.abs(normalizedToDb(dbToNormalized(db)) - db) < 0.0001, `${db} dB did not round-trip`)
	}
})

test('fader conversion clamps both ends', () => {
	assert.equal(dbToNormalized(-100), 0)
	assert.equal(dbToNormalized(20), 1)
	assert.equal(normalizedToDb(-1), -65)
	assert.ok(Math.abs(normalizedToDb(2) - 6) < 0.0001)
})
