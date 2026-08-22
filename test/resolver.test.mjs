import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveSlot } from '../dist/protocol/resolver.js'

test('resolver maps zero-based channels to one-based OSC slots', () => {
	assert.deepEqual(resolveSlot(0, 8), { bankStart: 0, slot: 1 })
	assert.deepEqual(resolveSlot(7, 8), { bankStart: 0, slot: 8 })
	assert.deepEqual(resolveSlot(8, 8), { bankStart: 8, slot: 1 })
	assert.deepEqual(resolveSlot(29, 48), { bankStart: 0, slot: 30 })
})
