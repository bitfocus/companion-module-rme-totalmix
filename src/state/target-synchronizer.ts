import type { SourceTarget, SubmixTarget } from '../model/device-profile.js'
import { channelKey, outputKey, routeKey } from '../protocol/resolver.js'

type SyncTarget =
	| { kind: 'route'; target: SubmixTarget; lastSeenAt: number; nextSyncAt: number }
	| { kind: 'channel'; target: SourceTarget; lastSeenAt: number; nextSyncAt: number }
	| { kind: 'output'; target: number; lastSeenAt: number; nextSyncAt: number }

export interface TargetSynchronizerOptions {
	refreshIntervalMs?: number
	inactiveTargetTtlMs?: number
	now?: () => number
}

export class TargetSynchronizer {
	private readonly targets = new Map<string, SyncTarget>()
	private readonly refreshIntervalMs: number
	private readonly inactiveTargetTtlMs: number
	private readonly now: () => number
	private running = false

	constructor(
		private readonly syncRoute: (target: SubmixTarget) => Promise<void>,
		private readonly syncChannel: (target: SourceTarget) => Promise<void>,
		private readonly syncOutput: (output: number) => Promise<void>,
		options: TargetSynchronizerOptions = {},
	) {
		this.refreshIntervalMs = options.refreshIntervalMs ?? 2000
		this.inactiveTargetTtlMs = options.inactiveTargetTtlMs ?? 10_000
		this.now = options.now ?? Date.now
	}

	registerRoute(target: SubmixTarget): void {
		this.register(`route:${routeKey(target)}`, { kind: 'route', target: { ...target } })
	}

	registerChannel(target: SourceTarget): void {
		this.register(`channel:${channelKey(target)}`, { kind: 'channel', target: { ...target } })
	}

	registerOutput(output: number): void {
		this.register(`output:${outputKey(output)}`, { kind: 'output', target: output })
	}

	async syncNext(): Promise<boolean> {
		if (this.running) return false
		const now = this.now()
		this.prune(now)
		const candidate = [...this.targets.values()]
			.filter((target) => target.nextSyncAt <= now)
			.sort((left, right) => left.nextSyncAt - right.nextSyncAt)[0]
		if (!candidate) return false

		candidate.nextSyncAt = now + this.refreshIntervalMs
		this.running = true
		try {
			if (candidate.kind === 'route') await this.syncRoute(candidate.target)
			else if (candidate.kind === 'channel') await this.syncChannel(candidate.target)
			else await this.syncOutput(candidate.target)
			return true
		} finally {
			this.running = false
		}
	}

	clear(): void {
		this.targets.clear()
	}

	get size(): number {
		return this.targets.size
	}

	private register(
		key: string,
		candidate:
			| { kind: 'route'; target: SubmixTarget }
			| { kind: 'channel'; target: SourceTarget }
			| { kind: 'output'; target: number },
	): void {
		const now = this.now()
		const current = this.targets.get(key)
		if (current) {
			current.lastSeenAt = now
			return
		}
		this.targets.set(key, { ...candidate, lastSeenAt: now, nextSyncAt: 0 })
	}

	private prune(now: number): void {
		for (const [key, target] of this.targets) {
			if (now - target.lastSeenAt > this.inactiveTargetTtlMs) this.targets.delete(key)
		}
	}
}
