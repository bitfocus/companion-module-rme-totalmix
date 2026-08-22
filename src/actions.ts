import type ModuleInstance from './main.js'
import { asIndex, asNumber, outputChoices, routeFromOptions, sourceChoices, sourceFromOptions } from './options.js'
import type { DeviceProfile, MixerChannelTarget, SourceTarget, SubmixTarget } from './model/device-profile.js'
import { presetTargetFromOptions } from './model/preset-target.js'
import type { BinaryOperation, FaderUnit, GroupType } from './protocol/controller.js'

type SourceOptions = { source: string }
type RouteOptions = SourceOptions & { output: number }
type FaderRow = 'input' | 'playback' | 'output'
type FaderTargetOptions = {
	row: FaderRow
	inputSource: number
	playbackSource: number
	destination: number
	output: number
}
type UnitValueOptions = { unit: FaderUnit; value: number }
type UnitAmountOptions = { unit: FaderUnit; amount: number }

export type ActionsSchema = {
	adjust_fader: { options: FaderTargetOptions & UnitAmountOptions }
	set_fader: { options: FaderTargetOptions & UnitValueOptions }
	adjust_pan: { options: FaderTargetOptions & { amount: number } }
	set_pan: { options: FaderTargetOptions & { value: number } }
	set_mute: { options: SourceOptions & { operation: BinaryOperation } }
	set_solo: { options: SourceOptions & { operation: BinaryOperation } }
	recall_snapshot: { options: { snapshot: number } }
	save_snapshot: { options: { snapshot: number } }
	load_layout_preset: { options: { layout: number } }
	show_totalmix_window: { options: { show: 'show' | 'hide' } }
	load_quick_workspace: { options: { workspace: number } }
	adjust_input_gain: { options: { input: number; amount: number } }
	set_input_gain: { options: { input: number; value: number } }
	set_phantom: { options: { input: number; operation: BinaryOperation } }
	set_instrument: { options: { input: number; operation: BinaryOperation } }
	set_pad: { options: { input: number; operation: BinaryOperation } }
	set_autoset: { options: { input: number; operation: BinaryOperation } }
	preset_adjust_fader: { options: { target: string; unit: FaderUnit; amount: number } }
	preset_adjust_pan: { options: { target: string; amount: number } }
	preset_set_pan: { options: { target: string; value: number } }
	preset_set_mute: { options: { target: string; operation: BinaryOperation } }
	preset_adjust_input_gain: { options: { target: string; amount: number } }
	preset_set_autoset: { options: { target: string; operation: BinaryOperation } }
	channel_option: {
		options: FaderTargetOptions & {
			channelOption: string
			operation: BinaryOperation
			value: number
			referenceLevel: number
		}
	}
	set_channel_name: { options: FaderTargetOptions & { name: string } }
	set_loopback: { options: { output: number; operation: BinaryOperation } }
	set_group: { options: { groupType: GroupType; group: number; operation: BinaryOperation } }
	undo_redo: { options: { command: 'undo' | 'redo' } }
	control_room: { options: { control: string; operation: BinaryOperation } }
	recall_main_volume: { options: Record<string, never> }
	durec_transport: { options: { command: 'recordStop' | 'record' | 'playPause' | 'stop' | 'next' | 'previous' } }
	durec_channel_record: {
		options: {
			row: 'input' | 'output'
			input: number
			output: number
			operation: BinaryOperation
		}
	}
	channel_processing_switch: {
		options: FaderTargetOptions & { processor: string; operation: BinaryOperation }
	}
	set_channel_processing_parameter: {
		options: FaderTargetOptions & { parameter: string; value: number }
	}
	global_fx_switch: { options: { effect: 'reverbEnable' | 'echoEnable'; operation: BinaryOperation } }
	set_global_fx_parameter: { options: { parameter: string; value: number } }
	room_eq_switch: { options: { output: number; side: 'left' | 'right' | 'both'; operation: BinaryOperation } }
	set_room_eq_parameter: {
		options: { output: number; side: 'left' | 'right' | 'both'; parameter: string; value: number }
	}
	resync_target: { options: RouteOptions }
}

const unitOption = {
	id: 'unit' as const,
	type: 'dropdown' as const,
	label: 'Unit',
	default: 'db',
	choices: [
		{ id: 'db', label: 'dB' },
		{ id: 'normalized', label: 'Normalized (0-1)' },
	],
}

function channelChoices(channels: DeviceProfile['inputs']): Array<{ id: number; label: string }> {
	return channels.map((channel) => ({ id: channel.index, label: channel.label }))
}

function faderRowFromOptions(options: Record<string, unknown>): FaderRow {
	const presetTarget = presetTargetFromOptions(options)
	if (presetTarget) return presetTarget.row
	if (options.row === 'input' || options.row === 'playback' || options.row === 'output') return options.row
	if (options.targetType === 'output') return 'output'
	return sourceFromOptions(options.source).bus
}

function faderSourceFromOptions(options: Record<string, unknown>, row: 'input' | 'playback'): SourceTarget {
	const presetTarget = presetTargetFromOptions(options)
	if (presetTarget && presetTarget.row !== 'output') return { bus: presetTarget.row, index: presetTarget.source }
	const sourceOption = row === 'input' ? options.inputSource : options.playbackSource
	if (sourceOption !== undefined) return { bus: row, index: asIndex(sourceOption, `${row} source`) }
	const legacySource = sourceFromOptions(options.source)
	return { bus: row, index: legacySource.index }
}

