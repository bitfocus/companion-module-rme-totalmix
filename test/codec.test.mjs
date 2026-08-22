import assert from 'node:assert/strict'
import test from 'node:test'
import { decodeOscPacket, encodeOscMessage } from '../dist/osc/codec.js'

test('OSC message round-trips supported argument types', () => {
	const packet = encodeOscMessage({ address: '/1/test', args: [7, 0.66, '-5.2 dB', true, false] })
	assert.ok(packet.includes(Buffer.from(',ffsTF\0')), 'numeric TotalMix arguments must be encoded as float32')
	const [message] = decodeOscPacket(packet)
	assert.equal(message.address, '/1/test')
	assert.equal(message.args[0], 7)
	assert.ok(Math.abs(message.args[1] - 0.66) < 0.000001)
	assert.equal(message.args[2], '-5.2 dB')
	assert.equal(message.args[3], true)
	assert.equal(message.args[4], false)
})

test('OSC bundle elements are decoded', () => {
	const first = encodeOscMessage({ address: '/1/volume1', args: [0.5] })
	const second = encodeOscMessage({ address: '/1/volume1Val', args: ['-12.0 dB'] })
	const oscString = (value) => {
		const raw = Buffer.from(`${value}\0`)
		return Buffer.concat([raw, Buffer.alloc((4 - (raw.length % 4)) % 4)])
	}
	const element = (packet) => {
		const size = Buffer.alloc(4)
		size.writeInt32BE(packet.length)
		return Buffer.concat([size, packet])
	}
	const bundle = Buffer.concat([oscString('#bundle'), Buffer.alloc(8), element(first), element(second)])
	assert.deepEqual(
		decodeOscPacket(bundle).map(({ address }) => address),
		['/1/volume1', '/1/volume1Val'],
	)
})
