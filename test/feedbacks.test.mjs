import assert from 'node:assert/strict'
import test from 'node:test'
import { UpdateFeedbacks } from '../dist/feedbacks.js'
import { TotalMixStateStore } from '../dist/state/store.js'

function createModuleStub() {
	const registered = []
	const self = {
		config: { protocolMode: 'global' },
		connectionActive: true,
		profile: {
			inputs: [
				{ index: 0, label: 'AN 1' },
				{ index: 14, label: 'ADAT 1' },
			],
			playbacks: [],
			outputs: [{ index: 0, label: 'AN 1/2' }],
			capabilities: {
				inputGainChannels: [0],
				inputGainRanges: { 0: { min: 0, max: 75, instrument: { min: 8, max: 50 } } },
				phantomChannels: [0],
				instrumentChannels: [0],
				padChannels: [0],
				autosetChannels: [0],
				duRec: false,
				channelFx: true,
				globalFx: true,
				roomEq: true,
			},
		},
		controller: { state: new TotalMixStateStore() },
		getChoiceChannels: (bus) =>
			bus === 'input' ? self.profile.inputs : bus === 'playback' ? self.profile.playbacks : self.profile.outputs,
		setFeedbackDefinitions: (definitions) => {
			self.definitions = definitions
		},
		registerFeedbackRoute: (target, field, unit) => registered.push({ kind: 'route', target, field, unit }),
		registerFeedbackChannel: (target) => registered.push({ kind: 'channel', target }),
		registerFeedbackOutput: (target, field, unit) => registered.push({ kind: 'output', target, field, unit }),
		registerGlobalFeedback: (target) => registered.push({ kind: 'global', target }),
		registerChannelParameterFeedback: (target, parameter) => registered.push({ kind: 'parameter', target, parameter }),
		registerRoomEqFeedback: (output, side, parameter) => registered.push({ kind: 'roomEq', output, side, parameter }),
	}
	UpdateFeedbacks(self)
	return { self, registered }
}

test('submix fader Value feedback supplies a preset-local display value', () => {
	const { self, registered } = createModuleStub()
	const feedback = self.definitions.submix_fader_value
	const event = { options: { source: 'input:0', output: 0, unit: 'db' } }

	assert.equal(feedback.callback(event), '')
	self.controller.state.setRoute({ bus: 'input', index: 0, output: 0 }, 0.66, 'confirmed')
	self.controller.state.setRouteDisplay({ bus: 'input', index: 0, output: 0 }, '-5.2 dB')
	assert.equal(feedback.callback(event), '-5.2 dB')
	assert.deepEqual(registered.at(-1), {
		kind: 'route',
		target: { bus: 'input', index: 0, output: 0 },
		field: 'fader',
		unit: 'db',
	})
})

test('output fader Value feedback returns normalized state and registers the output', () => {
	const { self, registered } = createModuleStub()
	self.controller.state.setOutput(0, 0.123456, 'confirmed')
	const value = self.definitions.output_fader_value.callback({ options: { output: 0, unit: 'normalized' } })

	assert.equal(value, 0.1235)
	assert.deepEqual(registered.at(-1), { kind: 'output', target: 0, field: 'fader', unit: 'normalized' })
})

test('preset target feedbacks serialize one reusable mixer selection', () => {
	const { self } = createModuleStub()
	assert.deepEqual(
		self.definitions.input_target.options[0].choices.map((choice) => choice.id),
		[0],
	)
	assert.equal(
		self.definitions.mixer_target.callback({
			options: { row: 'playback', inputSource: 0, playbackSource: 3, destination: 4, output: 0 },
		}),
		'playback:3:4',
	)
	assert.equal(self.definitions.input_target.callback({ options: { input: 0 } }), 'input:0:0')
	assert.equal(self.definitions.output_target.callback({ options: { output: 0 } }), 'output:0')
})

test('target-bound encoder fader, channel name, and mute feedbacks share the same selection', () => {
	const { self, registered } = createModuleStub()
	const route = { bus: 'input', index: 0, output: 0 }
	const routeTarget = JSON.stringify({ row: 'input', source: 0, destination: 0 })
	self.controller.state.setRoute(route, 0.66, 'confirmed', '-5.2 dB')
	self.controller.state.setChannelName({ bus: 'input', index: 0 }, 'Vocal')

	assert.equal(
		self.definitions.preset_value.callback({
			options: {
				target: routeTarget,
				valueType: 'fader_db',
			},
		}),
		'-5.2 dB',
	)
	assert.equal(
		self.definitions.preset_value.callback({
			options: { target: routeTarget, valueType: 'channel_name' },
		}),
		'Vocal',
	)

	const outputTarget = JSON.stringify({ row: 'output', output: 0 })
	self.controller.state.setChannelParameter({ bus: 'output', index: 0 }, 'mute', true, 'confirmed')
	assert.equal(self.definitions.preset_state.callback({ options: { target: outputTarget, stateType: 'mute' } }), true)
	assert.deepEqual(registered.at(-1), {
		kind: 'parameter',
		target: { bus: 'output', index: 0 },
		parameter: 'mute',
	})
})

