import { Regex, type SomeCompanionConfigField } from '@companion-module/base'
import { firefaceUfxII } from './model/profiles/fireface-ufx-ii.js'
import { deviceProfileChoices } from './model/profiles/index.js'

export type TotalMixVersion = '1.96' | 'global'

export type ModuleConfig = {
	host: string
	targetPort: number
	feedbackPort: number
	deviceProfile: string
	bankSize: number
	protocolMode: TotalMixVersion
	syncTimeoutMs: number
}

export function normalizeConfig(config: Partial<ModuleConfig>): ModuleConfig {
	return {
		host: config.host || '127.0.0.1',
		targetPort: Number(config.targetPort) || 7001,
		feedbackPort: Number(config.feedbackPort) || 9001,
		deviceProfile: config.deviceProfile || firefaceUfxII.id,
		bankSize: [8, 12, 16, 24, 32, 48].includes(Number(config.bankSize)) ? Number(config.bankSize) : 48,
		protocolMode: config.protocolMode === 'global' ? 'global' : '1.96',
		syncTimeoutMs: Math.max(100, Math.min(3000, Number(config.syncTimeoutMs) || 500)),
	}
}

export function GetConfigFields(): SomeCompanionConfigField[] {
	return [
		{
			type: 'textinput',
			id: 'host',
			label: 'Host',
			width: 6,
			default: '127.0.0.1',
			regex: Regex.IP,
		},
		{
			type: 'number',
			id: 'targetPort',
			label: 'TotalMix receive port',
			width: 3,
			min: 1,
			max: 65535,
			default: 7001,
		},
		{
			type: 'number',
			id: 'feedbackPort',
			label: 'Companion feedback port',
			width: 3,
			min: 1,
			max: 65535,
			default: 9001,
		},
		{
			type: 'dropdown',
			id: 'protocolMode',
			label: 'TotalMix version',
			width: 12,
			default: '1.96',
			choices: [
				{ id: '1.96', label: '1.96 or newer' },
				{ id: 'global', label: '2.1 or newer (Global OSC)' },
			],
		},
		{
			type: 'dropdown',
			id: 'deviceProfile',
			label: 'Audio interface',
			width: 6,
			default: firefaceUfxII.id,
			isVisibleExpression: "$(options:protocolMode) != 'global'",
			choices: deviceProfileChoices,
		},
		{
			type: 'dropdown',
			id: 'bankSize',
			label: 'OSC Bank size',
			width: 3,
			default: 48,
			isVisibleExpression: "$(options:protocolMode) != 'global'",
			choices: [8, 12, 16, 24, 32, 48].map((value) => ({ id: value, label: String(value) })),
		},
		{
			type: 'number',
			id: 'syncTimeoutMs',
			label: 'State sync timeout (ms)',
			width: 3,
			min: 100,
			max: 3000,
			default: 500,
		},
	]
}
