import assert from 'node:assert/strict'
import test from 'node:test'
import { UpdateActions } from '../dist/actions.js'

function createModuleStub(protocolMode = 'global') {
	const calls = []
	const published = []
	const self = {
		config: { protocolMode },
		profile: {
			inputs: [
				{ index: 0, label: 'AN 1' },
				{ index: 1, label: 'AN 2' },
			],
			playbacks: [
				{ index: 0, label: 'Software 1' },
				{ index: 1, label: 'Software 2' },
			],
			outputs: [{ index: 0, label: 'AN 1/2' }],
			capabilities: {
				inputGainChannels: [0, 1],
				inputGainRanges: {
					0: { min: 0, max: 12, step: 0.5 },
					1: { min: 0, max: 75, step: 1 },
				},
				phantomChannels: [0, 1],
				instrumentChannels: [1],
				padChannels: [0],
				autosetChannels: [0, 1],
				duRec: false,
				channelFx: true,
				globalFx: true,
				roomEq: true,
			},
		},
		controller: {
			setSubmixFader: async (...args) => calls.push(['setSubmixFader', ...args]),
			adjustSubmixFader: async (...args) => calls.push(['adjustSubmixFader', ...args]),
			setOutputFader: async (...args) => calls.push(['setOutputFader', ...args]),
			adjustOutputFader: async (...args) => calls.push(['adjustOutputFader', ...args]),
			adjustSubmixPan: async (...args) => calls.push(['adjustSubmixPan', ...args]),
			adjustOutputPan: async (...args) => calls.push(['adjustOutputPan', ...args]),
			adjustInputGain: async (...args) => calls.push(['adjustInputGain', ...args]),
			setMute: async (...args) => calls.push(['setMute', ...args]),
			setChannelOption: async (...args) => calls.push(['setChannelOption', ...args]),
			setChannelParameterValue: async (...args) => calls.push(['setChannelParameterValue', ...args]),
			setChannelParameterDirect: async (...args) => calls.push(['setChannelParameterDirect', ...args]),
			setGroup: async (...args) => calls.push(['setGroup', ...args]),
			undoRedo: async (...args) => calls.push(['undoRedo', ...args]),
		},
		getChoiceChannels: (bus) =>
			bus === 'input' ? self.profile.inputs : bus === 'playback' ? self.profile.playbacks : self.profile.outputs,
		setActionDefinitions: (definitions) => {
			self.definitions = definitions
		},
		registerFeedbackRoute: (...args) => published.push(['route', ...args]),
		registerFeedbackChannel: () => undefined,
		registerFeedbackOutput: (...args) => published.push(['output', ...args]),
		registerChannelParameterFeedback: () => undefined,
		registerRoomEqFeedback: () => undefined,
		runCommand: async (operation) => operation(),
		refreshChannelNames: () => calls.push(['refreshChannelNames']),
	}
	UpdateActions(self)
	return { self, calls, published }
}

test('fader actions expose row-specific source, destination, and output fields', () => {
	const { self } = createModuleStub()
	assert.deepEqual(Object.keys(self.definitions).slice(0, 2), ['adjust_fader', 'set_fader'])
	const options = Object.fromEntries(self.definitions.set_fader.options.map((option) => [option.id, option]))
	assert.equal(self.definitions.set_fader.options[0].id, 'row')
	assert.deepEqual(
		options.row.choices.map((choice) => choice.id),
		['input', 'playback', 'output'],
	)
	assert.equal(options.row.isVisibleExpression, undefined)
	assert.equal(options.inputSource.isVisibleExpression, "$(options:row) == 'input'")
	assert.equal(options.playbackSource.isVisibleExpression, "$(options:row) == 'playback'")
	assert.equal(options.destination.isVisibleExpression, "$(options:row) != 'output'")
	assert.equal(options.output.isVisibleExpression, "$(options:row) == 'output'")
})