test('target-bound encoder feedbacks do not expose fallback mixer selectors', () => {
	const { self } = createModuleStub()
	const forbidden = new Set(['row', 'source', 'inputSource', 'playbackSource', 'destination', 'output'])
	for (const id of ['preset_value', 'preset_state']) {
		const optionIds = self.definitions[id].options.map((option) => option.id)
		assert.deepEqual(
			optionIds.filter((optionId) => forbidden.has(optionId)),
			[],
		)
	}
})

test('OSC solo state is presented as PFL in the Companion UI', () => {
	const { self } = createModuleStub()
	assert.equal(self.definitions.solo_state.name, 'Channel PFL is active')
})

test('pan feedback provides a numeric gauge value and L/C/R display positions', () => {
	const { self, registered } = createModuleStub()
	const options = { row: 'input', inputSource: 0, playbackSource: 0, destination: 0, output: 0 }
	const target = { bus: 'input', index: 0, output: 0 }

	self.controller.state.setRoutePan(target, 0, 'confirmed', 'legacy display')
	assert.equal(self.definitions.pan_value.callback({ options }), -100)
	assert.equal(self.definitions.pan_display_value.callback({ options }), 'L')

	self.controller.state.setRoutePan(target, 0.625, 'confirmed')
	assert.equal(self.definitions.pan_value.callback({ options }), 25)
	assert.equal(self.definitions.pan_display_value.callback({ options }), 25)
	assert.equal(self.definitions.pan_centered.callback({ options }), false)

	self.controller.state.setRoutePan(target, 0.5, 'confirmed')
	assert.equal(self.definitions.pan_value.callback({ options }), 0)
	assert.equal(self.definitions.pan_display_value.callback({ options }), 'C')
	assert.equal(self.definitions.pan_centered.callback({ options }), true)

	self.controller.state.setRoutePan(target, 1, 'confirmed')
	assert.equal(self.definitions.pan_value.callback({ options }), 100)
	assert.equal(self.definitions.pan_display_value.callback({ options }), 'R')
	assert.deepEqual(registered.at(-1), { kind: 'route', target, field: 'pan', unit: undefined })
})

test('active snapshot feedback uses confirmed OSC snapshot state', () => {
	const { self, registered } = createModuleStub()
	self.controller.state.setSnapshot(4, true, 'confirmed')
	assert.equal(self.definitions.active_snapshot.callback({ options: { snapshot: 4 } }), true)
	assert.deepEqual(registered.at(-1), { kind: 'global', target: 'snapshots' })
})

test('group feedback uses confirmed Page 3 state', () => {
	const { self, registered } = createModuleStub()
	self.controller.state.setGlobalParameter('group:pfl:2', true, 'confirmed')
	assert.equal(self.definitions.group_state.callback({ options: { groupType: 'pfl', group: 2 } }), true)
	assert.deepEqual(registered.at(-1), { kind: 'global', target: 'groups' })
})

test('hardware feedbacks expose TotalMix display values', () => {
	const { self, registered } = createModuleStub()
	const target = { bus: 'input', index: 0 }
	self.controller.state.setChannelParameter(target, 'gain', 0.5, 'confirmed')
	self.controller.state.setChannelParameterDisplay(target, 'gain', '32 dB')
	assert.equal(self.definitions.input_gain_value.callback({ options: { input: 0 } }), '32.0')
	assert.deepEqual(registered.at(-1), { kind: 'parameter', target, parameter: 'gain' })
})

test('input gain gauge value follows the device and input-mode range', () => {
	const { self, registered } = createModuleStub()
	const target = { bus: 'input', index: 0 }
	self.controller.state.setChannelParameter(target, 'gain', 37.5, 'confirmed')
	assert.equal(self.definitions.input_gain_normalized.callback({ options: { input: 0 } }), 0.5)
	assert.deepEqual(registered.at(-1), { kind: 'parameter', target, parameter: 'instrument' })

	self.controller.state.setChannelParameter(target, 'instrument', true, 'confirmed')
	self.controller.state.setChannelParameter(target, 'gain', 29, 'confirmed')
	assert.equal(self.definitions.input_gain_normalized.callback({ options: { input: 0 } }), 0.5)
})

test('input gain gauge does not invent a range for an unknown Global OSC device', () => {
	const { self } = createModuleStub()
	const target = { bus: 'input', index: 0 }
	self.controller.state.setDetectedDevice('Future RME Interface')
	self.controller.state.setChannelParameter(target, 'gain', 20, 'confirmed')
	assert.equal(self.definitions.input_gain_normalized.callback({ options: { input: 0 } }), '')
})

test('legacy input gain feedback waits for TotalMix formatted gain instead of showing normalized OSC', () => {
	const { self } = createModuleStub()
	self.config.protocolMode = '1.96'
	UpdateFeedbacks(self)
	const target = { bus: 'input', index: 0 }
	self.controller.state.setChannelParameter(target, 'gain', 1, 'confirmed')
	assert.equal(self.definitions.input_gain_value.callback({ options: { input: 0 } }), '')
	self.controller.state.setChannelParameterDisplay(target, 'gain', '47 dB')
	assert.equal(self.definitions.input_gain_value.callback({ options: { input: 0 } }), '47.0')
	assert.equal(self.definitions.input_gain_normalized.callback({ options: { input: 0 } }), 1)
})

