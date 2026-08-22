import assert from 'node:assert/strict'
import test from 'node:test'
import { UpdatePresets } from '../dist/presets.js'

function createModuleStub() {
	const capabilities = {
		inputGainChannels: [0],
		inputGainRanges: { 0: { min: 0, max: 75 } },
		phantomChannels: [0],
		instrumentChannels: [0],
		padChannels: [0],
		autosetChannels: [0],
		duRec: true,
		channelFx: true,
		globalFx: true,
		roomEq: true,
	}
	const self = {
		config: { protocolMode: 'global' },
		capabilities,
		profile: {
			inputs: [{ index: 0, label: 'AN 1' }],
			playbacks: [{ index: 0, label: 'AN 1/2' }],
			outputs: [{ index: 0, label: 'Main' }],
			capabilities,
		},
		getChoiceChannels: (bus) =>
			bus === 'input' ? self.profile.inputs : bus === 'playback' ? self.profile.playbacks : self.profile.outputs,
		setPresetDefinitions: (structure, presets) => {
			self.structure = structure
			self.presets = presets
		},
	}
	UpdatePresets(self)
	return self
}

test('Stream Deck Plus provides one editable fader without a separate Dim encoder', () => {
	const self = createModuleStub()
	const fader = self.presets['fader-encoder']
	assert.equal(fader.type, 'layered')
	assert.ok(fader.localVariables.some((variable) => variable.variableType === 'feedback'))
	assert.equal(
		fader.localVariables.find((variable) => variable.variableName === 'channel_name').feedbackId,
		'preset_value',
	)
	assert.equal(fader.localVariables.find((variable) => variable.variableName === 'target').feedbackId, 'mixer_target')
	assert.equal(
		fader.localVariables.find((variable) => variable.variableName === 'current_volume').feedbackId,
		'preset_value',
	)
	assert.match(fader.elements.find((element) => element.id === 'label').text, /\$\(local:current_volume\)/)
	assert.equal(fader.elements.find((element) => element.id === 'label').fontsize, 20)
	assert.equal(
		fader.elements.find((element) => element.id === 'volume-gauge'),
		undefined,
	)
	assert.equal(
		fader.localVariables.find((variable) => variable.variableName === 'current_volume_gauge'),
		undefined,
	)
	assert.ok(fader.steps[0].rotate_left.every((action) => action.actionId === 'preset_adjust_fader'))
	assert.ok(fader.steps[0].rotate_right.every((action) => action.actionId === 'preset_adjust_fader'))
	assert.equal(fader.steps[0].rotate_left[0].options.amount, -1)
	assert.equal(fader.steps[0].rotate_right[0].options.amount, 1)
	assert.equal(self.presets['playback-1-submix-encoder'], undefined)
	assert.equal(self.presets['output-an-1-encoder'], undefined)
	assert.equal(self.presets['main-output-dim-encoder'], undefined)
	const main = self.presets['main-fader-encoder']
	assert.equal(main.type, 'layered')
	assert.equal(
		main.elements.find((element) => element.id === 'label').text,
		'$(local:channel_name)\n$(local:current_volume)',
	)
	assert.equal(main.elements.find((element) => element.id === 'label').fontsize, 25)
	assert.equal(
		main.elements.find((element) => element.id === 'volume-gauge'),
		undefined,
	)
	assert.equal(
		main.localVariables.find((variable) => variable.variableName === 'current_volume_gauge'),
		undefined,
	)
	assert.equal(main.steps[0].rotate_left[0].options.output, undefined)
	assert.equal(main.steps[0].rotate_right[0].options.output, undefined)
	assert.equal(main.steps[0].down[0].actionId, 'preset_set_mute')
	assert.equal(main.localVariables.find((variable) => variable.variableName === 'target').feedbackId, 'output_target')
	assert.equal(
		main.localVariables.find((variable) => variable.variableName === 'current_volume').feedbackId,
		'preset_value',
	)
	assert.equal(main.feedbacks[0].feedbackId, 'preset_state')
	assert.equal(
		main.feedbacks[0].styleOverrides.find((override) => override.elementProperty === 'text').override.value,
		'$(local:channel_name)\nMUTED',
	)
	assert.equal(self.presets['input-pan-encoder'].steps[0].rotate_left[0].options.amount, -5)
	assert.equal(self.presets['input-pan-encoder'].steps[0].rotate_right[0].options.amount, 5)
	assert.equal(self.presets['input-pan-encoder'].steps[0].down[0].actionId, 'preset_set_pan')
	assert.equal(self.presets['input-pan-encoder'].steps[0].down[0].options.value, 0)
	const gain = self.presets['input-gain-encoder']
	assert.equal(gain.elements.find((element) => element.id === 'label').fontsize, 20)
	assert.equal(gain.elements.find((element) => element.id === 'gain-gauge').value.value, '$(local:current_gain_gauge)')
	assert.equal(
		gain.localVariables.find((variable) => variable.variableName === 'current_gain_gauge').feedbackId,
		'preset_value',
	)
	assert.equal(
		gain.localVariables.find((variable) => variable.variableName === 'channel_name').feedbackId,
		'preset_value',
	)
	assert.equal(gain.localVariables.find((variable) => variable.variableName === 'target').feedbackId, 'input_target')
	const pan = self.presets['input-pan-encoder']
	assert.equal(
		pan.elements.find((element) => element.id === 'label').text,
		'$(local:channel_name)\nPAN $(local:current_pan_display)',
	)
	assert.equal(
		pan.localVariables.find((variable) => variable.variableName === 'current_pan').feedbackId,
		'preset_value',
	)
	assert.equal(
		pan.localVariables.find((variable) => variable.variableName === 'current_pan_display').feedbackId,
		'preset_value',
	)
	assert.equal(
		pan.localVariables.find((variable) => variable.variableName === 'channel_name').feedbackId,
		'preset_value',
	)
	assert.equal(pan.localVariables.find((variable) => variable.variableName === 'target').feedbackId, 'mixer_target')
	const gauge = pan.elements.find((element) => element.id === 'pan-gauge')
	assert.equal(pan.elements.find((element) => element.id === 'label').fontsize, 20)
	assert.equal(gauge.type, 'gauge')
	assert.equal(gauge.value.value, '$(local:current_pan)')
	assert.equal(gauge.origin, 0)
	assert.equal(gauge.fillEnabled, true)
	assert.equal(gauge.markerEnabled, false)
	assert.equal(gauge.trackAmount, 0)
	assert.equal(gauge.stops[0].color, 15434822)
	const center = pan.elements.find((element) => element.id === 'pan-center')
	assert.equal(center.type, 'circle')
	assert.equal(center.enabled, false)
	assert.equal(center.color, 15434822)
	assert.equal(pan.feedbacks[0].feedbackId, 'preset_state')
	assert.equal(pan.feedbacks[0].styleOverrides[0].elementId, 'pan-center')
	assert.equal(pan.feedbacks[0].styleOverrides[0].elementProperty, 'enabled')
	assert.equal(pan.feedbacks[0].styleOverrides[0].override.value, true)
})