function faderRouteFromOptions(options: Record<string, unknown>, row: 'input' | 'playback'): SubmixTarget {
	const presetTarget = presetTargetFromOptions(options)
	if (presetTarget && presetTarget.row !== 'output') {
		return { bus: presetTarget.row, index: presetTarget.source, output: presetTarget.destination }
	}
	return {
		...faderSourceFromOptions(options, row),
		output: asIndex(options.destination ?? options.output, 'destination'),
	}
}

function mixerChannelFromOptions(options: Record<string, unknown>): MixerChannelTarget {
	const presetTarget = presetTargetFromOptions(options)
	if (presetTarget) {
		return presetTarget.row === 'output'
			? { bus: 'output', index: presetTarget.output }
			: { bus: presetTarget.row, index: presetTarget.source }
	}
	const row = faderRowFromOptions(options)
	if (row === 'output') return { bus: 'output', index: asIndex(options.output, 'hardware output') }
	return faderSourceFromOptions(options, row)
}

function outputFromOptions(options: Record<string, unknown>): number {
	const presetTarget = presetTargetFromOptions(options)
	if (presetTarget) {
		if (presetTarget.row !== 'output') throw new Error('Preset target is not a hardware output')
		return presetTarget.output
	}
	return asIndex(options.output, 'hardware output')
}

function inputFromOptions(options: Record<string, unknown>): number {
	const presetTarget = presetTargetFromOptions(options)
	if (presetTarget) {
		if (presetTarget.row !== 'input') throw new Error('Preset target is not a hardware input')
		return presetTarget.source
	}
	return asIndex(options.input, 'hardware input')
}

function requiredPresetTarget(options: Record<string, unknown>) {
	const target = presetTargetFromOptions(options)
	if (!target) throw new Error('Encoder preset target is unavailable')
	return target
}

function presetInputGainAmount(
	self: ModuleInstance,
	input: number,
	requestedAmount: number,
	globalOsc: boolean,
): number {
	const range = self.profile.capabilities.inputGainRanges?.[input]
	const step = range?.step
	if (!step || requestedAmount === 0) return requestedAmount

	const quantizedMagnitude = Math.max(step, Math.round(Math.abs(requestedAmount) / step) * step)
	const dbAmount = Math.sign(requestedAmount) * quantizedMagnitude
	if (globalOsc) return dbAmount

	const rangeWidth = range.max - range.min
	return rangeWidth > 0 ? dbAmount / rangeWidth : requestedAmount
}