test('channel option feedbacks expose binary and formatted values', () => {
	const { self, registered } = createModuleStub()
	const target = { bus: 'output', index: 0 }
	self.controller.state.setChannelParameter(target, 'noTrim', true, 'confirmed')
	self.controller.state.setChannelParameter(target, 'width', 0.5, 'confirmed', '1.00')
	const base = { row: 'output', inputSource: 0, playbackSource: 0, output: 0 }
	assert.equal(self.definitions.channel_option_state.callback({ options: { ...base, channelOption: 'noTrim' } }), true)
	self.controller.state.setChannelParameter(target, 'mute', true, 'confirmed')
	assert.equal(self.definitions.channel_option_state.callback({ options: { ...base, channelOption: 'mute' } }), true)
	assert.equal(self.definitions.channel_option_value.callback({ options: { ...base, channelOption: 'width' } }), '1.00')
	assert.deepEqual(registered.at(-1), { kind: 'parameter', target, parameter: 'width' })
})

test('channel level threshold detects either meter side in dBFS', () => {
	const { self, registered } = createModuleStub()
	const target = { bus: 'input', index: 0 }
	self.controller.state.setChannelLevel(target, 'left', -3, 'confirmed')
	self.controller.state.setChannelLevelDisplay(target, 'left', '-3.0 dBFS')
	self.controller.state.setChannelLevel(target, 'right', -0.2, 'confirmed')
	self.controller.state.setChannelLevelDisplay(target, 'right', '-0,2 dBFS')
	const base = { row: 'input', inputSource: 0, playbackSource: 0, output: 0, threshold: -1 }
	assert.equal(self.definitions.channel_level_threshold.callback({ options: { ...base, side: 'either' } }), true)
	assert.equal(self.definitions.channel_level_threshold.callback({ options: { ...base, side: 'left' } }), false)
	assert.equal(self.definitions.channel_level_threshold.callback({ options: { ...base, side: 'right' } }), true)
	assert.deepEqual(registered.at(-1), { kind: 'channel', target })
})

test('channel name and meter feedbacks expose Page 1 state', () => {
	const { self } = createModuleStub()
	const target = { bus: 'input', index: 0 }
	self.controller.state.setChannelName(target, 'Vocal')
	self.controller.state.setChannelLevel(target, 'left', 0.8, 'confirmed')
	self.controller.state.setChannelLevelDisplay(target, 'left', '-1.9 dBFS')
	const options = { row: 'input', inputSource: 0, playbackSource: 0, output: 0 }
	assert.equal(self.definitions.channel_name.callback({ options }), 'Vocal')
	assert.equal(self.definitions.channel_level.callback({ options: { ...options, side: 'left' } }), '-1.9 dBFS')
	self.controller.state.setChannelName(target, 'ADAT 15/16')
	assert.equal(self.definitions.channel_name.callback({ options }), 'ADAT 15/16')
	assert.equal(self.definitions.channel_name_gauge.callback({ options }), 'ADAT\n15/16')
})

test('Room EQ feedback registers the exact output, side, and parameter', () => {
	const { self, registered } = createModuleStub()
	const target = { bus: 'output', index: 0 }
	self.controller.state.setChannelParameter(target, 'roomEq:left:reqGain1', 0.25, 'confirmed', '-6 dB')
	assert.equal(
		self.definitions.room_eq_value.callback({ options: { output: 0, side: 'left', parameter: 'reqGain1' } }),
		'-6 dB',
	)
	assert.deepEqual(registered.at(-1), { kind: 'roomEq', output: 0, side: 'left', parameter: 'reqGain1' })
})

test('DURec feedbacks provide startup-safe values and playing/recording states', () => {
	const { self, registered } = createModuleStub()
	self.profile.capabilities.duRec = true
	UpdateFeedbacks(self)

	assert.equal(self.definitions.durec_state.callback({ options: {} }), '—')
	assert.equal(self.definitions.durec_time.callback({ options: {} }), '00:00:00')
	self.controller.state.setGlobalParameter('recordState', 'Play', 'confirmed')
	self.controller.state.setGlobalParameter('recordTime', '00:01:23', 'confirmed')
	assert.equal(self.definitions.durec_state.callback({ options: {} }), 'Play')
	assert.equal(self.definitions.durec_time.callback({ options: {} }), '00:01:23')
	assert.equal(self.definitions.durec_playing.callback({ options: {} }), true)
	assert.equal(self.definitions.durec_recording.callback({ options: {} }), false)
	self.controller.state.setGlobalParameter('recordState', 'Record', 'confirmed')
	assert.equal(self.definitions.durec_playing.callback({ options: {} }), false)
	assert.equal(self.definitions.durec_recording.callback({ options: {} }), true)
	assert.deepEqual(registered.at(-1), { kind: 'global', target: 'duRec' })
})
