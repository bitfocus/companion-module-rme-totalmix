import assert from 'node:assert/strict'
import test from 'node:test'
import { TotalMixStateStore } from '../dist/state/store.js'
import { UpdateVariableDefinitions, UpdateVariableValues } from '../dist/variables.js'

function createModuleStub(protocolMode = 'global') {
	const state = new TotalMixStateStore()
	const registered = []
	const capabilities = {
		inputGainChannels: [],
		phantomChannels: [],
		instrumentChannels: [],
		padChannels: [],
		autosetChannels: [],
		duRec: true,
		channelFx: false,
		globalFx: false,
		roomEq: false,
	}
	const self = {
		config: { protocolMode },
		connectionState: 'connected',
		controller: { state, isGlobalOsc: protocolMode === 'global' },
		profile: { capabilities },
		capabilities,
		registerGlobalFeedback: (target) => registered.push(target),
		publishedTargets: [],
		getPublishedVariableTargets: () => self.publishedTargets,
		keepPublishedVariableTargetAlive: () => undefined,
		setVariableDefinitions: (definitions) => {
			self.definitions = definitions
		},
		setVariableValues: (values) => {
			self.values = values
		},
	}
	return { self, state, registered }
}

test('module variables omit obsolete last-target diagnostics', () => {
	const { self } = createModuleStub()
	UpdateVariableDefinitions(self)
	assert.equal(
		Object.keys(self.definitions).some((id) => id.startsWith('last_')),
		false,
	)
})

test('legacy variable definitions omit Global OSC-only diagnostics', () => {
	const { self } = createModuleStub('1.96')
	UpdateVariableDefinitions(self)

	assert.equal('osc_protocol' in self.definitions, false)
	assert.equal('detected_device' in self.definitions, false)
	assert.equal('totalmix_connection' in self.definitions, false)
	assert.equal('dsp_load' in self.definitions, false)
	assert.equal('active_snapshot' in self.definitions, true)
})

test('Global OSC variable definitions include supported status diagnostics', () => {
	const { self } = createModuleStub()
	UpdateVariableDefinitions(self)

	assert.equal('osc_protocol' in self.definitions, false)
	assert.equal('detected_device' in self.definitions, true)
	assert.equal('totalmix_connection' in self.definitions, true)
	assert.equal('dsp_load' in self.definitions, true)
})

test('DURec variables register synchronization and follow returned state', () => {
	const { self, state, registered } = createModuleStub()
	UpdateVariableValues(self)
	assert.equal(self.values.durec_state, '—')
	assert.equal(self.values.durec_time, '00:00:00')
	assert.deepEqual(registered, ['snapshots', 'duRec'])

	state.setGlobalParameter('recordState', 'Record', 'confirmed')
	state.setGlobalParameter('recordTime', '00:02:34', 'confirmed')
	UpdateVariableValues(self)
	assert.equal(self.values.durec_state, 'Record')
	assert.equal(self.values.durec_time, '00:02:34')
})

test('Global OSC registers DURec synchronization without a static DURec profile', () => {
	const { self, registered } = createModuleStub()
	self.profile.capabilities.duRec = false
	self.capabilities.duRec = false

	UpdateVariableValues(self)
	assert.deepEqual(registered, ['snapshots', 'duRec'])
})

test('active snapshot variable registers synchronization and follows legacy state', () => {
	const { self, state, registered } = createModuleStub('1.96')
	UpdateVariableValues(self)
	assert.equal(self.values.active_snapshot, '')
	assert.deepEqual(registered, ['snapshots', 'duRec'])

	state.setSnapshot(3, true, 'confirmed')
	UpdateVariableValues(self)
	assert.equal(self.values.active_snapshot, 3)
})

test('used feedback targets become stable connection variables', () => {
	const { self, state } = createModuleStub()
	self.publishedTargets = [
		{ kind: 'channel', target: { bus: 'input', index: 0 }, field: 'name' },
		{ kind: 'channel', target: { bus: 'input', index: 0 }, field: 'mute' },
		{
			kind: 'routeFader',
			target: { bus: 'input', index: 0, output: 2 },
			unit: 'db',
		},
		{ kind: 'channelParameter', target: { bus: 'input', index: 8 }, parameter: 'gain' },
	]
	state.setChannelName({ bus: 'input', index: 0 }, 'Vocal')
	state.setChannelName({ bus: 'output', index: 2 }, 'Main')
	state.setMute({ bus: 'input', index: 0 }, true, 'confirmed')
	state.setRoute({ bus: 'input', index: 0, output: 2 }, 0.66, 'confirmed', '-5.2 dB')
	state.setChannelParameter({ bus: 'input', index: 8 }, 'gain', 44, 'confirmed', '44.0 dB')

	UpdateVariableDefinitions(self)
	UpdateVariableValues(self)

	assert.equal(self.definitions.input_1_name.name, 'Vocal channel name')
	assert.equal(self.definitions.route_input_1_to_output_3_fader_db.name, 'Vocal → Main fader (dB)')
	assert.equal(self.values.input_1_name, 'Vocal')
	assert.equal(self.values.input_1_mute, true)
	assert.equal(self.values.route_input_1_to_output_3_fader_db, '-5.2 dB')
	assert.equal(self.values.input_9_gain, '44.0 dB')
})

test('published variable IDs remain index-based when channel names change', () => {
	const { self, state } = createModuleStub()
	self.publishedTargets = [{ kind: 'outputPan', output: 0 }]
	state.setChannelName({ bus: 'output', index: 0 }, 'Main')
	state.setOutputPan(0, 0.6, 'confirmed')

	UpdateVariableDefinitions(self)
	UpdateVariableValues(self)
	assert.equal(self.definitions.output_1_pan.name, 'Main pan/balance')
	assert.equal(self.values.output_1_pan, 20)

	state.setChannelName({ bus: 'output', index: 0 }, 'Monitor')
	UpdateVariableDefinitions(self)
	assert.equal(self.definitions.output_1_pan.name, 'Monitor pan/balance')
	assert.equal('output_1_pan' in self.definitions, true)
})
