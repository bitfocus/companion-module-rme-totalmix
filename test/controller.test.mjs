import assert from 'node:assert/strict'
import test from 'node:test'
import { TotalMixController } from '../dist/protocol/controller.js'

test('set fader selects submix, bank, and bus before sending value', async () => {
	const sent = []
	const controller = new TotalMixController(async (address, ...args) => sent.push({ address, args }), {
		bankSize: 8,
		syncTimeoutMs: 100,
		selectionDelayMs: 0,
	})
	await controller.setSubmixFader({ bus: 'playback', index: 9, output: 2 }, -6, 'db')
	assert.deepEqual(
		sent.map(({ address }) => address),
		['/setSubmix', '/setBankStart', '/1/busPlayback', '/1/volume2'],
	)
	assert.equal(sent[0].args[0], 2)
	assert.equal(sent[1].args[0], 8)
	assert.ok(Math.abs(sent[3].args[0] - 0.6344) < 0.001)
	const state = controller.state.getRoute({ bus: 'playback', index: 9, output: 2 })
	assert.equal(state.quality, 'optimistic')
	assert.equal(state.display, '-6.0 dB')
})

test('context selectors are repeated so external TotalMix UI changes cannot redirect an action', async () => {
	const sent = []
	const controller = new TotalMixController(async (address, ...args) => sent.push({ address, args }), {
		bankSize: 8,
		syncTimeoutMs: 100,
		selectionDelayMs: 0,
	})
	const target = { bus: 'input', index: 0, output: 4 }
	await controller.setSubmixFader(target, -12, 'db')
	await controller.setSubmixFader(target, -6, 'db')

	assert.deepEqual(
		sent.map(({ address }) => address),
		[
			'/setSubmix',
			'/setBankStart',
			'/1/busInput',
			'/1/volume1',
			'/setSubmix',
			'/setBankStart',
			'/1/busInput',
			'/1/volume1',
		],
	)
})

test('legacy 1.96 fader writes do not wait for selector settle delays', async () => {
	const controller = new TotalMixController(async () => undefined, {
		bankSize: 48,
		syncTimeoutMs: 100,
		selectionDelayMs: 100,
		protocolMode: '1.96',
	})
	const action = controller.setSubmixFader({ bus: 'input', index: 0, output: 0 }, 0.5, 'normalized')
	const result = await Promise.race([
		action.then(() => 'sent'),
		new Promise((resolve) => setTimeout(() => resolve('slow'), 25)),
	])
	assert.equal(result, 'sent')
})

test('legacy fader writes ignore stale selector dumps until the requested value returns', async () => {
	let controller
	const target = { bus: 'input', index: 0, output: 0 }
	const observed = []
	controller = new TotalMixController(
		async (address, ...args) => {
			if (address === '/1/busInput') {
				controller.handleMessage({ address: '/1/volume1', args: [0.2] })
				controller.handleMessage({ address: '/1/volume1Val', args: ['-30.0 dB'] })
			} else if (address === '/1/volume1') {
				controller.handleMessage({ address: '/1/volume1', args })
				controller.handleMessage({ address: '/1/volume1Val', args: ['-4.9 dB'] })
			}
		},
		{ bankSize: 48, syncTimeoutMs: 100, selectionDelayMs: 100 },
	)
	controller.state.setRoute(target, 0.5, 'confirmed', '-6.0 dB')
	controller.state.subscribe(() => observed.push(controller.state.getRoute(target).value))

	await controller.adjustSubmixFader(target, 0.1, 'normalized')

	assert.equal(controller.state.getRoute(target).value, 0.6)
	assert.equal(controller.state.getRoute(target).display, '-4.9 dB')
	assert.equal(controller.state.getRoute(target).quality, 'confirmed')
	assert.equal(observed.includes(0.2), false)
	assert.equal(controller.hasPendingInteractiveWrites, false)
})