test('Layered encoder feedbacks use Companion value wrappers for optical state', () => {
	const self = createModuleStub()
	const muted = self.presets['fader-encoder'].feedbacks[0]
	assert.equal(muted.feedbackId, 'preset_state')
	assert.ok(muted.styleOverrides.every((override) => override.override.isExpression === false))
	assert.equal(
		muted.styleOverrides.find((override) => override.elementProperty === 'text').override.value,
		'$(local:channel_name)\nMUTED',
	)

	const gain = self.presets['input-gain-encoder']
	assert.equal(gain.feedbacks[0].feedbackId, 'preset_state')
	assert.ok(gain.feedbacks[0].styleOverrides.every((override) => override.override.isExpression === false))
})

test('DURec presets use concise labels, recording time, and transport feedback', () => {
	const self = createModuleStub()
	const record = self.presets['durec-record-stop']
	assert.deepEqual(record.steps[0].down[0], {
		actionId: 'durec_transport',
		options: { command: 'recordStop' },
	})
	assert.equal(record.type, 'layered')
	assert.equal(record.name, 'DURec Record Toggle')
	assert.equal(record.elements.find((element) => element.id === 'label').text, 'REC')
	assert.equal(record.localVariables[0].feedbackId, 'durec_time')
	assert.equal(record.feedbacks[0].feedbackId, 'durec_recording')
	assert.equal(
		record.feedbacks[0].styleOverrides.find((override) => override.elementProperty === 'text').override.value,
		'REC\n$(local:durec_time)',
	)
	const play = self.presets['durec-play-pause']
	assert.equal(play.elements.find((element) => element.id === 'label').text, 'PLAY')
	assert.equal(play.localVariables[0].feedbackId, 'durec_time')
	assert.equal(play.feedbacks[0].feedbackId, 'durec_playing')
	assert.equal(
		play.feedbacks[0].styleOverrides.find((override) => override.elementProperty === 'text').override.value,
		'PAUSE\n$(local:durec_time)',
	)
	assert.equal(self.presets['durec-status'], undefined)
	assert.equal(self.presets['durec-stop'].name, 'DURec Record Stop')
	assert.equal(self.presets['durec-stop'].style.text, 'STOP')
	assert.equal(self.presets['durec-previous'].style.text, 'PREV')
	assert.equal(self.presets['durec-next'].style.text, 'NEXT')
})

