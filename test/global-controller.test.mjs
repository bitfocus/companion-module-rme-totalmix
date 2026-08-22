import assert from 'node:assert/strict'
import test from 'node:test'
import { TotalMixController } from '../dist/protocol/controller.js'

function createController(sender) {
	return new TotalMixController(sender, {
		bankSize: 48,
		syncTimeoutMs: 100,
		selectionDelayMs: 0,
		protocolMode: 'global',
	})
}

test('Global OSC initializes all settings and active mixer nodes', async () => {
	const sent = []
	const controller = createController(async (address, ...args) => sent.push({ address, args }))
	await controller.requestInitialState()
	assert.deepEqual(sent, [{ address: '/sendall', args: [2] }])
})

test('Global OSC addresses submix and output faders without selector commands', async () => {
	const sent = []
	const controller = createController(async (address, ...args) => sent.push({ address, args }))
	await controller.setSubmixFader({ bus: 'input', index: 3, output: 8 }, -6, 'db')
	await controller.setOutputFader(4, 0.75, 'normalized')
	assert.equal(sent[0].address, '/mix/in/3/8/faderlin')
	assert.ok(Math.abs(sent[0].args[0] - 0.6344) < 0.001)
	assert.deepEqual(sent[1], { address: '/output/4/faderlin', args: [0.75] })
	assert.equal(controller.state.getRoute({ bus: 'input', index: 3, output: 8 }).display, '-6.0 dB')
	assert.equal(controller.state.getOutput(4).display, '-2.2 dB')
})

test('Global OSC feedback populates direct route, channel, snapshot, and status state', () => {
	const controller = createController(async () => undefined)
	controller.handleMessage({ address: '/mix/pb/2/6/faderlin', args: [0.42] })
	controller.handleMessage({ address: '/input/1/name', args: ['Vocal'] })
	controller.handleMessage({ address: '/input/1/color', args: [1] })
	controller.handleMessage({ address: '/input/1/mute', args: [1] })
	controller.handleMessage({ address: '/input/1/pfl', args: [0] })
	controller.handleMessage({ address: '/snapshot/load/4', args: [2] })
	controller.handleMessage({ address: '/status/device', args: ['Fireface UFX II'] })
	controller.handleMessage({ address: '/status/dsp', args: [17.5] })

	assert.equal(controller.state.getRoute({ bus: 'playback', index: 2, output: 6 }).value, 0.42)
	assert.deepEqual(controller.state.getNamedChannels('input', 4), [{ index: 1, label: 'Vocal' }])
	assert.equal(controller.state.getChannel({ bus: 'input', index: 1 }).mute.value, true)
	assert.equal(controller.state.getChannel({ bus: 'input', index: 1 }).solo.value, false)
	assert.equal(controller.state.activeSnapshot, 4)
	assert.equal(controller.state.detectedDevice, 'Fireface UFX II')
	assert.equal(controller.state.getGlobalParameter('status:dsp').value, 17.5)
})

test('Global OSC maps PFL, channel options, output mute, pan, snapshots, and groups to direct addresses', async () => {
	const sent = []
	const controller = createController(async (address, ...args) => sent.push({ address, args }))
	controller.handleMessage({ address: '/playback/5/pfl', args: [0] })
	controller.handleMessage({ address: '/input/2/48v', args: [0] })
	controller.handleMessage({ address: '/output/3/mute', args: [0] })
	controller.handleMessage({ address: '/mutegroup/2', args: [0] })
	assert.equal(controller.state.getChannelParameter({ bus: 'output', index: 3 }, 'mute').value, false)
	assert.equal(typeof controller.state.getChannelParameter({ bus: 'output', index: 3 }, 'mute').value, 'boolean')

	await controller.setSolo({ bus: 'playback', index: 5 }, 'toggle')
	await controller.setChannelOption({ bus: 'input', index: 2 }, 'phantom', 'on')
	await controller.setChannelOption({ bus: 'output', index: 3 }, 'mute', 'toggle')
	await controller.setSubmixPan({ bus: 'input', index: 2, output: 7 }, 25)
	await controller.recallSnapshot(3)
	await controller.saveSnapshot(3)
	await controller.setGroup('mute', 2, 'on')

	assert.deepEqual(sent, [
		{ address: '/playback/5/pfl', args: [1] },
		{ address: '/input/2/48v', args: [1] },
		{ address: '/output/3/mute', args: [1] },
		{ address: '/mix/in/2/7/balpan', args: [0.25] },
		{ address: '/snapshot/load/3', args: [1] },
		{ address: '/snapshot/save/3', args: [1] },
		{ address: '/mutegroup/2', args: [1] },
	])
	assert.equal(controller.state.getChannelParameter({ bus: 'output', index: 3 }, 'mute').value, true)
	assert.equal(typeof controller.state.getChannelParameter({ bus: 'output', index: 3 }, 'mute').value, 'boolean')
})