test('relative fader action requests state instead of assuming a default', async () => {
	const sent = []
	let controller
	controller = new TotalMixController(
		async (address, ...args) => {
			sent.push({ address, args })
			if (address === '/1/busInput') controller.handleMessage({ address: '/1/volume1', args: [0.5] })
		},
		{ bankSize: 48, syncTimeoutMs: 100, selectionDelayMs: 0 },
	)
	await controller.adjustSubmixFader({ bus: 'input', index: 0, output: 0 }, 0.1, 'normalized')
	const volumeCommands = sent.filter(({ address }) => address === '/1/volume1')
	assert.equal(volumeCommands.length, 1)
	assert.ok(Math.abs(volumeCommands[0].args[0] - 0.6) < 0.000001)
})

test('toggle reads TotalMix mute state before choosing the command', async () => {
	const sent = []
	let controller
	controller = new TotalMixController(
		async (address, ...args) => {
			sent.push({ address, args })
			if (address === '/1/busInput') controller.handleMessage({ address: '/1/mute/1/1', args: [1] })
		},
		{ bankSize: 48, syncTimeoutMs: 100, selectionDelayMs: 0 },
	)
	await controller.setMute({ bus: 'input', index: 0 }, 'toggle')
	const command = sent.find(({ address }) => address === '/1/mute/1/1')
	assert.deepEqual(command.args, [0])
})

test('incoming numeric and display values become confirmed route state', async () => {
	let controller
	controller = new TotalMixController(
		async (address) => {
			if (address === '/1/busInput') {
				controller.handleMessage({ address: '/1/volume2', args: [0.66] })
				controller.handleMessage({ address: '/1/volume2Val', args: ['-5.2 dB'] })
			}
		},
		{ bankSize: 48, syncTimeoutMs: 100, selectionDelayMs: 0 },
	)
	const target = { bus: 'input', index: 1, output: 22 }
	await controller.syncSubmixFader(target)
	assert.deepEqual(controller.state.getRoute(target), {
		value: 0.66,
		quality: 'confirmed',
		display: '-5.2 dB',
		updatedAt: controller.state.getRoute(target).updatedAt,
	})
})

test('output fader synchronization selects the output bus and ingests its state', async () => {
	let controller
	controller = new TotalMixController(
		async (address) => {
			if (address === '/1/busOutput') controller.handleMessage({ address: '/1/volume1', args: [0.75] })
		},
		{ bankSize: 48, syncTimeoutMs: 100, selectionDelayMs: 0 },
	)

	await controller.syncOutputFader(0)
	assert.equal(controller.state.getOutput(0).value, 0.75)
	assert.equal(controller.state.getOutput(0).quality, 'confirmed')
})

test('snapshot recall uses the reversed TotalMix OSC address and ingests active-state feedback', async () => {
	const sent = []
	const controller = new TotalMixController(async (address, ...args) => sent.push({ address, args }), {
		bankSize: 48,
		syncTimeoutMs: 100,
		selectionDelayMs: 0,
	})

	await controller.recallSnapshot(3)
	assert.deepEqual(sent, [{ address: '/3/snapshots/6/1', args: [1] }])
	assert.equal(controller.state.getSnapshot(3).value, true)
	assert.equal(controller.state.getSnapshot(3).quality, 'optimistic')

	controller.handleMessage({ address: '/3/snapshots/6/1', args: [1] })
	assert.equal(controller.state.getSnapshot(3).quality, 'confirmed')
})

test('Quick Workspace load uses the direct receive-only OSC command', async () => {
	const sent = []
	const controller = new TotalMixController(async (address, ...args) => sent.push({ address, args }), {
		bankSize: 48,
		syncTimeoutMs: 100,
		selectionDelayMs: 0,
	})

	await controller.loadQuickWorkspace(12)
	assert.deepEqual(sent, [{ address: '/loadQuickWorkspace', args: [12] }])
})

test('group toggles use reversed Page 3 addresses and confirmed state', async () => {
	const sent = []
	let controller
	controller = new TotalMixController(
		async (address, ...args) => {
			sent.push({ address, args })
			if (address === '/3/soloGroups/3/1' && args[0] === 0) {
				controller.handleMessage({ address, args: [0] })
			}
		},
		{ bankSize: 48, syncTimeoutMs: 100, selectionDelayMs: 0 },
	)

	await controller.setGroup('pfl', 2, 'toggle')
	assert.deepEqual(sent, [
		{ address: '/3/soloGroups/3/1', args: [0] },
		{ address: '/3/soloGroups/3/1', args: [1] },
	])
	assert.equal(controller.state.getGlobalParameter('group:pfl:2').value, true)
})