test('actions are ordered by workflow and category', () => {
	const { self } = createModuleStub()
	assert.deepEqual(Object.keys(self.definitions), [
		'adjust_fader',
		'set_fader',
		'adjust_pan',
		'set_pan',
		'set_mute',
		'set_solo',
		'set_group',
		'set_loopback',
		'adjust_input_gain',
		'set_input_gain',
		'set_phantom',
		'set_instrument',
		'set_pad',
		'set_autoset',
		'preset_adjust_fader',
		'preset_adjust_pan',
		'preset_set_pan',
		'preset_set_mute',
		'preset_adjust_input_gain',
		'preset_set_autoset',
		'channel_option',
		'set_channel_name',
		'control_room',
		'recall_main_volume',
		'recall_snapshot',
		'save_snapshot',
		'load_layout_preset',
		'load_quick_workspace',
		'show_totalmix_window',
		'undo_redo',
		'durec_transport',
		'durec_channel_record',
		'channel_processing_switch',
		'set_channel_processing_parameter',
		'global_fx_switch',
		'set_global_fx_parameter',
		'room_eq_switch',
		'set_room_eq_parameter',
		'resync_target',
	])
})

test('DURec transport uses concise record command names and order', () => {
	const { self } = createModuleStub()
	self.profile.capabilities.duRec = true
	UpdateActions(self)
	const command = self.definitions.durec_transport.options.find((option) => option.id === 'command')

	assert.equal(command.default, 'recordStop')
	assert.deepEqual(
		command.choices.slice(0, 4).map((choice) => [choice.id, choice.label]),
		[
			['recordStop', 'Record Toggle'],
			['record', 'Record Start'],
			['stop', 'Record Stop'],
			['playPause', 'Play / Pause'],
		],
	)
})

test('unified channel option routes binary, normalized, and direct values correctly', async () => {
	const { self, calls } = createModuleStub()
	await self.definitions.channel_option.callback({
		options: {
			row: 'output',
			output: 0,
			channelOption: 'stereo',
			operation: 'toggle',
			value: 0.5,
			referenceLevel: 0,
		},
	})
	await self.definitions.channel_option.callback({
		options: {
			row: 'input',
			inputSource: 0,
			channelOption: 'width',
			operation: 'toggle',
			value: 0.75,
			referenceLevel: 0,
		},
	})
	await self.definitions.channel_option.callback({
		options: {
			row: 'output',
			output: 0,
			channelOption: 'refLevel',
			operation: 'toggle',
			value: 0.5,
			referenceLevel: 2,
		},
	})

	assert.deepEqual(calls, [
		['setChannelOption', { bus: 'output', index: 0 }, 'stereo', 'toggle'],
		['refreshChannelNames'],
		['setChannelParameterValue', { bus: 'input', index: 0 }, 'width', 0.75],
		['setChannelParameterDirect', { bus: 'output', index: 0 }, 'refLevel', 2],
	])
})

test('group and undo actions use their unified controller methods', async () => {
	const { self, calls } = createModuleStub()
	await self.definitions.set_group.callback({ options: { groupType: 'pfl', group: 3, operation: 'on' } })
	await self.definitions.undo_redo.callback({ options: { command: 'redo' } })
	assert.deepEqual(calls, [
		['setGroup', 'pfl', 3, 'on'],
		['undoRedo', 'redo'],
	])
})

test('action choices use channel names discovered from TotalMix', () => {
	const { self } = createModuleStub()
	self.getChoiceChannels = (bus) => {
		if (bus === 'input') return [{ index: 0, label: 'Mic 9' }]
		if (bus === 'playback') return [{ index: 0, label: 'ADAT 15/16' }]
		return [{ index: 0, label: 'Main' }]
	}
	UpdateActions(self)

	const options = Object.fromEntries(self.definitions.set_fader.options.map((option) => [option.id, option]))
	assert.deepEqual(options.inputSource.choices, [{ id: 0, label: 'Mic 9' }])
	assert.deepEqual(options.playbackSource.choices, [{ id: 0, label: 'ADAT 15/16' }])
	assert.deepEqual(options.output.choices, [{ id: 0, label: 'Main' }])
})

test('channel state action names keep operation details in their options', () => {
	const { self } = createModuleStub()
	assert.equal(self.definitions.set_mute.name, 'Mute channel')
	assert.equal(self.definitions.set_solo.name, 'PFL channel')
})

