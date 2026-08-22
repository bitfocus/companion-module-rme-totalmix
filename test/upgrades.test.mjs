import assert from 'node:assert/strict'
import test from 'node:test'
import { UpgradeScripts } from '../dist/upgrades.js'

function runUpgrade(index, actions, feedbacks = []) {
	return UpgradeScripts[index]({}, { config: null, secrets: null, actions, feedbacks })
}

test('legacy split fader actions migrate to unified row-based options', () => {
	const oldIds = ['set_submix_fader', 'adjust_submix_fader', 'set_output_fader', 'adjust_output_fader']
	const actions = oldIds.map((actionId, index) => ({
		id: String(index),
		controlId: `control-${index}`,
		actionId,
		options: {},
	}))
	const unified = runUpgrade(0, actions)
	const result = runUpgrade(1, unified.updatedActions)

	assert.deepEqual(
		result.updatedActions.map((action) => [action.actionId, action.options.row.value]),
		[
			['set_fader', 'input'],
			['adjust_fader', 'input'],
			['set_fader', 'output'],
			['adjust_fader', 'output'],
		],
	)
	assert.equal(result.updatedActions[0].options.inputSource.value, 0)
	assert.equal(result.updatedActions[0].options.destination.value, 0)
	assert.equal(result.updatedActions[2].options.output.value, 0)
})

test('existing encoder presets gain the internal target mode needed for a clean editor', () => {
	const action = {
		id: 'action',
		controlId: 'control',
		actionId: 'adjust_pan',
		options: { target: { isExpression: true, value: '$(local:target)' } },
	}
	const feedback = {
		id: 'feedback',
		controlId: 'control',
		feedbackId: 'pan_value',
		options: { target: { isExpression: true, value: '$(local:target)' } },
	}

	const result = runUpgrade(2, [action], [feedback])
	assert.deepEqual(result.updatedActions[0].options.presetTargetMode, { isExpression: false, value: true })
	assert.deepEqual(result.updatedFeedbacks[0].options.presetTargetMode, { isExpression: false, value: true })
})

test('existing encoder presets migrate to selector-free target-bound definitions', () => {
	const target = { isExpression: true, value: '$(local:target)' }
	const actions = [
		{
			id: 'action',
			controlId: 'control',
			actionId: 'adjust_pan',
			options: {
				target,
				presetTargetMode: { isExpression: false, value: true },
				row: { isExpression: false, value: 'input' },
				inputSource: { isExpression: false, value: 0 },
				destination: { isExpression: false, value: 0 },
				output: { isExpression: false, value: 0 },
				amount: { isExpression: false, value: 5 },
			},
		},
	]
	const feedbacks = [
		{
			id: 'feedback',
			controlId: 'control',
			feedbackId: 'pan_value',
			options: {
				target,
				presetTargetMode: { isExpression: false, value: true },
				row: { isExpression: false, value: 'input' },
				inputSource: { isExpression: false, value: 0 },
				destination: { isExpression: false, value: 0 },
				output: { isExpression: false, value: 0 },
			},
		},
	]

	const result = runUpgrade(3, actions, feedbacks)
	assert.equal(result.updatedActions[0].actionId, 'preset_adjust_pan')
	assert.deepEqual(result.updatedActions[0].options, {
		target,
		amount: { isExpression: false, value: 5 },
	})
	assert.equal(result.updatedFeedbacks[0].feedbackId, 'preset_value')
	assert.deepEqual(result.updatedFeedbacks[0].options, {
		target,
		valueType: { isExpression: false, value: 'pan' },
	})
})

test('current unified fader actions preserve input, playback, and output selections during row migration', () => {
	const actions = [
		{
			id: 'input',
			controlId: 'input-control',
			actionId: 'set_fader',
			options: {
				targetType: { isExpression: false, value: 'submix' },
				source: { isExpression: false, value: 'input:2' },
				output: { isExpression: false, value: 4 },
			},
		},
		{
			id: 'playback',
			controlId: 'playback-control',
			actionId: 'adjust_fader',
			options: {
				targetType: { isExpression: false, value: 'submix' },
				source: { isExpression: false, value: 'playback:3' },
				output: { isExpression: false, value: 5 },
			},
		},
		{
			id: 'output',
			controlId: 'output-control',
			actionId: 'set_fader',
			options: {
				targetType: { isExpression: false, value: 'output' },
				output: { isExpression: false, value: 6 },
			},
		},
	]

	const result = runUpgrade(1, actions)
	assert.deepEqual(
		result.updatedActions.map((action) => ({
			row: action.options.row.value,
			inputSource: action.options.inputSource?.value,
			playbackSource: action.options.playbackSource?.value,
			destination: action.options.destination?.value,
			output: action.options.output?.value,
		})),
		[
			{ row: 'input', inputSource: 2, playbackSource: undefined, destination: 4, output: undefined },
			{ row: 'playback', inputSource: undefined, playbackSource: 3, destination: 5, output: undefined },
			{ row: 'output', inputSource: undefined, playbackSource: undefined, destination: undefined, output: 6 },
		],
	)
})