test('Undo/Redo and direct reference-level commands use documented OSC values', async () => {
	const sent = []
	let controller
	controller = new TotalMixController(
		async (address, ...args) => {
			sent.push({ address, args })
			if (address === '/2/busOutput') {
				controller.handleMessage({ address: '/2/refLevel', args: [0] })
				controller.handleMessage({ address: '/2/refLevelVal', args: ['-10 dBV'] })
				controller.handleMessage({ address: '/2/trackname', args: ['AN 1/2'] })
			} else if (address === '/2/refLevel') {
				controller.handleMessage({ address: '/2/refLevel', args: args })
				controller.handleMessage({ address: '/2/refLevelVal', args: ['+24 dBu'] })
			}
		},
		{ bankSize: 48, syncTimeoutMs: 100, selectionDelayMs: 0 },
	)

	await controller.undoRedo('undo')
	await controller.setChannelParameterDirect({ bus: 'output', index: 0 }, 'refLevel', 3)
	assert.deepEqual(sent, [
		{ address: '/3/undo', args: [1] },
		{ address: '/setBankStart', args: [0] },
		{ address: '/setOffsetInBank', args: [0] },
		{ address: '/2/busOutput', args: [1] },
		{ address: '/2/refLevel', args: [3] },
	])
})

test('Page 2 channel commands select bank, offset, and row before changing gain', async () => {
	const sent = []
	let controller
	controller = new TotalMixController(
		async (address, ...args) => {
			sent.push({ address, args })
			if (address === '/2/busInput') {
				controller.handleMessage({ address: '/2/gain', args: [0.25] })
				controller.handleMessage({ address: '/2/gainVal', args: ['12 dB'] })
				controller.handleMessage({ address: '/2/trackname', args: ['Mic 10'] })
			} else if (address === '/2/gain') {
				controller.handleMessage({ address: '/2/gain', args })
				controller.handleMessage({ address: '/2/gainVal', args: ['18 dB'] })
			}
		},
		{ bankSize: 8, syncTimeoutMs: 100, selectionDelayMs: 0 },
	)

	await controller.setInputGain(9, 0.375)
	assert.deepEqual(sent, [
		{ address: '/setBankStart', args: [8] },
		{ address: '/setOffsetInBank', args: [1] },
		{ address: '/2/busInput', args: [1] },
		{ address: '/2/gain', args: [0.375] },
	])
	assert.equal(controller.state.getChannelParameter({ bus: 'input', index: 9 }, 'gain').quality, 'confirmed')
	assert.equal(controller.state.getChannelParameter({ bus: 'input', index: 9 }, 'gain').display, '18 dB')
})

test('legacy gain writes ignore stale Page 2 dumps and complete without selector delays', async () => {
	let controller
	const target = { bus: 'input', index: 8 }
	const displays = []
	controller = new TotalMixController(
		async (address, ...args) => {
			if (address === '/2/busInput') {
				controller.handleMessage({ address: '/2/instrument', args: [0] })
				controller.handleMessage({ address: '/2/autoset', args: [0] })
				controller.handleMessage({ address: '/2/gain', args: [0] })
				controller.handleMessage({ address: '/2/gainVal', args: ['0.0'] })
			} else if (address === '/2/gain') {
				controller.handleMessage({ address: '/2/gain', args })
				controller.handleMessage({ address: '/2/gainVal', args: ['44'] })
			}
		},
		{ bankSize: 48, syncTimeoutMs: 100, selectionDelayMs: 100 },
	)
	controller.state.setChannelParameter(target, 'gain', 0.5, 'confirmed', '43')
	controller.state.setChannelParameter(target, 'instrument', true, 'confirmed')
	controller.state.setChannelParameter(target, 'autoset', true, 'confirmed')
	controller.state.subscribe(() => displays.push(controller.state.getChannelParameter(target, 'gain').display))

	const action = controller.adjustInputGain(8, 0.01)
	const result = await Promise.race([
		action.then(() => 'sent'),
		new Promise((resolve) => setTimeout(() => resolve('slow'), 25)),
	])

	assert.equal(result, 'sent')
	assert.equal(controller.state.getChannelParameter(target, 'gain').value, 0.51)
	assert.equal(controller.state.getChannelParameter(target, 'gain').display, '44')
	assert.equal(controller.state.getChannelParameter(target, 'instrument').value, true)
	assert.equal(controller.state.getChannelParameter(target, 'autoset').value, true)
	assert.equal(displays.includes('0.0'), false)
	assert.equal(controller.hasPendingInteractiveWrites, false)
})