test('set fader routes hardware-output targets to the output controller method', async () => {
	const { self, calls, published } = createModuleStub()
	await self.definitions.set_fader.callback({
		options: { row: 'output', output: 0, unit: 'db', value: -12 },
	})
	assert.deepEqual(calls, [['setOutputFader', 0, -12, 'db']])
	assert.deepEqual(published, [['output', 0, 'fader', 'db']])
})

test('adjust fader routes submix targets to the submix controller method', async () => {
	const { self, calls, published } = createModuleStub()
	await self.definitions.adjust_fader.callback({
		options: { row: 'playback', playbackSource: 1, destination: 0, unit: 'db', amount: 1 },
	})
	assert.deepEqual(calls, [['adjustSubmixFader', { bus: 'playback', index: 1, output: 0 }, 1, 'db']])
	assert.deepEqual(published, [['route', { bus: 'playback', index: 1, output: 0 }, 'fader', 'db']])
})

test('target-bound encoder fader uses only its local target', async () => {
	const { self, calls, published } = createModuleStub()
	const target = JSON.stringify({ row: 'playback', source: 1, destination: 0 })
	await self.definitions.preset_adjust_fader.callback({
		options: {
			unit: 'db',
			amount: 1,
			target,
		},
	})

	assert.deepEqual(calls, [['adjustSubmixFader', { bus: 'playback', index: 1, output: 0 }, 1, 'db']])
	assert.deepEqual(published, [['route', { bus: 'playback', index: 1, output: 0 }, 'fader', 'db']])
})

test('changing a target-bound encoder from AN 1 to AN 2 retargets pan actions', async () => {
	const { self, calls, published } = createModuleStub()
	await self.definitions.preset_adjust_pan.callback({
		options: {
			amount: 5,
			target: 'input:1:0',
		},
	})

	assert.deepEqual(calls, [['adjustSubmixPan', { bus: 'input', index: 1, output: 0 }, 5]])
	assert.deepEqual(published, [['route', { bus: 'input', index: 1, output: 0 }, 'pan']])
})

test('target-bound encoder drives output mute and hardware input gain', async () => {
	const { self, calls } = createModuleStub()
	await self.definitions.preset_set_mute.callback({
		options: {
			operation: 'toggle',
			target: JSON.stringify({ row: 'output', output: 0 }),
		},
	})
	await self.definitions.preset_adjust_input_gain.callback({
		options: {
			amount: 0.5,
			target: JSON.stringify({ row: 'input', source: 1, destination: 0 }),
		},
	})
	await self.definitions.preset_adjust_input_gain.callback({
		options: {
			amount: -0.5,
			target: JSON.stringify({ row: 'input', source: 1, destination: 0 }),
		},
	})

	assert.deepEqual(calls, [
		['setChannelOption', { bus: 'output', index: 0 }, 'mute', 'toggle'],
		['adjustInputGain', 1, 1],
		['adjustInputGain', 1, -1],
	])
})

test('legacy target-bound gain uses the native device step on the normalized OSC scale', async () => {
	const { self, calls } = createModuleStub('legacy196')
	await self.definitions.preset_adjust_input_gain.callback({
		options: {
			amount: 0.01,
			target: JSON.stringify({ row: 'input', source: 0, destination: 0 }),
		},
	})
	await self.definitions.preset_adjust_input_gain.callback({
		options: {
			amount: -0.01,
			target: JSON.stringify({ row: 'input', source: 1, destination: 0 }),
		},
	})

	assert.deepEqual(calls, [
		['adjustInputGain', 0, 0.5 / 12],
		['adjustInputGain', 1, -1 / 75],
	])
})

test('target-bound encoder actions do not expose fallback mixer selectors', () => {
	const { self } = createModuleStub()
	const forbidden = new Set(['row', 'source', 'inputSource', 'playbackSource', 'destination', 'output'])
	for (const id of [
		'preset_adjust_fader',
		'preset_adjust_pan',
		'preset_set_pan',
		'preset_set_mute',
		'preset_adjust_input_gain',
		'preset_set_autoset',
	]) {
		const optionIds = self.definitions[id].options.map((option) => option.id)
		assert.ok(optionIds.includes('target'), `${id} must contain the hidden target binding`)
		assert.ok(
			optionIds.every((optionId) => !forbidden.has(optionId)),
			`${id} contains a fallback selector`,
		)
	}
})
