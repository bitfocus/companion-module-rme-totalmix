import assert from 'node:assert/strict'
import dgram from 'node:dgram'
import test from 'node:test'
import { decodeOscPacket, encodeOscMessage } from '../dist/osc/codec.js'
import { OscTransport } from '../dist/osc/transport.js'

test('UDP transport sends commands and receives TotalMix feedback', async (context) => {
	const totalMix = dgram.createSocket('udp4')
	context.after(() => totalMix.close())
	await new Promise((resolve) => totalMix.bind(0, '127.0.0.1', resolve))
	const targetPort = totalMix.address().port

	const receivedFeedback = new Promise((resolve, reject) => {
		const transport = new OscTransport(
			{ host: '127.0.0.1', targetPort, feedbackPort: 0 },
			{
				onListening: async () => {
					try {
						await transport.send('/1/volume2', 0.66)
					} catch (error) {
						reject(error)
					}
				},
				onMessage: resolve,
				onError: reject,
			},
		)
		context.after(() => transport.close())
		transport.start()
	})

	totalMix.on('message', (packet, remote) => {
		const [command] = decodeOscPacket(packet)
		assert.equal(command.address, '/1/volume2')
		assert.ok(Math.abs(command.args[0] - 0.66) < 0.000001)
		totalMix.send(encodeOscMessage({ address: '/1/volume2Val', args: ['-5.2 dB'] }), remote.port, remote.address)
	})

	const feedback = await receivedFeedback
	assert.deepEqual(feedback, { address: '/1/volume2Val', args: ['-5.2 dB'] })
})