test('Page 2 toggle operations read current hardware state before toggling', async () => {
	const sent = []
	let controller
	controller = new TotalMixController(
		async (address, ...args) => {
			sent.push({ address, args })
			if (address === '/2/busInput') {
				controller.handleMessage({ address: '/2/phantom', args: [0] })
				controller.handleMessage({ address: '/2/trackname', args: ['AN 1'] })
			} else if (address === '/2/phantom') {
				controller.handleMessage({ address: '/2/phantom', args: [1] })
			}
		},
		{ bankSize: 48, syncTimeoutMs: 100, selectionDelayMs: 0 },
	)

	await controller.setChannelOption({ bus: 'input', index: 0 }, 'phantom', 'toggle')
	assert.deepEqual(sent.at(-1), { address: '/2/phantom', args: [1] })
	assert.equal(controller.state.getChannelParameter({ bus: 'input', index: 0 }, 'phantom').value, true)
})

test('legacy Page 2 synchronization waits for fresh replies before changing selector context', async () => {
	let controller
	controller = new TotalMixController(
		async (address) => {
			if (address === '/2/busInput') {
				setTimeout(() => controller.handleMessage({ address: '/2/phantom', args: [1] }), 5)
				setTimeout(() => controller.handleMessage({ address: '/2/instrument', args: [1] }), 8)
				setTimeout(() => controller.handleMessage({ address: '/2/trackname', args: ['Mic 9'] }), 12)
			}
			if (address === '/2/busOutput') {
				setTimeout(() => controller.handleMessage({ address: '/2/loopback', args: [1] }), 5)
				setTimeout(() => controller.handleMessage({ address: '/2/trackname', args: ['AN 1/2'] }), 12)
			}
		},
		{ bankSize: 48, syncTimeoutMs: 100, selectionDelayMs: 0 },
	)
	controller.state.setChannelParameter({ bus: 'input', index: 0 }, 'phantom', false, 'confirmed')
	controller.state.setChannelParameter({ bus: 'input', index: 0 }, 'instrument', false, 'confirmed')
	controller.state.setChannelParameter({ bus: 'output', index: 0 }, 'loopback', false, 'confirmed')

	await Promise.all([
		controller.syncChannelParameter({ bus: 'input', index: 0 }, 'phantom'),
		controller.syncChannelParameter({ bus: 'output', index: 0 }, 'loopback'),
	])

	assert.equal(controller.state.getChannelParameter({ bus: 'input', index: 0 }, 'phantom').value, true)
	assert.equal(controller.state.getChannelParameter({ bus: 'input', index: 0 }, 'instrument').value, true)
	assert.equal(controller.state.getChannelParameter({ bus: 'output', index: 0 }, 'loopback').value, true)
	assert.equal(controller.state.getChannelParameter({ bus: 'output', index: 0 }, 'phantom').quality, 'unknown')
})