test('Global OSC relative faders request the selected output submix directly', async () => {
	const sent = []
	let controller
	controller = createController(async (address, ...args) => {
		sent.push({ address, args })
		if (address === '/sendsubmix/9') {
			controller.handleMessage({ address: '/mix/in/4/9/faderlin', args: [0.5] })
		}
	})
	await controller.adjustSubmixFader({ bus: 'input', index: 4, output: 9 }, 0.1, 'normalized')
	assert.deepEqual(sent, [
		{ address: '/sendsubmix/9', args: [1] },
		{ address: '/mix/in/4/9/faderlin', args: [0.6] },
	])
})

test('Global OSC DURec play/pause follows returned transport state and Stop also stops recording', async () => {
	const sent = []
	const controller = createController(async (address, ...args) => sent.push({ address, args }))
	controller.handleMessage({ address: '/durec/state', args: ['Play'] })
	await controller.duRecTransport('playPause')
	await controller.duRecTransport('stop')
	assert.deepEqual(sent, [
		{ address: '/durec/pause', args: [1] },
		{ address: '/sendstate', args: [1] },
		{ address: '/durec/stop', args: [11] },
		{ address: '/sendstate', args: [1] },
	])
	assert.equal(controller.state.getGlobalParameter('recordState').value, 'Stop')
})

test('Global OSC DURec record/stop follows the confirmed recorder state', async () => {
	const sent = []
	const controller = createController(async (address, ...args) => sent.push({ address, args }))
	controller.handleMessage({ address: '/durec/state', args: ['Stop'] })
	await controller.duRecTransport('recordStop')
	await controller.duRecTransport('recordStop')
	assert.deepEqual(sent, [
		{ address: '/durec/record', args: [1] },
		{ address: '/sendstate', args: [1] },
		{ address: '/durec/stop', args: [11] },
		{ address: '/sendstate', args: [1] },
	])
	assert.equal(controller.state.getGlobalParameter('recordState').value, 'Stop')
})

test('Global OSC supports direct channel names and uses settings for snapshot refresh', async () => {
	const sent = []
	const controller = createController(async (address, ...args) => sent.push({ address, args }))
	await controller.setChannelName({ bus: 'input', index: 2 }, 'Host')
	await controller.syncSnapshots()
	assert.deepEqual(sent, [
		{ address: '/input/2/name', args: ['Host'] },
		{ address: '/sendsettings', args: [1] },
	])
	assert.deepEqual(controller.state.getNamedChannels('input', 4), [{ index: 2, label: 'Host' }])
})

test('Global OSC discovers channels and capabilities for devices without a static profile', () => {
	const controller = createController(async () => undefined)
	controller.handleMessage({ address: '/status/device', args: ['Fireface UCX III'] })
	controller.handleMessage({ address: '/input/63/name', args: ['MADI 64'] })
	controller.handleMessage({ address: '/input/63/color', args: [1] })
	controller.handleMessage({ address: '/input/63/gain', args: [18] })
	controller.handleMessage({ address: '/input/63/48v', args: [1] })
	controller.handleMessage({ address: '/playback/95/name', args: ['USB 96'] })
	controller.handleMessage({ address: '/output/127/name', args: ['Phones 1/2'] })
	controller.handleMessage({ address: '/output/127/roomeq/enable', args: [1] })
	controller.handleMessage({ address: '/input/63/eq/enable', args: [1] })
	controller.handleMessage({ address: '/reverb/enable', args: [1] })
	controller.handleMessage({ address: '/durec/state', args: ['Stop'] })

	assert.equal(controller.state.detectedDevice, 'Fireface UCX III')
	assert.deepEqual(controller.state.getDiscoveredChannels('input'), [{ index: 63, label: 'MADI 64' }])
	assert.deepEqual(controller.state.getDiscoveredChannels('playback'), [{ index: 95, label: 'USB 96' }])
	assert.deepEqual(controller.state.getDiscoveredChannels('output'), [{ index: 127, label: 'Phones 1/2' }])
	assert.deepEqual(controller.state.getDiscoveredCapabilities(), {
		inputGainChannels: [63],
		phantomChannels: [63],
		instrumentChannels: [],
		padChannels: [],
		autosetChannels: [],
		duRec: true,
		channelFx: true,
		globalFx: true,
		roomEq: true,
	})
})

