import assert from 'node:assert/strict'
import test from 'node:test'
import { TargetSynchronizer } from '../dist/state/target-synchronizer.js'

test('target synchronizer deduplicates and serializes background state requests', async () => {
	let now = 100
	const requests = []
	const synchronizer = new TargetSynchronizer(
		async (target) => requests.push({ kind: 'route', target }),
		async (target) => requests.push({ kind: 'channel', target }),
		async (target) => requests.push({ kind: 'output', target }),
		{ refreshIntervalMs: 2000, inactiveTargetTtlMs: 10_000, now: () => now },
	)

	synchronizer.registerRoute({ bus: 'input', index: 0, output: 2 })
	synchronizer.registerRoute({ bus: 'input', index: 0, output: 2 })
	synchronizer.registerChannel({ bus: 'playback', index: 1 })
	synchronizer.registerOutput(0)
	synchronizer.registerOutput(0)
	assert.equal(synchronizer.size, 3)

	assert.equal(await synchronizer.syncNext(), true)
	assert.equal(await synchronizer.syncNext(), true)
	assert.equal(await synchronizer.syncNext(), true)
	assert.equal(await synchronizer.syncNext(), false)
	assert.deepEqual(requests, [
		{ kind: 'route', target: { bus: 'input', index: 0, output: 2 } },
		{ kind: 'channel', target: { bus: 'playback', index: 1 } },
		{ kind: 'output', target: 0 },
	])

	now += 2000
	assert.equal(await synchronizer.syncNext(), true)
})

test('inactive feedback targets expire', async () => {
	let now = 0
	const synchronizer = new TargetSynchronizer(
		async () => undefined,
		async () => undefined,
		async () => undefined,
		{
			inactiveTargetTtlMs: 1000,
			now: () => now,
		},
	)
	synchronizer.registerChannel({ bus: 'input', index: 0 })
	assert.equal(synchronizer.size, 1)

	now = 1001
	await synchronizer.syncNext()
	assert.equal(synchronizer.size, 0)
})