test('legacy gain rotation completes its formatted reply before an output feedback dump', async () => {
	let controller
	controller = new TotalMixController(
		async (address, ...args) => {
			if (address === '/2/busInput') {
				setTimeout(() => controller.handleMessage({ address: '/2/gain', args: [0.5] }), 2)
				setTimeout(() => controller.handleMessage({ address: '/2/phantom', args: [1] }), 3)
				setTimeout(() => controller.handleMessage({ address: '/2/instrument', args: [1] }), 4)
				setTimeout(() => controller.handleMessage({ address: '/2/autoset', args: [1] }), 5)
				setTimeout(() => controller.handleMessage({ address: '/2/gainVal', args: ['23 dB'] }), 6)
				setTimeout(() => controller.handleMessage({ address: '/2/trackname', args: ['Mic 9'] }), 8)
			} else if (address === '/2/gain') {
				setTimeout(() => controller.handleMessage({ address: '/2/gain', args }), 2)
				setTimeout(() => controller.handleMessage({ address: '/2/gainVal', args: ['24 dB'] }), 4)
			} else if (address === '/2/busOutput') {
				setTimeout(() => controller.handleMessage({ address: '/2/phantom', args: [0] }), 2)
				setTimeout(() => controller.handleMessage({ address: '/2/instrument', args: [0] }), 3)
				setTimeout(() => controller.handleMessage({ address: '/2/autoset', args: [0] }), 4)
				setTimeout(() => controller.handleMessage({ address: '/2/loopback', args: [0] }), 5)
				setTimeout(() => controller.handleMessage({ address: '/2/trackname', args: ['AN 1/2'] }), 8)
			}
		},
		{ bankSize: 48, syncTimeoutMs: 100, selectionDelayMs: 0 },
	)

	await Promise.all([
		controller.adjustInputGain(8, 0.01),
		controller.syncChannelParameter({ bus: 'output', index: 0 }, 'loopback'),
	])

	const input = { bus: 'input', index: 8 }
	assert.equal(controller.state.getChannelParameter(input, 'gain').display, '24 dB')
	assert.equal(controller.state.getChannelParameter(input, 'phantom').value, true)
	assert.equal(controller.state.getChannelParameter(input, 'instrument').value, true)
	assert.equal(controller.state.getChannelParameter(input, 'autoset').value, true)
	assert.equal(controller.state.getChannelParameter({ bus: 'output', index: 0 }, 'loopback').value, false)
})

test('legacy bank selection resets the receive offset before TotalMix sends its first-channel dump', async () => {
	let controller
	controller = new TotalMixController(
		async (address) => {
			if (address === '/setBankStart') {
				controller.handleMessage({ address: '/2/instrument', args: [0] })
				controller.handleMessage({ address: '/2/autoset', args: [0] })
				controller.handleMessage({ address: '/2/gain', args: [0] })
				controller.handleMessage({ address: '/2/gainVal', args: ['0.0'] })
				controller.handleMessage({ address: '/2/trackname', args: ['AN 1'] })
			} else if (address === '/setOffsetInBank') {
				controller.handleMessage({ address: '/2/instrument', args: [1] })
				controller.handleMessage({ address: '/2/autoset', args: [1] })
				controller.handleMessage({ address: '/2/gain', args: [0.13333334] })
				controller.handleMessage({ address: '/2/gainVal', args: ['10'] })
				controller.handleMessage({ address: '/2/trackname', args: ['Mic 9'] })
			} else if (address === '/2/busInput') {
				controller.handleMessage({ address: '/2/instrument', args: [1] })
				controller.handleMessage({ address: '/2/autoset', args: [1] })
				controller.handleMessage({ address: '/2/gain', args: [0.13333334] })
				controller.handleMessage({ address: '/2/gainVal', args: ['10'] })
				controller.handleMessage({ address: '/2/trackname', args: ['Mic 9'] })
			}
		},
		{ bankSize: 48, syncTimeoutMs: 100, selectionDelayMs: 0 },
	)

	const mic9 = { bus: 'input', index: 8 }
	controller.state.setChannelParameter(mic9, 'gain', 0.13333334, 'confirmed')
	controller.state.setChannelParameterDisplay(mic9, 'gain', '10')
	controller.state.setChannelParameter(mic9, 'instrument', true, 'confirmed')
	controller.state.setChannelParameter(mic9, 'autoset', true, 'confirmed')

	// The first synchronization establishes the legacy Page 2 bus context. The
	// following synchronization reproduces the periodic feedback refresh that
	// previously attributed TotalMix's offset-zero bank dump to Mic 9.
	await controller.syncChannelParameter(mic9, 'gain')
	await controller.syncChannelParameter(mic9, 'gain')

	assert.equal(controller.state.getChannelParameter({ bus: 'input', index: 0 }, 'gain').display, '0.0')
	assert.equal(controller.state.getChannelParameter(mic9, 'gain').display, '10')
	assert.equal(controller.state.getChannelParameter(mic9, 'instrument').value, true)
	assert.equal(controller.state.getChannelParameter(mic9, 'autoset').value, true)
})