test('Global OSC omits hidden dynamically discovered channels', () => {
	const controller = createController(async () => undefined)
	controller.handleMessage({ address: '/input/4/name', args: ['Hidden input'] })
	controller.handleMessage({ address: '/input/4/color', args: [0] })
	controller.handleMessage({ address: '/input/7/mute', args: [0] })

	assert.deepEqual(controller.state.getDiscoveredChannels('input'), [{ index: 7, label: 'Input 8' }])
})

test('Global OSC presents stereo pairs as one channel and restores both mono channels', () => {
	const controller = createController(async () => undefined)
	const fallback = [
		{ index: 14, label: 'ADAT 1' },
		{ index: 15, label: 'ADAT 2' },
	]
	controller.handleMessage({ address: '/input/14/name', args: ['ADAT 1/2'] })
	controller.handleMessage({ address: '/input/14/stereo', args: [1] })
	controller.handleMessage({ address: '/input/15/fader', args: [-20] })

	assert.deepEqual(controller.state.getDiscoveredChannels('input', fallback), [{ index: 14, label: 'ADAT 1/2' }])
	const revision = controller.state.discoveryRevision

	controller.handleMessage({ address: '/input/14/stereo', args: [0] })
	controller.handleMessage({ address: '/input/14/name', args: ['ADAT 1'] })
	assert.ok(controller.state.discoveryRevision > revision)
	assert.deepEqual(controller.state.getDiscoveredChannels('input', fallback), [
		{ index: 14, label: 'ADAT 1' },
		{ index: 15, label: 'ADAT 2' },
	])
})

test('Global OSC infers a numeric stereo pair while its stereo setting is still pending', () => {
	const controller = createController(async () => undefined)
	const fallback = [
		{ index: 22, label: 'ADAT 9' },
		{ index: 23, label: 'ADAT 10' },
	]
	controller.handleMessage({ address: '/input/22/name', args: ['ADAT 9/10'] })
	controller.handleMessage({ address: '/input/23/fader', args: [-20] })

	assert.deepEqual(controller.state.getDiscoveredChannels('input', fallback), [{ index: 22, label: 'ADAT 9/10' }])

	controller.handleMessage({ address: '/input/22/stereo', args: [0] })
	assert.deepEqual(controller.state.getDiscoveredChannels('input', fallback), [
		{ index: 22, label: 'ADAT 9/10' },
		{ index: 23, label: 'ADAT 10' },
	])
})

test('Repeated Global OSC metadata does not trigger another definition revision', () => {
	const controller = createController(async () => undefined)
	controller.handleMessage({ address: '/status/device', args: ['Fireface UFX II'] })
	controller.handleMessage({ address: '/input/0/name', args: ['AN 1'] })
	controller.handleMessage({ address: '/input/0/color', args: [1] })
	const revision = controller.state.discoveryRevision

	controller.handleMessage({ address: '/status/device', args: ['Fireface UFX II'] })
	controller.handleMessage({ address: '/input/0/name', args: ['AN 1'] })
	controller.handleMessage({ address: '/input/0/color', args: [1] })
	assert.equal(controller.state.discoveryRevision, revision)

	controller.handleMessage({ address: '/input/0/name', args: ['Vocal'] })
	assert.equal(controller.state.discoveryRevision, revision + 1)
})
