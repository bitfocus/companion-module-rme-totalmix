import type ModuleInstance from './main.js'
import type { MixerBus, MixerChannelTarget } from './model/device-profile.js'
import { formatDb, normalizedToDb } from './protocol/fader-curve.js'
import { publishedVariableId, type PublishedVariableTarget } from './state/published-variables.js'

export type VariablesSchema = Record<string, string | number | boolean>

export function UpdateVariableDefinitions(self: ModuleInstance): void {
	const definitions = {
		connection_state: { name: 'OSC connection state' },
		active_snapshot: { name: 'Active TotalMix snapshot' },
		durec_state: { name: 'DURec state' },
		durec_time: { name: 'DURec time' },
	}
	const publishedDefinitions = Object.fromEntries(
		self
			.getPublishedVariableTargets()
			.map((target) => [publishedVariableId(target), { name: publishedVariableName(self, target) }]),
	)

	self.setVariableDefinitions(
		self.config.protocolMode === 'global'
			? {
					...definitions,
					detected_device: { name: 'Device reported by TotalMix Global OSC' },
					totalmix_connection: { name: 'TotalMix device connection state' },
					dsp_load: { name: 'TotalMix DSP load' },
					...publishedDefinitions,
				}
			: { ...definitions, ...publishedDefinitions },
	)
}

export function UpdateVariableValues(self: ModuleInstance): void {
	self.registerGlobalFeedback('snapshots')
	// Global OSC can expose DURec on devices that are not covered by a static profile.
	// In legacy mode, only request it for profiles known to provide DURec.
	if (self.controller.isGlobalOsc || self.profile.capabilities.duRec || self.capabilities.duRec)
		self.registerGlobalFeedback('duRec')
	const values: Record<string, string | number | boolean | undefined> = {
		connection_state: self.connectionState,
		active_snapshot: self.controller.state.activeSnapshot ?? '',
		durec_state: self.controller.state.getGlobalParameter('recordState').value ?? '—',
		durec_time: self.controller.state.getGlobalParameter('recordTime').value ?? '00:00:00',
	}
	if (self.controller.isGlobalOsc) {
		values.detected_device = self.controller.state.detectedDevice
		values.totalmix_connection = self.controller.state.getGlobalParameter('status:connection').value ?? ''
		values.dsp_load = self.controller.state.getGlobalParameter('status:dsp').value ?? ''
	}
	for (const target of self.getPublishedVariableTargets()) {
		self.keepPublishedVariableTargetAlive(target)
		values[publishedVariableId(target)] = publishedVariableValue(self, target)
	}

	self.setVariableValues(values)
}

function fallbackChannelName(bus: MixerBus, index: number): string {
	const row = bus === 'input' ? 'Hardware input' : bus === 'playback' ? 'Software playback' : 'Hardware output'
	return `${row} ${index + 1}`
}

function channelName(self: ModuleInstance, target: MixerChannelTarget): string {
	return self.controller.state.getChannel(target).name || fallbackChannelName(target.bus, target.index)
}

function humanize(value: string): string {
	const special: Record<string, string> = {
		pfl: 'PFL',
		phantom: 'Phantom power',
		instrument: 'Instrument input',
		autoset: 'AutoSet gain',
		loopback: 'Loopback',
		gain: 'Gain',
	}
	if (special[value]) return special[value]
	const text = value
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.replace(/[:/_-]+/g, ' ')
		.trim()
	return text ? text[0].toUpperCase() + text.slice(1) : value
}

function publishedVariableName(self: ModuleInstance, target: PublishedVariableTarget): string {
	switch (target.kind) {
		case 'channel': {
			const fields: Record<typeof target.field, string> = {
				name: 'channel name',
				mute: 'Mute state',
				pfl: 'PFL state',
				levelLeft: 'left/mono level (dBFS)',
				levelRight: 'right level (dBFS)',
			}
			return `${channelName(self, target.target)} ${fields[target.field]}`
		}
		case 'routeFader':
			return `${channelName(self, target.target)} → ${channelName(self, { bus: 'output', index: target.target.output })} fader (${target.unit === 'db' ? 'dB' : 'normalized'})`
		case 'routePan':
			return `${channelName(self, target.target)} → ${channelName(self, { bus: 'output', index: target.target.output })} pan/balance`
		case 'outputFader':
			return `${channelName(self, { bus: 'output', index: target.output })} fader (${target.unit === 'db' ? 'dB' : 'normalized'})`
		case 'outputPan':
			return `${channelName(self, { bus: 'output', index: target.output })} pan/balance`
		case 'channelParameter':
			return `${channelName(self, target.target)} ${humanize(target.parameter)}`
		case 'roomEqParameter':
			return `${channelName(self, { bus: 'output', index: target.output })} Room EQ ${target.side} ${humanize(target.parameter)}`
	}
}

function rounded(value: number, places: number): number {
	const scale = 10 ** places
	return Math.round(value * scale) / scale
}

function panValue(value: number | undefined, display?: string): string | number {
	if (display) return display
	return value === undefined ? '' : rounded(value * 200 - 100, 1)
}

function publishedVariableValue(self: ModuleInstance, target: PublishedVariableTarget): string | number | boolean {
	switch (target.kind) {
		case 'channel': {
			const state = self.controller.state.getChannel(target.target)
			if (target.field === 'name') return state.name ?? ''
			if (target.field === 'mute') return state.mute.value ?? ''
			if (target.field === 'pfl') return state.solo.value ?? ''
			const level = target.field === 'levelRight' ? state.levelRight : state.levelLeft
			if (level.display) return level.display
			return self.controller.isGlobalOsc ? (level.value ?? '') : ''
		}
		case 'routeFader': {
			const state = self.controller.state.getRoute(target.target)
			if (state.value === undefined) return ''
			return target.unit === 'db' ? state.display || formatDb(normalizedToDb(state.value)) : rounded(state.value, 4)
		}
		case 'routePan': {
			const state = self.controller.state.getRoutePan(target.target)
			return panValue(state.value, state.display)
		}
		case 'outputFader': {
			const state = self.controller.state.getOutput(target.output)
			if (state.value === undefined) return ''
			return target.unit === 'db' ? state.display || formatDb(normalizedToDb(state.value)) : rounded(state.value, 4)
		}
		case 'outputPan': {
			const state = self.controller.state.getOutputPan(target.output)
			return panValue(state.value, state.display)
		}
		case 'channelParameter': {
			const state = self.controller.state.getChannelParameter(target.target, target.parameter)
			return state.display ?? state.value ?? ''
		}
		case 'roomEqParameter': {
			const state = self.controller.state.getChannelParameter(
				{ bus: 'output', index: target.output },
				`roomEq:${target.side}:${target.parameter}`,
			)
			return state.display ?? state.value ?? ''
		}
	}
}