test('legacy Page 1 stores indexed phantom feedback without treating micgain values as authoritative', async () => {
	const controller = new TotalMixController(async () => undefined, {
		bankSize: 48,
		syncTimeoutMs: 100,
		selectionDelayMs: 0,
	})
	await controller.setSubmixFader({ bus: 'input', index: 0, output: 0 }, 0, 'normalized')
	controller.handleMessage({ address: '/1/micgain9', args: [0.13333334] })
	controller.handleMessage({ address: '/1/micgain9Val', args: ['0.0 dB'] })
	controller.handleMessage({ address: '/1/phantom/1/9', args: [1] })

	const mic9 = { bus: 'input', index: 8 }
	assert.equal(controller.state.getChannelParameter(mic9, 'gain').quality, 'unknown')
	assert.equal(controller.state.getChannelParameter(mic9, 'phantom').value, true)
})

test('legacy output mute selects the output row and uses the Page 1 mute address', async () => {
	const sent = []
	let controller
	controller = new TotalMixController(
		async (address, ...args) => {
			sent.push({ address, args })
			if (address === '/1/busOutput') controller.handleMessage({ address: '/1/mute/1/1', args: [0] })
		},
		{ bankSize: 48, syncTimeoutMs: 100, selectionDelayMs: 0 },
	)

	await controller.setChannelOption({ bus: 'output', index: 0 }, 'mute', 'toggle')
	assert.deepEqual(sent.at(-1), { address: '/1/mute/1/1', args: [1] })
	assert.equal(controller.state.getChannelParameter({ bus: 'output', index: 0 }, 'mute').value, true)
})

test('pan and balance use the documented normalized OSC scale', async () => {
	const sent = []
	const controller = new TotalMixController(async (address, ...args) => sent.push({ address, args }), {
		bankSize: 48,
		syncTimeoutMs: 100,
		selectionDelayMs: 0,
	})

	await controller.setSubmixPan({ bus: 'playback', index: 2, output: 4 }, -50)
	assert.deepEqual(sent.at(-1), { address: '/1/pan3', args: [0.25] })
	assert.equal(controller.state.getRoutePan({ bus: 'playback', index: 2, output: 4 }).value, 0.25)
})

test('Control Room toggles synchronize state before sending the trigger command', async () => {
	const sent = []
	let controller
	controller = new TotalMixController(
		async (address, ...args) => {
			sent.push({ address, args })
			if (address === '/1/busInput') controller.handleMessage({ address: '/1/mainDim', args: [0] })
		},
		{ bankSize: 48, syncTimeoutMs: 100, selectionDelayMs: 0 },
	)

	await controller.setControlRoom('mainDim', 'toggle')
	assert.deepEqual(sent.at(-1), { address: '/1/mainDim', args: [1] })
	assert.equal(controller.state.getGlobalParameter('mainDim').value, true)
})

test('channel names and peak levels are ingested for the selected TotalMix row', async () => {
	let controller
	controller = new TotalMixController(
		async (address) => {
			if (address === '/1/busOutput') {
				controller.handleMessage({ address: '/1/volume1', args: [0.5] })
				controller.handleMessage({ address: '/1/trackname1', args: ['Main'] })
				controller.handleMessage({ address: '/1/level1Left', args: [0.8] })
				controller.handleMessage({ address: '/1/level1LeftVal', args: ['-1.9 dBFS'] })
			}
		},
		{ bankSize: 48, syncTimeoutMs: 100, selectionDelayMs: 0 },
	)

	await controller.syncOutputFader(0)
	const channel = controller.state.getChannel({ bus: 'output', index: 0 })
	assert.equal(channel.name, 'Main')
	assert.equal(channel.levelLeft.value, 0.8)
	assert.equal(channel.levelLeft.display, '-1.9 dBFS')
})

