import assert from 'node:assert/strict'
import test from 'node:test'
import { PublishedVariableRegistry, publishedVariableId } from '../dist/state/published-variables.js'

test('published targets use stable one-based variable IDs', () => {
	assert.equal(
		publishedVariableId({
			kind: 'routeFader',
			target: { bus: 'playback', index: 3, output: 8 },
			unit: 'db',
		}),
		'route_playback_4_to_output_9_fader_db',
	)
	assert.equal(
		publishedVariableId({
			kind: 'channelParameter',
			target: { bus: 'input', index: 8 },
			parameter: 'lowcutEnable',
		}),
		'input_9_lowcut_enable',
	)
})

test('published targets are deduplicated by their Companion variable ID', () => {
	const registry = new PublishedVariableRegistry()
	const target = { kind: 'channel', target: { bus: 'input', index: 0 }, field: 'mute' }

	assert.equal(registry.register(target), true)
	assert.equal(registry.register(target), false)
	assert.deepEqual(registry.values(), [target])
})
