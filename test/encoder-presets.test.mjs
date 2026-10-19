import assert from 'node:assert/strict'
import test from 'node:test'
import { UpdateActions } from '../dist/actions.js'
import { UpdateFeedbacks } from '../dist/feedbacks.js'
import { UpdatePresets } from '../dist/presets.js'
import { firefaceUfxII } from '../dist/model/profiles/fireface-ufx-ii.js'
import { TotalMixController } from '../dist/protocol/controller.js'
import { dbToNormalized } from '../dist/protocol/fader-curve.js'

function assertOscWrite(sent, address, value) {
	assert.equal(sent.length, 1)
	assert.equal(sent[0].address, address)
	assert.equal(sent[0].args.length, 1)
	assert.ok(Math.abs(sent[0].args[0] - value) < 1e-7)
}

function createEncoder(presetId) {
	const sent = []
	const controller = new TotalMixController(async (address, ...args) => sent.push({ address, args }), {
		protocolMode: 'global',
		bankSize: 48,
		syncTimeoutMs: 100,
	})
	const self = {
		config: { protocolMode: 'global' },
		profile: firefaceUfxII,
		controller,
		getChoiceChannels: (bus) =>
			bus === 'input'
				? firefaceUfxII.inputs
				: bus === 'playback'
					? firefaceUfxII.playbacks
					: [{ index: 2, label: 'Main' }],
		setActionDefinitions: (definitions) => (self.actions = definitions),
		setFeedbackDefinitions: (definitions) => (self.feedbacks = definitions),
		setPresetDefinitions: (_structure, presets) => (self.presets = presets),
		registerFeedbackChannel: () => undefined,
		registerFeedbackRoute: () => undefined,
		registerFeedbackOutput: () => undefined,
		registerChannelParameterFeedback: () => undefined,
		runCommand: async (operation) => operation(),
	}
	UpdateActions(self)
	UpdateFeedbacks(self)
	UpdatePresets(self)
	const preset = self.presets[presetId]
	const locals = {}

	// Companion 5.0.4 uses defaults for hidden options, without evaluating their
	// expressions or tracking variable dependencies. Model that host boundary
	// before invoking the real module callbacks and OSC controller.
	function resolveOptions(definition, supplied) {
		return Object.fromEntries(
			definition.options.map((field) => {
				if (field.isVisibleExpression === 'false') return [field.id, field.default]
				const option = supplied[field.id] ?? field.default
				if (!option || typeof option !== 'object') return [field.id, option]
				if (!option.isExpression) return [field.id, option.value]
				const match = /^\$\(local:([\w_]+)\)$/.exec(option.value)
				assert.ok(match, `Unsupported test expression: ${option.value}`)
				return [field.id, locals[match[1]]]
			}),
		)
	}
	return {
		controller,
		locals,
		sent,
		preset,
		refresh() {
			for (const variable of preset.localVariables) {
				const definition = self.feedbacks[variable.feedbackId]
				locals[variable.variableName] = definition.callback({
					options: resolveOptions(definition, variable.options),
				})
			}
			return preset.feedbacks.map((feedback) => {
				const definition = self.feedbacks[feedback.feedbackId]
				return definition.callback({ options: resolveOptions(definition, feedback.options) })
			})
		},
		async rotate(direction) {
			for (const action of preset.steps[0][`rotate_${direction}`]) {
				const definition = self.actions[action.actionId]
				await definition.callback({ options: resolveOptions(definition, action.options) })
			}
		},
	}
}

test('Main encoder resolves its shared target and sends a fader change through Companion option handling', async () => {
	const encoder = createEncoder('main-fader-encoder')
	encoder.controller.handleMessage({ address: '/output/2/name', args: ['Main'] })
	encoder.controller.handleMessage({ address: '/output/2/faderlin', args: [dbToNormalized(-12)] })
	encoder.refresh()
	assert.equal(encoder.locals.target, 'output:2')
	await encoder.rotate('right')
	assertOscWrite(encoder.sent, '/output/2/faderlin', dbToNormalized(-11))
	assert.equal(encoder.locals.channel_name, 'Main')
	assert.equal(encoder.locals.current_volume, '-12.0 dB')
})

test('submix encoder keeps fader values distinct from channel names', async () => {
	const encoder = createEncoder('fader-encoder')
	encoder.controller.handleMessage({ address: '/input/0/name', args: ['Vocal'] })
	encoder.controller.handleMessage({ address: '/mix/in/0/2/faderlin', args: [dbToNormalized(-6)] })
	encoder.refresh()
	assert.equal(encoder.locals.channel_name, 'Vocal')
	assert.equal(encoder.locals.current_volume, '-6.0 dB')
	await encoder.rotate('left')
	assertOscWrite(encoder.sent, '/mix/in/0/2/faderlin', dbToNormalized(-7))
})

test('gain encoder resolves gain display, ring value and rotation from its shared target', async () => {
	const encoder = createEncoder('input-gain-encoder')
	encoder.controller.handleMessage({ address: '/input/0/name', args: ['AN 1'] })
	encoder.controller.handleMessage({ address: '/input/0/gain', args: [6] })
	encoder.refresh()
	assert.equal(encoder.locals.current_gain, '6.0')
	assert.equal(encoder.locals.current_gain_gauge, 0.5)
	await encoder.rotate('right')
	assert.deepEqual(encoder.sent, [{ address: '/input/0/gain', args: [6.5] }])
})

test('pan encoder preserves the pan-centered state selector and follows a changed target', async () => {
	const encoder = createEncoder('input-pan-encoder')
	encoder.controller.handleMessage({ address: '/input/0/name', args: ['AN 1'] })
	encoder.controller.handleMessage({ address: '/mix/in/0/2/balpan', args: [0] })
	encoder.controller.handleMessage({ address: '/input/0/mute', args: [1] })
	assert.deepEqual(encoder.refresh(), [true])
	assert.equal(encoder.locals.current_pan, 0)
	assert.equal(encoder.locals.current_pan_display, 'C')
	const target = encoder.preset.localVariables.find((variable) => variable.variableName === 'target')
	target.options.inputSource = 1
	encoder.controller.handleMessage({ address: '/mix/in/1/2/balpan', args: [0] })
	encoder.refresh()
	await encoder.rotate('right')
	assertOscWrite(encoder.sent, '/mix/in/1/2/balpan', 0.05)
})