export function UpdateActions(self: ModuleInstance): void {
	const globalOsc = self.config?.protocolMode === 'global'
	const capabilities = self.capabilities ?? self.profile.capabilities
	const choiceInputs = self.getChoiceChannels('input')
	const choicePlaybacks = self.getChoiceChannels('playback')
	const choiceOutputs = self.getChoiceChannels('output')
	const choiceProfile = {
		...self.profile,
		capabilities,
		inputs: choiceInputs,
		playbacks: choicePlaybacks,
		outputs: choiceOutputs,
	}
	const sources = sourceChoices(choiceProfile)
	const outputs = outputChoices(choiceProfile)
	const sourceOption = {
		id: 'source' as const,
		type: 'dropdown' as const,
		label: 'Source',
		default: 'input:0',
		choices: sources,
	}
	const outputOption = {
		id: 'output' as const,
		type: 'dropdown' as const,
		label: 'Output',
		default: 0,
		choices: outputs,
		isVisibleExpression: "$(options:row) == 'output'",
	}
	const standaloneOutputOption = {
		id: 'output' as const,
		type: 'dropdown' as const,
		label: 'Hardware output',
		default: 0,
		choices: outputs,
	}
	const destinationOption = {
		id: 'destination' as const,
		type: 'dropdown' as const,
		label: 'Destination',
		default: 0,
		choices: outputs,
		isVisibleExpression: "$(options:row) != 'output'",
	}
	const inputSourceOption = {
		id: 'inputSource' as const,
		type: 'dropdown' as const,
		label: 'Source',
		default: 0,
		choices: channelChoices(choiceInputs),
		isVisibleExpression: "$(options:row) == 'input'",
	}
	const playbackSourceOption = {
		id: 'playbackSource' as const,
		type: 'dropdown' as const,
		label: 'Source',
		default: 0,
		choices: channelChoices(choicePlaybacks),
		isVisibleExpression: "$(options:row) == 'playback'",
	}
	const rowOption = {
		id: 'row' as const,
		type: 'dropdown' as const,
		label: 'Row',
		default: 'input',
		disableAutoExpression: true,
		choices: [
			{ id: 'input', label: 'Hardware input' },
			{ id: 'playback', label: 'Software playback' },
			{ id: 'output', label: 'Hardware output' },
		],
	}
	const faderOptions = [rowOption, inputSourceOption, playbackSourceOption, destinationOption, outputOption, unitOption]
	const panOptions = [rowOption, inputSourceOption, playbackSourceOption, destinationOption, outputOption]
	const operationOption = {
		id: 'operation' as const,
		type: 'dropdown' as const,
		label: 'Operation',
		default: 'toggle',
		choices: [
			{ id: 'toggle', label: 'Toggle' },
			{ id: 'on', label: 'On' },
			{ id: 'off', label: 'Off' },
		],
	}
	const hiddenPresetTargetOption = {
		id: 'target' as const,
		type: 'textinput' as const,
		label: 'Encoder preset target',
		default: '',
		useVariables: true,
		allowInvalidValues: true,
		isVisibleExpression: 'false',
	}
	const capabilityInputOption = (indices: number[]) => ({
		id: 'input' as const,
		type: 'dropdown' as const,
		label: 'Hardware input',
		default: indices[0] ?? 0,
		choices: indices.map((index) => ({
			id: index,
			label: choiceInputs.find((channel) => channel.index === index)?.label ?? `Input ${index + 1}`,
		})),
	})
	const channelProcessingParameters = [
		{ id: 'reverbSend', label: 'Reverb Send' },
		{ id: 'reverbReturn', label: 'Reverb Return' },
		{ id: 'lowcutGrade', label: 'Low Cut grade' },
		{ id: 'lowcutFreq', label: 'Low Cut frequency' },
		{ id: 'eqType1', label: 'EQ band 1 type' },
		{ id: 'eqGain1', label: 'EQ band 1 gain' },
		{ id: 'eqFreq1', label: 'EQ band 1 frequency' },
		{ id: 'eqQ1', label: 'EQ band 1 Q' },
		{ id: 'eqGain2', label: 'EQ band 2 gain' },
		{ id: 'eqFreq2', label: 'EQ band 2 frequency' },
		{ id: 'eqQ2', label: 'EQ band 2 Q' },
		{ id: 'eqType3', label: 'EQ band 3 type' },
		{ id: 'eqGain3', label: 'EQ band 3 gain' },
		{ id: 'eqFreq3', label: 'EQ band 3 frequency' },
		{ id: 'eqQ3', label: 'EQ band 3 Q' },
		{ id: 'compexpGain', label: 'Dynamics make-up gain' },
		{ id: 'compexpAttack', label: 'Compressor attack' },
		{ id: 'compexpRelease', label: 'Compressor release' },
		{ id: 'compTrsh', label: 'Compressor threshold' },
		{ id: 'compRatio', label: 'Compressor ratio' },
		{ id: 'expTrsh', label: 'Expander threshold' },
		{ id: 'expRatio', label: 'Expander ratio' },
		{ id: 'alevMaxgain', label: 'Auto Level maximum gain' },
		{ id: 'alevHeadroom', label: 'Auto Level headroom' },
		{ id: 'alevRisetime', label: 'Auto Level rise time' },
	]
	const globalFxParameters = [
		{ id: 'reverbType', label: 'Reverb type' },
		{ id: 'reverbPredelay', label: 'Reverb pre-delay' },
		{ id: 'reverbLowcut', label: 'Reverb low cut' },
		{ id: 'reverbHighcut', label: 'Reverb high cut' },
		{ id: 'reverbRoomscale', label: 'Reverb room scale' },
		{ id: 'reverbAttack', label: 'Reverb attack' },
		{ id: 'reverbHold', label: 'Reverb hold' },
		{ id: 'reverbRelease', label: 'Reverb release' },
		{ id: 'reverbTime', label: 'Reverb time' },
		{ id: 'reverbHighdamp', label: 'Reverb high damp' },
		{ id: 'reverbSmooth', label: 'Reverb smoothness' },
		{ id: 'reverbWidth', label: 'Reverb width' },
		{ id: 'reverbVolume', label: 'Reverb volume' },
		{ id: 'echoType', label: 'Echo type' },
		{ id: 'echoDelaytime', label: 'Echo delay time' },
		{ id: 'echoFeedback', label: 'Echo feedback' },
		{ id: 'echoHighcut', label: 'Echo high cut' },
		{ id: 'echoWidth', label: 'Echo width' },
		{ id: 'echoVolume', label: 'Echo volume' },
	]
	const roomEqParameters = [
		{ id: 'reqDelay', label: 'Delay' },
		{ id: 'reqVolumeCorr', label: 'Volume correction' },
		{ id: 'reqType1', label: 'Band 1 type' },
		{ id: 'reqType8', label: 'Band 8 type' },
		{ id: 'reqType9', label: 'Band 9 type' },
		...Array.from({ length: 9 }, (_, index) => [
			{ id: `reqGain${index + 1}`, label: `Band ${index + 1} gain` },
			{ id: `reqFreq${index + 1}`, label: `Band ${index + 1} frequency` },
			{ id: `reqQ${index + 1}`, label: `Band ${index + 1} Q` },
		]).flat(),
	]
	const roomEqSideOption = {
		id: 'side' as const,
		type: 'dropdown' as const,
		label: 'Channel selection',
		default: 'left',
		choices: [
			{ id: 'left', label: 'Left / mono' },
			{ id: 'right', label: 'Right' },
			{ id: 'both', label: 'Left and right' },
		],
	}
	const binaryChannelOptions = new Set([
		'mute',
		'phase',
		'phaseRight',
		'msProc',
		'stereo',
		'cue',
		'talkbackSel',
		'noTrim',
	])
	const validateChannelOptionTarget = (target: MixerChannelTarget, option: string) => {
		if ((option === 'msProc' || option === 'gainRight') && target.bus !== 'input') {
			throw new Error(`${option} is only available for hardware inputs`)
		}
		if ((option === 'cue' || option === 'talkbackSel' || option === 'noTrim') && target.bus !== 'output') {
			throw new Error(`${option} is only available for hardware outputs`)
		}
		if (option === 'mute' && target.bus !== 'output') {
			throw new Error('Output mute is only available for hardware outputs')
		}
		if (option === 'refLevel' && target.bus === 'playback') {
			throw new Error('Reference level is only available for analog hardware inputs and outputs')
		}
		if (option === 'gainRight' && !capabilities.inputGainChannels.includes(target.index)) {
			throw new Error('Right-channel gain is not available for this input')
		}
	}

	self.setActionDefinitions({
		adjust_fader: {
			name: 'Adjust fader level',
			options: [
				...faderOptions,
				{ id: 'amount', type: 'number', label: 'Signed step', default: 1, min: -65, max: 65, step: 0.1 },
			],
			callback: async ({ options }) => {
				const amount = asNumber(options.amount, 'fader step')
				const row = faderRowFromOptions(options)
				if (row === 'output') {
					const output = outputFromOptions(options)
					self.registerFeedbackOutput(output, 'fader', options.unit === 'normalized' ? 'normalized' : 'db')
					await self.runCommand(async () => self.controller.adjustOutputFader(output, amount, options.unit))
				} else {
					const target = faderRouteFromOptions(options, row)
					self.registerFeedbackRoute(target, 'fader', options.unit === 'normalized' ? 'normalized' : 'db')
					await self.runCommand(async () => self.controller.adjustSubmixFader(target, amount, options.unit))
				}
			},
		},
		set_fader: {
			name: 'Set fader level',
			options: [
				...faderOptions,
				{ id: 'value', type: 'number', label: 'Value', default: 0, min: -65, max: 6, step: 0.1 },
			],
			callback: async ({ options }) => {
				const value = asNumber(options.value, 'fader value')
				const row = faderRowFromOptions(options)
				if (row === 'output') {
					const output = outputFromOptions(options)
					self.registerFeedbackOutput(output, 'fader', options.unit === 'normalized' ? 'normalized' : 'db')
					await self.runCommand(async () => self.controller.setOutputFader(output, value, options.unit))
				} else {
					const target = faderRouteFromOptions(options, row)
					self.registerFeedbackRoute(target, 'fader', options.unit === 'normalized' ? 'normalized' : 'db')
					await self.runCommand(async () => self.controller.setSubmixFader(target, value, options.unit))
				}
			},
		},
		adjust_pan: {
			name: 'Adjust pan/balance',
			options: [
				...panOptions,
				{
					id: 'amount',
					type: 'number',
					label: 'Signed step',
					default: 1,
					min: -200,
					max: 200,
					step: 1,
				},
			],
			callback: async ({ options }) => {
				const amount = asNumber(options.amount, 'pan/balance step')
				const row = faderRowFromOptions(options)
				if (row === 'output') {
					const output = outputFromOptions(options)
					self.registerFeedbackOutput(output, 'pan')
					await self.runCommand(async () => self.controller.adjustOutputPan(output, amount))
				} else {
					const target = faderRouteFromOptions(options, row)
					self.registerFeedbackRoute(target, 'pan')
					await self.runCommand(async () => self.controller.adjustSubmixPan(target, amount))
				}
			},
		},
		set_pan: {
			name: 'Set pan/balance',
			options: [
				...panOptions,
				{
					id: 'value',
					type: 'number',
					label: 'Position (-100 left, 0 center, +100 right)',
					default: 0,
					min: -100,
					max: 100,
					step: 1,
				},
			],
			callback: async ({ options }) => {
				const value = asNumber(options.value, 'pan/balance position')
				const row = faderRowFromOptions(options)
				if (row === 'output') {
					const output = outputFromOptions(options)
					self.registerFeedbackOutput(output, 'pan')
					await self.runCommand(async () => self.controller.setOutputPan(output, value))
				} else {
					const target = faderRouteFromOptions(options, row)
					self.registerFeedbackRoute(target, 'pan')
					await self.runCommand(async () => self.controller.setSubmixPan(target, value))
				}
			},
		},
		set_mute: {
			name: 'Mute channel',
			options: [sourceOption, operationOption],
			callback: async ({ options }) => {
				const target = sourceFromOptions(options.source)
				self.registerFeedbackChannel(target, 'mute')
				await self.runCommand(async () => self.controller.setMute(target, options.operation))
			},
		},
		set_solo: {
			name: 'PFL channel',
			options: [sourceOption, operationOption],
			callback: async ({ options }) => {
				const target = sourceFromOptions(options.source)
				self.registerFeedbackChannel(target, 'pfl')
				await self.runCommand(async () => self.controller.setSolo(target, options.operation))
			},
		},
		set_group: {
			name: 'Set/toggle group',
			options: [
				{
					id: 'groupType',
					type: 'dropdown',
					label: 'Group type',
					default: 'mute',
					choices: [
						{ id: 'mute', label: 'Mute group' },
						{ id: 'pfl', label: 'PFL group' },
						{ id: 'fader', label: 'Fader group' },
					],
				},
				{
					id: 'group',
					type: 'dropdown',
					label: 'Group',
					default: 1,
					choices: Array.from({ length: 4 }, (_, index) => ({ id: index + 1, label: `Group ${index + 1}` })),
				},
				operationOption,
			],
			callback: async ({ options }) => {
				await self.runCommand(async () =>
					self.controller.setGroup(options.groupType, asIndex(options.group, 'group'), options.operation),
				)
			},
		},
		set_loopback: {
			name: 'Output loopback',
			options: [standaloneOutputOption, operationOption],
			callback: async ({ options }) => {
				const output = asIndex(options.output, 'hardware output')
				self.registerChannelParameterFeedback({ bus: 'output', index: output }, 'loopback')
				await self.runCommand(async () =>
					self.controller.setChannelOption({ bus: 'output', index: output }, 'loopback', options.operation),
				)
			},
		},
		adjust_input_gain: capabilities.inputGainChannels.length
			? {
					name: 'Adjust input gain',
					options: [
						capabilityInputOption(capabilities.inputGainChannels),
						{
							id: 'amount',
							type: 'number',
							label: globalOsc ? 'Signed gain step (dB)' : 'Signed normalized step',
							default: globalOsc ? 1 : 0.01,
							min: globalOsc ? -100 : -1,
							max: globalOsc ? 100 : 1,
							step: 0.001,
						},
					],
					callback: async ({ options }) => {
						const input = inputFromOptions(options)
						const amount = asNumber(options.amount, 'input gain step')
						self.registerChannelParameterFeedback({ bus: 'input', index: input }, 'gain')
						await self.runCommand(async () => self.controller.adjustInputGain(input, amount))
					},
				}
			: false,
		set_input_gain: capabilities.inputGainChannels.length
			? {
					name: 'Set input gain',
					options: [
						capabilityInputOption(capabilities.inputGainChannels),
						{
							id: 'value',
							type: 'number',
							label: globalOsc ? 'Gain (dB; device-specific range)' : 'Normalized gain (0-1)',
							default: 0,
							min: globalOsc ? -300 : 0,
							max: globalOsc ? 100 : 1,
							step: 0.001,
						},
					],
					callback: async ({ options }) => {
						const input = inputFromOptions(options)
						const value = asNumber(options.value, 'input gain')
						self.registerChannelParameterFeedback({ bus: 'input', index: input }, 'gain')
						await self.runCommand(async () => self.controller.setInputGain(input, value))
					},
				}
			: false,
		set_phantom: capabilities.phantomChannels.length
			? {
					name: 'Phantom power',
					options: [capabilityInputOption(capabilities.phantomChannels), operationOption],
					callback: async ({ options }) => {
						const input = asIndex(options.input, 'hardware input')
						self.registerChannelParameterFeedback({ bus: 'input', index: input }, 'phantom')
						await self.runCommand(async () =>
							self.controller.setChannelOption({ bus: 'input', index: input }, 'phantom', options.operation),
						)
					},
				}
			: false,
		set_instrument: capabilities.instrumentChannels.length
			? {
					name: 'Instrument input',
					options: [capabilityInputOption(capabilities.instrumentChannels), operationOption],
					callback: async ({ options }) => {
						const input = asIndex(options.input, 'hardware input')
						self.registerChannelParameterFeedback({ bus: 'input', index: input }, 'instrument')
						await self.runCommand(async () =>
							self.controller.setChannelOption({ bus: 'input', index: input }, 'instrument', options.operation),
						)
					},
				}
			: false,
		set_pad: capabilities.padChannels.length
			? {
					name: 'Input pad',
					options: [capabilityInputOption(capabilities.padChannels), operationOption],
					callback: async ({ options }) => {
						const input = asIndex(options.input, 'hardware input')
						self.registerChannelParameterFeedback({ bus: 'input', index: input }, 'pad')
						await self.runCommand(async () =>
							self.controller.setChannelOption({ bus: 'input', index: input }, 'pad', options.operation),
						)
					},
				}
			: false,
		set_autoset: capabilities.autosetChannels.length
			? {
					name: 'AutoSet gain',
					options: [capabilityInputOption(capabilities.autosetChannels), operationOption],
					callback: async ({ options }) => {
						const input = inputFromOptions(options)
						self.registerChannelParameterFeedback({ bus: 'input', index: input }, 'autoset')
						await self.runCommand(async () =>
							self.controller.setChannelOption({ bus: 'input', index: input }, 'autoset', options.operation),
						)
					},
				}
			: false,
		preset_adjust_fader: {
			name: 'Encoder preset - adjust fader',
			options: [
				hiddenPresetTargetOption,
				unitOption,
				{ id: 'amount', type: 'number', label: 'Signed step', default: 1, min: -65, max: 65, step: 0.1 },
			],
			callback: async ({ options }) => {
				const target = requiredPresetTarget(options)
				if (target.row === 'output') {
					self.registerFeedbackOutput(target.output, 'fader', options.unit)
					await self.runCommand(async () =>
						self.controller.adjustOutputFader(target.output, options.amount, options.unit),
					)
				} else {
					const route = { bus: target.row, index: target.source, output: target.destination }
					self.registerFeedbackRoute(route, 'fader', options.unit)
					await self.runCommand(async () => self.controller.adjustSubmixFader(route, options.amount, options.unit))
				}
			},
		},
		preset_adjust_pan: {
			name: 'Encoder preset - adjust pan/balance',
			options: [
				hiddenPresetTargetOption,
				{ id: 'amount', type: 'number', label: 'Signed step', default: 5, min: -200, max: 200, step: 1 },
			],
			callback: async ({ options }) => {
				const target = requiredPresetTarget(options)
				if (target.row === 'output') {
					self.registerFeedbackOutput(target.output, 'pan')
					await self.runCommand(async () => self.controller.adjustOutputPan(target.output, options.amount))
				} else {
					const route = { bus: target.row, index: target.source, output: target.destination }
					self.registerFeedbackRoute(route, 'pan')
					await self.runCommand(async () => self.controller.adjustSubmixPan(route, options.amount))
				}
			},
		},
		preset_set_pan: {
			name: 'Encoder preset - set pan/balance',
			options: [
				hiddenPresetTargetOption,
				{
					id: 'value',
					type: 'number',
					label: 'Position (-100 left, 0 center, +100 right)',
					default: 0,
					min: -100,
					max: 100,
					step: 1,
				},
			],
			callback: async ({ options }) => {
				const target = requiredPresetTarget(options)
				if (target.row === 'output') {
					self.registerFeedbackOutput(target.output, 'pan')
					await self.runCommand(async () => self.controller.setOutputPan(target.output, options.value))
				} else {
					const route = { bus: target.row, index: target.source, output: target.destination }
					self.registerFeedbackRoute(route, 'pan')
					await self.runCommand(async () => self.controller.setSubmixPan(route, options.value))
				}
			},
		},
		preset_set_mute: {
			name: 'Encoder preset - mute',
			options: [hiddenPresetTargetOption, operationOption],
			callback: async ({ options }) => {
				const presetTarget = requiredPresetTarget(options)
				if (presetTarget.row === 'output') {
					const target = { bus: 'output' as const, index: presetTarget.output }
					self.registerChannelParameterFeedback(target, 'mute')
					await self.runCommand(async () => self.controller.setChannelOption(target, 'mute', options.operation))
				} else {
					const target = { bus: presetTarget.row, index: presetTarget.source }
					self.registerFeedbackChannel(target, 'mute')
					await self.runCommand(async () => self.controller.setMute(target, options.operation))
				}
			},
		},
		preset_adjust_input_gain: capabilities.inputGainChannels.length
			? {
					name: 'Encoder preset - adjust input gain',
					options: [
						hiddenPresetTargetOption,
						{
							id: 'amount',
							type: 'number',
							label: globalOsc ? 'Signed gain step (dB)' : 'Signed normalized step',
							default: globalOsc ? 0.5 : 0.01,
							min: globalOsc ? -100 : -1,
							max: globalOsc ? 100 : 1,
							step: 0.001,
						},
					],
					callback: async ({ options }) => {
						const target = requiredPresetTarget(options)
						if (target.row !== 'input') throw new Error('Encoder gain target is not a hardware input')
						if (!capabilities.inputGainChannels.includes(target.source))
							throw new Error('The selected hardware input does not provide gain control')
						self.registerChannelParameterFeedback({ bus: 'input', index: target.source }, 'gain')
						const amount = presetInputGainAmount(self, target.source, options.amount, globalOsc)
						await self.runCommand(async () => self.controller.adjustInputGain(target.source, amount))
					},
				}
			: false,
		preset_set_autoset: capabilities.autosetChannels.length
			? {
					name: 'Encoder preset - AutoSet gain',
					options: [hiddenPresetTargetOption, operationOption],
					callback: async ({ options }) => {
						const target = requiredPresetTarget(options)
						if (target.row !== 'input') throw new Error('Encoder AutoSet target is not a hardware input')
						self.registerChannelParameterFeedback({ bus: 'input', index: target.source }, 'autoset')
						await self.runCommand(async () =>
							self.controller.setChannelOption({ bus: 'input', index: target.source }, 'autoset', options.operation),
						)
					},
				}
			: false,
		channel_option: {
			name: 'Set/toggle channel option',
			options: [
				rowOption,
				inputSourceOption,
				playbackSourceOption,
				outputOption,
				{
					id: 'channelOption',
					type: 'dropdown',
					label: 'Option',
					default: 'phase',
					choices: [
						{ id: 'mute', label: 'Mute - hardware output' },
						{ id: 'phase', label: 'Phase invert - left/mono' },
						{ id: 'phaseRight', label: 'Phase invert - right' },
						{ id: 'msProc', label: 'MS processing - hardware input' },
						{ id: 'stereo', label: 'Stereo mode' },
						{ id: 'cue', label: 'Cue - hardware output' },
						{ id: 'talkbackSel', label: 'Include in Talkback - hardware output' },
						...(!globalOsc ? [{ id: 'noTrim', label: 'Exclude from Trim - hardware output' }] : []),
						{ id: 'gainRight', label: 'Right-channel input gain' },
						{ id: 'refLevel', label: 'Analog reference level' },
						{ id: 'width', label: 'Stereo width' },
					],
				},
				{
					...operationOption,
					isVisibleExpression:
						"$(options:channelOption) != 'gainRight' && $(options:channelOption) != 'refLevel' && $(options:channelOption) != 'width'",
				},
				{
					id: 'value',
					type: 'number',
					label: globalOsc ? 'Global OSC value (native TotalMix unit)' : 'Normalized value (0-1)',
					default: 0.5,
					min: globalOsc ? -10000 : 0,
					max: globalOsc ? 10000 : 1,
					step: 0.001,
					isVisibleExpression: "$(options:channelOption) == 'gainRight' || $(options:channelOption) == 'width'",
				},
				{
					id: 'referenceLevel',
					type: 'dropdown',
					label: 'Device-specific reference level value',
					default: 0,
					choices: [0, 1, 2, 3].map((value) => ({ id: value, label: String(value) })),
					isVisibleExpression: "$(options:channelOption) == 'refLevel'",
				},
			],
			callback: async ({ options }) => {
				const target = mixerChannelFromOptions(options)
				const option = String(options.channelOption)
				validateChannelOptionTarget(target, option)
				self.registerChannelParameterFeedback(target, option)
				if (binaryChannelOptions.has(option)) {
					await self.runCommand(async () => self.controller.setChannelOption(target, option, options.operation))
					if (option === 'stereo') self.refreshChannelNames()
				} else if (option === 'refLevel') {
					await self.runCommand(async () =>
						self.controller.setChannelParameterDirect(
							target,
							option,
							asIndex(options.referenceLevel, 'reference level'),
						),
					)
				} else {
					await self.runCommand(async () =>
						self.controller.setChannelParameterValue(target, option, asNumber(options.value, option)),
					)
				}
			},
		},
		set_channel_name: globalOsc
			? {
					name: 'Set channel name',
					options: [
						rowOption,
						inputSourceOption,
						playbackSourceOption,
						outputOption,
						{
							id: 'name',
							type: 'textinput',
							label: 'Channel name',
							default: '',
							useVariables: true,
						},
					],
					callback: async ({ options }) => {
						const target = mixerChannelFromOptions(options)
						const name = String(options.name)
						self.registerFeedbackChannel(target, 'name')
						await self.runCommand(async () => self.controller.setChannelName(target, name))
					},
				}
			: false,
		control_room: {
			name: 'Control Room',
			options: [
				{
					id: 'control',
					type: 'dropdown',
					label: 'Function',
					default: 'mainDim',
					choices: [
						{ id: 'mainDim', label: 'Dim' },
						{ id: 'mainSpeakerB', label: 'Speaker B' },
						{ id: 'speakerBLinked', label: 'Link Speaker B volume to Main' },
						{ id: 'mainMuteFx', label: 'Mute FX return on Main' },
						{ id: 'mainMono', label: 'Mono' },
						{ id: 'mainExtIn', label: 'External Input' },
						{ id: 'mainTalkback', label: 'Talkback' },
						{ id: 'globalMute', label: 'Global Mute enable' },
						{ id: 'globalSolo', label: 'Global PFL enable' },
						...(!globalOsc ? [{ id: 'trim', label: 'Trim mode' }] : []),
					],
				},
				operationOption,
			],
			callback: async ({ options }) => {
				await self.runCommand(async () => self.controller.setControlRoom(String(options.control), options.operation))
			},
		},
		recall_main_volume: {
			name: 'Recall Main output volume',
			options: [],
			callback: async () => {
				await self.runCommand(async () => self.controller.recallMainOutputVolume())
			},
		},
		recall_snapshot: {
			name: 'Recall snapshot',
			options: [
				{
					id: 'snapshot',
					type: 'dropdown',
					label: 'Snapshot',
					default: 1,
					choices: Array.from({ length: 8 }, (_, index) => ({ id: index + 1, label: `Snapshot ${index + 1}` })),
				},
			],
			callback: async ({ options }) => {
				const snapshot = asIndex(options.snapshot, 'snapshot')
				await self.runCommand(async () => self.controller.recallSnapshot(snapshot))
			},
		},
		save_snapshot: globalOsc
			? {
					name: 'Save snapshot',
					options: [
						{
							id: 'snapshot',
							type: 'dropdown',
							label: 'Snapshot',
							default: 1,
							choices: Array.from({ length: 8 }, (_, index) => ({ id: index + 1, label: `Snapshot ${index + 1}` })),
						},
					],
					callback: async ({ options }) => {
						await self.runCommand(async () => self.controller.saveSnapshot(asIndex(options.snapshot, 'snapshot')))
					},
				}
			: false,
		load_layout_preset: globalOsc
			? {
					name: 'Load layout preset',
					options: [
						{
							id: 'layout',
							type: 'dropdown',
							label: 'Layout preset',
							default: 1,
							choices: Array.from({ length: 6 }, (_, index) => ({ id: index + 1, label: `Layout ${index + 1}` })),
						},
					],
					callback: async ({ options }) => {
						await self.runCommand(async () => self.controller.loadLayoutPreset(asIndex(options.layout, 'layout')))
					},
				}
			: false,
		load_quick_workspace: {
			name: 'Load Quick Workspace',
			options: [
				{
					id: 'workspace',
					type: 'dropdown',
					label: 'Quick Workspace',
					default: 1,
					choices: Array.from({ length: 30 }, (_, index) => ({
						id: index + 1,
						label: `Quick Workspace ${index + 1}`,
					})),
				},
			],
			callback: async ({ options }) => {
				const workspace = asIndex(options.workspace, 'Quick Workspace')
				await self.runCommand(async () => self.controller.loadQuickWorkspace(workspace))
			},
		},
		show_totalmix_window: globalOsc
			? {
					name: 'Show/hide TotalMix window',
					options: [
						{
							id: 'show',
							type: 'dropdown',
							label: 'Window',
							default: 'show',
							choices: [
								{ id: 'show', label: 'Show' },
								{ id: 'hide', label: 'Hide' },
							],
						},
					],
					callback: async ({ options }) => {
						await self.runCommand(async () => self.controller.showWindow(options.show === 'show'))
					},
				}
			: false,
		undo_redo: {
			name: 'Undo/redo',
			options: [
				{
					id: 'command',
					type: 'dropdown',
					label: 'Command',
					default: 'undo',
					choices: [
						{ id: 'undo', label: 'Undo' },
						{ id: 'redo', label: 'Redo' },
					],
				},
			],
			callback: async ({ options }) => {
				await self.runCommand(async () => self.controller.undoRedo(options.command))
			},
		},
		durec_transport: capabilities.duRec
			? {
					name: 'DURec transport',
					options: [
						{
							id: 'command',
							type: 'dropdown',
							label: 'Command',
							default: 'recordStop',
							choices: [
								{ id: 'recordStop', label: 'Record Toggle' },
								{ id: 'record', label: 'Record Start' },
								{ id: 'stop', label: 'Record Stop' },
								{ id: 'playPause', label: 'Play / Pause' },
								...(globalOsc
									? [
											{ id: 'previous' as const, label: 'Previous file' },
											{ id: 'next' as const, label: 'Next file' },
										]
									: []),
							],
						},
					],
					callback: async ({ options }) => {
						await self.runCommand(async () => self.controller.duRecTransport(options.command))
					},
				}
			: false,
		durec_channel_record: capabilities.duRec
			? {
					name: 'DURec channel recording',
					options: [
						{
							id: 'row',
							type: 'dropdown',
							label: 'Row',
							default: 'input',
							disableAutoExpression: true,
							choices: [
								{ id: 'input', label: 'Hardware input' },
								{ id: 'output', label: 'Hardware output' },
							],
						},
						{
							id: 'input',
							type: 'dropdown',
							label: 'Hardware input',
							default: 0,
							choices: choiceInputs.map((channel) => ({ id: channel.index, label: channel.label })),
							isVisibleExpression: "$(options:row) == 'input'",
						},
						{
							...standaloneOutputOption,
							isVisibleExpression: "$(options:row) == 'output'",
						},
						operationOption,
					],
					callback: async ({ options }) => {
						const bus = options.row === 'output' ? 'output' : 'input'
						const index = asIndex(bus === 'output' ? options.output : options.input, `${bus} channel`)
						self.registerChannelParameterFeedback({ bus, index }, 'recordEnable')
						await self.runCommand(async () =>
							self.controller.setChannelOption({ bus, index }, 'recordEnable', options.operation),
						)
					},
				}
			: false,
		channel_processing_switch: capabilities.channelFx
			? {
					name: 'Channel processing',
					options: [
						rowOption,
						inputSourceOption,
						playbackSourceOption,
						outputOption,
						{
							id: 'processor',
							type: 'dropdown',
							label: 'Processor',
							default: 'eqEnable',
							choices: [
								{ id: 'lowcutEnable', label: 'Low Cut' },
								{ id: 'eqEnable', label: 'Parametric EQ' },
								{ id: 'compexpEnable', label: 'Compressor / Expander' },
								{ id: 'alevEnable', label: 'Auto Level' },
							],
						},
						operationOption,
					],
					callback: async ({ options }) => {
						const target = mixerChannelFromOptions(options)
						self.registerChannelParameterFeedback(target, String(options.processor))
						await self.runCommand(async () =>
							self.controller.setChannelOption(target, String(options.processor), options.operation),
						)
					},
				}
			: false,
		set_channel_processing_parameter: capabilities.channelFx
			? {
					name: 'Set channel processing parameter',
					options: [
						rowOption,
						inputSourceOption,
						playbackSourceOption,
						outputOption,
						{
							id: 'parameter',
							type: 'dropdown',
							label: 'Parameter',
							default: 'eqGain1',
							choices: channelProcessingParameters,
						},
						{
							id: 'value',
							type: 'number',
							label: globalOsc ? 'Global OSC value (native TotalMix unit)' : 'Normalized value (0-1)',
							default: 0.5,
							min: globalOsc ? -10000 : 0,
							max: globalOsc ? 10000 : 1,
							step: 0.001,
						},
					],
					callback: async ({ options }) => {
						const target = mixerChannelFromOptions(options)
						self.registerChannelParameterFeedback(target, String(options.parameter))
						await self.runCommand(async () =>
							self.controller.setChannelParameterValue(target, String(options.parameter), Number(options.value)),
						)
					},
				}
			: false,
		global_fx_switch: capabilities.globalFx
			? {
					name: 'Global FX',
					options: [
						{
							id: 'effect',
							type: 'dropdown',
							label: 'Effect',
							default: 'reverbEnable',
							choices: [
								{ id: 'reverbEnable', label: 'Reverb' },
								{ id: 'echoEnable', label: 'Echo' },
							],
						},
						operationOption,
					],
					callback: async ({ options }) => {
						await self.runCommand(async () => self.controller.setGlobalFxOption(options.effect, options.operation))
					},
				}
			: false,
		set_global_fx_parameter: capabilities.globalFx
			? {
					name: 'Set global FX parameter',
					options: [
						{
							id: 'parameter',
							type: 'dropdown',
							label: 'Parameter',
							default: 'reverbVolume',
							choices: globalFxParameters,
						},
						{
							id: 'value',
							type: 'number',
							label: globalOsc ? 'Global OSC value (native TotalMix unit)' : 'Normalized value (0-1)',
							default: 0.5,
							min: globalOsc ? -10000 : 0,
							max: globalOsc ? 10000 : 1,
							step: 0.001,
						},
					],
					callback: async ({ options }) => {
						await self.runCommand(async () =>
							self.controller.setGlobalFxParameter(String(options.parameter), Number(options.value)),
						)
					},
				}
			: false,
		room_eq_switch: capabilities.roomEq
			? {
					name: 'Room EQ',
					options: [standaloneOutputOption, roomEqSideOption, operationOption],
					callback: async ({ options }) => {
						const output = asIndex(options.output, 'hardware output')
						self.registerRoomEqFeedback(output, options.side, 'reqEnable')
						await self.runCommand(async () => self.controller.setRoomEqOption(output, options.side, options.operation))
					},
				}
			: false,
		set_room_eq_parameter: capabilities.roomEq
			? {
					name: 'Set Room EQ parameter',
					options: [
						standaloneOutputOption,
						roomEqSideOption,
						{
							id: 'parameter',
							type: 'dropdown',
							label: 'Parameter',
							default: 'reqGain1',
							choices: roomEqParameters,
						},
						{
							id: 'value',
							type: 'number',
							label: globalOsc ? 'Global OSC value (native TotalMix unit)' : 'Normalized value (0-1)',
							default: 0.5,
							min: globalOsc ? -10000 : 0,
							max: globalOsc ? 10000 : 1,
							step: 0.001,
						},
					],
					callback: async ({ options }) => {
						const output = asIndex(options.output, 'hardware output')
						self.registerRoomEqFeedback(output, options.side, String(options.parameter))
						await self.runCommand(async () =>
							self.controller.setRoomEqParameter(
								output,
								options.side,
								String(options.parameter),
								Number(options.value),
							),
						)
					},
				}
			: false,
		resync_target: {
			name: 'Request submix target state',
			options: [sourceOption, outputOption],
			callback: async ({ options }) => {
				const target = routeFromOptions(options.source, options.output)
				self.registerFeedbackRoute(target, 'fader', 'normalized')
				await self.runCommand(async () => self.controller.syncSubmixFader(target))
			},
		},
	})
}