test('channel-name discovery filters unused TotalMix fader slots', async () => {
	let controller
	controller = new TotalMixController(
		async (address) => {
			if (address === '/1/busPlayback') {
				controller.handleMessage({ address: '/1/trackname1', args: ['AN 1/2'] })
				controller.handleMessage({ address: '/1/trackname2', args: ['ADAT 15/16'] })
				controller.handleMessage({ address: '/1/trackname3', args: ['n.a.'] })
			}
		},
		{ bankSize: 48, syncTimeoutMs: 100, selectionDelayMs: 0 },
	)

	await controller.syncChannelNames('playback', 30)
	assert.deepEqual(controller.state.getNamedChannels('playback', 30), [
		{ index: 0, label: 'AN 1/2' },
		{ index: 1, label: 'ADAT 15/16' },
	])
})

test('DURec transport and state feedback use Page 3 OSC commands', async () => {
	const sent = []
	const controller = new TotalMixController(async (address, ...args) => sent.push({ address, args }), {
		bankSize: 48,
		syncTimeoutMs: 100,
		selectionDelayMs: 0,
	})

	await controller.duRecTransport('playPause')
	assert.deepEqual(sent, [{ address: '/3/recordPlayPause', args: [1] }])
	controller.handleMessage({ address: '/3/recordState', args: ['Play'] })
	controller.handleMessage({ address: '/3/recordTime', args: ['00:01:23'] })
	assert.equal(controller.state.getGlobalParameter('recordState').value, 'Play')
	assert.equal(controller.state.getGlobalParameter('recordTime').value, '00:01:23')
})

test('legacy DURec Record / Stop confirms TotalMix recording stop with a second trigger', async () => {
	const sent = []
	const controller = new TotalMixController(async (address, ...args) => sent.push({ address, args }), {
		bankSize: 48,
		syncTimeoutMs: 100,
		selectionDelayMs: 0,
	})

	controller.handleMessage({ address: '/3/recordState', args: ['Stop'] })
	await controller.duRecTransport('recordStop')
	controller.handleMessage({ address: '/3/recordState', args: ['Record'] })
	await controller.duRecTransport('recordStop')

	assert.deepEqual(sent, [
		{ address: '/3/recordRecordStart', args: [1] },
		{ address: '/3/recordStop', args: [1] },
		{ address: '/3/recordStop', args: [1] },
	])
})

test('global FX retains formatted feedback regardless of OSC message order', () => {
	const controller = new TotalMixController(async () => {}, {
		bankSize: 48,
		syncTimeoutMs: 100,
		selectionDelayMs: 0,
	})

	controller.handleMessage({ address: '/3/reverbVolumeVal', args: ['-12.0 dB'] })
	controller.handleMessage({ address: '/3/reverbVolume', args: [0.42] })
	assert.equal(controller.state.getGlobalParameter('reverbVolume').value, 0.42)
	assert.equal(controller.state.getGlobalParameter('reverbVolume').display, '-12.0 dB')
})

test('Room EQ selects output and channel side before setting a parameter', async () => {
	const sent = []
	let controller
	controller = new TotalMixController(
		async (address, ...args) => {
			sent.push({ address, args })
			if (address === '/4/reqEnable' && args[0] === 0) {
				controller.handleMessage({ address: '/4/leftChannel', args: [1] })
				controller.handleMessage({ address: '/4/rightChannel', args: [0] })
			}
		},
		{ bankSize: 8, syncTimeoutMs: 100, selectionDelayMs: 0 },
	)

	await controller.setRoomEqParameter(9, 'left', 'reqGain1', 0.75)
	assert.deepEqual(sent, [
		{ address: '/setBankStart', args: [8] },
		{ address: '/setOffsetInBank', args: [1] },
		{ address: '/4/reqEnable', args: [0] },
		{ address: '/4/reqGain1', args: [0.75] },
	])
	assert.equal(controller.state.getChannelParameter({ bus: 'output', index: 9 }, 'roomEq:left:reqGain1').value, 0.75)
})