test('preset catalog is concise and includes the first-priority controls', () => {
	const self = createModuleStub()
	assert.deepEqual(
		self.structure.map((section) => section.id),
		['stream-deck-plus', 'channel-controls', 'control-room', 'sessions', 'durec'],
	)
	assert.deepEqual(self.structure.find((section) => section.id === 'stream-deck-plus').definitions, [
		'input-gain-encoder',
		'input-pan-encoder',
		'fader-encoder',
		'main-fader-encoder',
	])
	assert.equal(self.presets['input-1-solo'].name, 'Toggle hardware input PFL')
	assert.match(self.presets['input-1-solo'].style.text, /PFL/)
	assert.equal(self.presets['input-1-mute'].style.size, '14')
	assert.equal(self.presets['input-1-solo'].style.size, '14')
	assert.equal(self.presets['input-1-peak'].style.text, 'PEAK')
	assert.deepEqual(self.presets['input-1-peak'].feedbacks[0].options, {
		row: 'input',
		inputSource: 0,
		playbackSource: 0,
		destination: 0,
		output: 0,
		side: 'either',
		threshold: -1,
	})
	assert.equal(self.presets['control-room-mono'].style.size, '14')
	assert.deepEqual(self.presets['control-room-mono'].steps[0].down, [
		{ actionId: 'control_room', options: { control: 'mainMono', operation: 'on' } },
	])
	assert.deepEqual(self.presets['control-room-mono'].steps[0].up, [
		{ actionId: 'control_room', options: { control: 'mainMono', operation: 'off' } },
	])
	assert.equal(self.presets.undo.style.size, '14')
	assert.ok(self.presets['input-phantom'])
	assert.ok(self.presets['input-instrument'])
	assert.ok(self.presets['input-pad'])
	assert.ok(self.presets['input-autoset'])
	assert.equal(self.presets['input-autoset'].style.text, 'AUTO\nSET')
	assert.ok(self.presets['output-loopback'])
	assert.equal(self.presets['output-loopback'].style.text, 'LOOP\nBACK')
	assert.ok(self.presets['control-room-talkback'])
	assert.equal(self.presets['control-room-talkback'].style.text, 'TALK\nBACK')
	assert.equal(self.presets['control-room-speaker-b'].style.text, 'SPEA\nKER B')
	assert.equal(self.presets['snapshot-8-recall'].style.text, 'SNAP 8')
	assert.ok(self.presets.undo)
	assert.ok(self.presets.redo)
	assert.equal(self.presets['connection-status'], undefined)
	assert.ok(
		self.structure.every((section) => section.definitions.every((definition) => typeof definition === 'string')),
	)
	for (const preset of Object.values(self.presets)) {
		if (preset.type === 'simple') assert.equal(preset.style.size, '14')
		else {
			const label = preset.elements.find((element) => element.id === 'label')
			const usesCompactEncoderText =
				preset.name === 'Fader' || preset.elements.some((element) => element.type === 'gauge')
			assert.equal(label.fontsize, usesCompactEncoderText ? 20 : 25)
			assert.equal(label.fontsizeAllowShrink, false)
		}
	}
})

test('Main encoder follows the dynamically reported Main output', () => {
	const self = createModuleStub()
	self.profile.outputs = [
		{ index: 0, label: 'AN 1/2' },
		{ index: 7, label: 'Main' },
	]
	UpdatePresets(self)
	const main = self.presets['main-fader-encoder']
	assert.equal(main.steps[0].rotate_left[0].options.output, undefined)
	assert.equal(main.localVariables.find((variable) => variable.variableName === 'target').options.output, 7)
})

test('encoder presets use one feedback-driven target for actions and dependent feedbacks', () => {
	const self = createModuleStub()
	for (const id of ['fader-encoder', 'main-fader-encoder', 'input-gain-encoder', 'input-pan-encoder']) {
		const preset = self.presets[id]
		const target = preset.localVariables.find((variable) => variable.variableName === 'target')
		assert.equal(target.variableType, 'feedback')
		assert.equal(target.headline, 'Target')

		for (const action of [...preset.steps[0].rotate_left, ...preset.steps[0].rotate_right, ...preset.steps[0].down]) {
			assert.deepEqual(action.options.target, { isExpression: true, value: '$(local:target)' })
			assert.match(action.actionId, /^preset_/)
			assert.equal(action.options.presetTargetMode, undefined)
		}

		for (const variable of preset.localVariables.filter((variable) => variable.variableName !== 'target')) {
			assert.deepEqual(variable.options.target, { isExpression: true, value: '$(local:target)' })
			assert.equal(variable.feedbackId, 'preset_value')
			assert.equal(variable.options.presetTargetMode, undefined)
		}
		for (const feedback of preset.feedbacks) {
			assert.deepEqual(feedback.options.target, { isExpression: true, value: '$(local:target)' })
			assert.equal(feedback.feedbackId, 'preset_state')
			assert.equal(feedback.options.presetTargetMode, undefined)
		}
	}
})

test('target-bound encoder presets contain no duplicate mixer selector options', () => {
	const self = createModuleStub()
	const forbidden = ['row', 'source', 'inputSource', 'playbackSource', 'destination', 'output']
	for (const id of ['fader-encoder', 'main-fader-encoder', 'input-gain-encoder', 'input-pan-encoder']) {
		const preset = self.presets[id]
		const dependent = [
			...preset.steps[0].rotate_left,
			...preset.steps[0].rotate_right,
			...preset.steps[0].down,
			...preset.localVariables.filter((variable) => variable.variableName !== 'target'),
			...preset.feedbacks,
		]
		for (const entry of dependent) {
			for (const key of forbidden) assert.equal(entry.options[key], undefined, `${id} duplicates ${key}`)
		}
	}
})
