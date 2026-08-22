import { combineRgb } from '@companion-module/base'
import type ModuleInstance from './main.js'
import { detectDeviceProfile } from './model/profiles/index.js'
import {
	encodePresetTarget,
	presetTargetFromOptions,
	stringifyPresetTarget,
	type PresetMixerTarget,
} from './model/preset-target.js'
import { asIndex, asNumber, outputChoices, routeFromOptions, sourceChoices, sourceFromOptions } from './options.js'
import { formatDb, normalizedToDb } from './protocol/fader-curve.js'
import type { FaderUnit } from './protocol/controller.js'

type SourceOptions = { source: string }
type RouteOptions = SourceOptions & { output: number }
type PanRowOptions = {
	row: 'input' | 'playback' | 'output'
	inputSource: number
	playbackSource: number
	destination: number
	output: number
}
type ChannelRowOptions = Omit<PanRowOptions, 'destination'>

function formatGainFeedback(value: number | string | undefined): string {
	if (value === undefined) return ''
	const numeric = typeof value === 'number' ? value : Number.parseFloat(value)
	return Number.isFinite(numeric) ? numeric.toFixed(1) : String(value)
}

function normalizedGain(value: number, min: number, max: number): number {
	if (max <= min) return 0
	return Math.round(Math.max(0, Math.min(1, (value - min) / (max - min))) * 10_000) / 10_000
}

function compactGaugeChannelName(name: string): string {
	return name.replace(/^ADAT\s+(.+)$/i, 'ADAT\n$1')
}

function panPosition(value: number | undefined): number | '' {
	return value === undefined ? '' : Math.round((value * 200 - 100) * 10) / 10
}

function panDisplay(value: number | undefined): number | string {
	const position = panPosition(value)
	if (position === '') return ''
	if (position <= -100) return 'L'
	if (position >= 100) return 'R'
	if (position === 0) return 'C'
	return position
}

function panCentered(value: number | undefined): boolean {
	return panPosition(value) === 0
}

function mixerTargetFromOptions(options: Record<string, unknown>): PresetMixerTarget {
	const presetTarget = presetTargetFromOptions(options)
	if (presetTarget) return presetTarget
	if (options.row === 'output') return { row: 'output', output: asIndex(options.output, 'hardware output') }
	const row = options.row === 'playback' ? 'playback' : 'input'
	return {
		row,
		source: asIndex(row === 'input' ? options.inputSource : options.playbackSource, `${row} source`),
		destination: asIndex(options.destination, 'destination'),
	}
}

function channelTargetFromOptions(options: Record<string, unknown>): {
	bus: 'input' | 'playback' | 'output'
	index: number
} {
	const presetTarget = presetTargetFromOptions(options)
	if (presetTarget) {
		return presetTarget.row === 'output'
			? { bus: 'output', index: presetTarget.output }
			: { bus: presetTarget.row, index: presetTarget.source }
	}
	const bus = options.row === 'playback' ? 'playback' : options.row === 'output' ? 'output' : 'input'
	return {
		bus,
		index: asIndex(
			bus === 'input' ? options.inputSource : bus === 'playback' ? options.playbackSource : options.output,
			`${bus} channel`,
		),
	}
}

function inputTargetFromOptions(options: Record<string, unknown>): number {
	const presetTarget = presetTargetFromOptions(options)
	if (presetTarget) {
		if (presetTarget.row !== 'input') throw new Error('Preset target is not a hardware input')
		return presetTarget.source
	}
	return asIndex(options.input, 'hardware input')
}

export type FeedbacksSchema = {
	connection_active: { type: 'boolean'; options: Record<string, never> }
	totalmix_device_connected: { type: 'boolean'; options: Record<string, never> }
	detected_device_name: { type: 'value'; options: Record<string, never> }
	dsp_load_value: { type: 'value'; options: Record<string, never> }
	mixer_target: { type: 'value'; options: PanRowOptions }
	input_target: { type: 'value'; options: { input: number } }
	output_target: { type: 'value'; options: { output: number } }
	mute_state: { type: 'boolean'; options: SourceOptions }
	solo_state: { type: 'boolean'; options: SourceOptions }
	fader_threshold: {
		type: 'boolean'
		options: RouteOptions & { unit: FaderUnit; threshold: number; comparison: 'above' | 'below' }
	}
	target_confirmed: { type: 'boolean'; options: RouteOptions }
	submix_fader_value: { type: 'value'; options: RouteOptions & { unit: FaderUnit } }
	output_fader_value: { type: 'value'; options: { output: number; unit: FaderUnit } }
	fader_value: { type: 'value'; options: PanRowOptions & { unit: FaderUnit } }
	active_snapshot: { type: 'boolean'; options: { snapshot: number } }
	group_state: { type: 'boolean'; options: { groupType: 'mute' | 'pfl' | 'fader'; group: number } }
	input_gain_value: { type: 'value'; options: { input: number } }
	input_gain_normalized: { type: 'value'; options: { input: number } }
	phantom_state: { type: 'boolean'; options: { input: number } }
	instrument_state: { type: 'boolean'; options: { input: number } }
	pad_state: { type: 'boolean'; options: { input: number } }
	autoset_state: { type: 'boolean'; options: { input: number } }
	channel_option_state: { type: 'boolean'; options: ChannelRowOptions & { channelOption: string } }
	channel_option_value: { type: 'value'; options: ChannelRowOptions & { channelOption: string } }
	pan_value: { type: 'value'; options: PanRowOptions }
	pan_display_value: { type: 'value'; options: PanRowOptions }
	pan_centered: { type: 'boolean'; options: PanRowOptions }
	loopback_state: { type: 'boolean'; options: { output: number } }
	control_room_state: { type: 'boolean'; options: { control: string } }
	channel_name: { type: 'value'; options: ChannelRowOptions }
	channel_name_gauge: { type: 'value'; options: ChannelRowOptions }
	preset_value: {
		type: 'value'
		options: {
			target: string
			valueType: 'channel_name' | 'channel_name_gauge' | 'fader_db' | 'gain' | 'gain_normalized' | 'pan' | 'pan_display'
		}
	}
	preset_state: { type: 'boolean'; options: { target: string; stateType: 'mute' | 'autoset' | 'pan_centered' } }
	channel_level: { type: 'value'; options: ChannelRowOptions & { side: 'left' | 'right' } }
	channel_level_threshold: {
		type: 'boolean'
		options: ChannelRowOptions & { side: 'left' | 'right' | 'either'; threshold: number }
	}
	durec_state: { type: 'value'; options: Record<string, never> }
	durec_time: { type: 'value'; options: Record<string, never> }
	durec_recording: { type: 'boolean'; options: Record<string, never> }
	durec_playing: { type: 'boolean'; options: Record<string, never> }
	channel_processing_state: { type: 'boolean'; options: ChannelRowOptions & { processor: string } }
	channel_processing_value: { type: 'value'; options: ChannelRowOptions & { parameter: string } }
	global_fx_state: { type: 'boolean'; options: { effect: string } }
	global_fx_value: { type: 'value'; options: { parameter: string } }
	room_eq_state: { type: 'boolean'; options: { output: number; side: 'left' | 'right' | 'both' } }
	room_eq_value: {
		type: 'value'
		options: { output: number; side: 'left' | 'right' | 'both'; parameter: string }
	}
}

export function UpdateFeedbacks(self: ModuleInstance): void {
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
	const sourceOption = {
		id: 'source' as const,
		type: 'dropdown' as const,
		label: 'Source',
		default: 'input:0',
		choices: sourceChoices(choiceProfile),
	}
	const outputOption = {
		id: 'output' as const,
		type: 'dropdown' as const,
		label: 'Submix output',
		default: 0,
		choices: outputChoices(choiceProfile),
	}
	const hardwareOutputOption = {
		...outputOption,
		label: 'Hardware output',
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
	const panRowOption = {
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
	const panInputSourceOption = {
		id: 'inputSource' as const,
		type: 'dropdown' as const,
		label: 'Source',
		default: 0,
		choices: choiceInputs.map((channel) => ({ id: channel.index, label: channel.label })),
		isVisibleExpression: "$(options:row) == 'input'",
	}
	const panPlaybackSourceOption = {
		id: 'playbackSource' as const,
		type: 'dropdown' as const,
		label: 'Source',
		default: 0,
		choices: choicePlaybacks.map((channel) => ({ id: channel.index, label: channel.label })),
		isVisibleExpression: "$(options:row) == 'playback'",
	}
	const panDestinationOption = {
		id: 'destination' as const,
		type: 'dropdown' as const,
		label: 'Destination',
		default: 0,
		choices: outputChoices(choiceProfile),
		isVisibleExpression: "$(options:row) != 'output'",
	}
	const panOutputOption = {
		id: 'output' as const,
		type: 'dropdown' as const,
		label: 'Output',
		default: 0,
		choices: outputChoices(choiceProfile),
		isVisibleExpression: "$(options:row) == 'output'",
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
	const hiddenPresetValueTypeOption = {
		id: 'valueType' as const,
		type: 'dropdown' as const,
		label: 'Encoder preset value',
		default: 'channel_name' as const,
		choices: [
			{ id: 'channel_name', label: 'Channel name' },
			{ id: 'channel_name_gauge', label: 'Channel name for gauge' },
			{ id: 'fader_db', label: 'Fader level' },
			{ id: 'gain', label: 'Input gain' },
			{ id: 'gain_normalized', label: 'Normalized input gain' },
			{ id: 'pan', label: 'Pan/balance value' },
			{ id: 'pan_display', label: 'Pan/balance display' },
		],
		isVisibleExpression: 'false',
	}
	const hiddenPresetStateTypeOption = {
		id: 'stateType' as const,
		type: 'dropdown' as const,
		label: 'Encoder preset state',
		default: 'mute' as const,
		choices: [
			{ id: 'mute', label: 'Mute' },
			{ id: 'autoset', label: 'AutoSet' },
			{ id: 'pan_centered', label: 'Pan centered' },
		],
		isVisibleExpression: 'false',
	}
	const controlRoomOption = {
		id: 'control' as const,
		type: 'dropdown' as const,
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
			{ id: 'trim', label: 'Trim mode' },
		],
	}
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
		'reverbType',
		'reverbPredelay',
		'reverbLowcut',
		'reverbHighcut',
		'reverbRoomscale',
		'reverbAttack',
		'reverbHold',
		'reverbRelease',
		'reverbTime',
		'reverbHighdamp',
		'reverbSmooth',
		'reverbWidth',
		'reverbVolume',
		'echoType',
		'echoDelaytime',
		'echoFeedback',
		'echoHighcut',
		'echoWidth',
		'echoVolume',
	].map((id) => ({ id, label: id.replace(/([A-Z])/g, ' $1').replace(/^./, (character) => character.toUpperCase()) }))
	const processingTarget = (options: Record<string, unknown>) => {
		const bus = options.row === 'playback' ? 'playback' : options.row === 'output' ? 'output' : 'input'
		const index = asIndex(
			bus === 'input' ? options.inputSource : bus === 'playback' ? options.playbackSource : options.output,
			`${bus} channel`,
		)
		return { bus, index } as const
	}
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

	self.setFeedbackDefinitions({
		connection_active: {
			name: 'TotalMix OSC connection active',
			type: 'boolean',
			defaultStyle: { bgcolor: combineRgb(0, 128, 0), color: combineRgb(255, 255, 255) },
			options: [],
			callback: () => self.connectionActive,
		},
		totalmix_device_connected: globalOsc
			? {
					name: 'TotalMix device is connected',
					type: 'boolean',
					defaultStyle: { bgcolor: combineRgb(0, 128, 0), color: combineRgb(255, 255, 255) },
					options: [],
					callback: () => (self.controller.state.getGlobalParameter<number>('status:connection').value ?? 0) >= 0.5,
				}
			: false,
		detected_device_name: globalOsc
			? {
					name: 'Detected TotalMix device name',
					type: 'value',
					options: [],
					callback: () => self.controller.state.detectedDevice,
				}
			: false,
		dsp_load_value: globalOsc
			? {
					name: 'TotalMix DSP load',
					type: 'value',
					options: [],
					callback: () => self.controller.state.getGlobalParameter('status:dsp').value ?? '',
				}
			: false,
		mixer_target: {
			name: 'Mixer target for preset local variables',
			type: 'value',
			options: [panRowOption, panInputSourceOption, panPlaybackSourceOption, panDestinationOption, panOutputOption],
			callback: ({ options }) => encodePresetTarget(options),
		},
		input_target: {
			name: 'Hardware input target for preset local variables',
			type: 'value',
			options: [capabilityInputOption(capabilities.inputGainChannels)],
			callback: ({ options }) =>
				stringifyPresetTarget({ row: 'input', source: asIndex(options.input, 'hardware input'), destination: 0 }),
		},
		output_target: {
			name: 'Hardware output target for preset local variables',
			type: 'value',
			options: [hardwareOutputOption],
			callback: ({ options }) =>
				stringifyPresetTarget({ row: 'output', output: asIndex(options.output, 'hardware output') }),
		},
		mute_state: {
			name: 'Channel is muted',
			type: 'boolean',
			defaultStyle: { bgcolor: combineRgb(180, 0, 0), color: combineRgb(255, 255, 255) },
			options: [sourceOption],
			callback: ({ options }) => {
				const presetTarget = presetTargetFromOptions(options)
				if (presetTarget?.row === 'output') {
					const target = { bus: 'output' as const, index: presetTarget.output }
					self.registerChannelParameterFeedback(target, 'mute')
					return self.controller.state.getChannelParameter<boolean>(target, 'mute').value === true
				}
				const target = presetTarget
					? { bus: presetTarget.row, index: presetTarget.source }
					: sourceFromOptions(options.source)
				self.registerFeedbackChannel(target, 'mute')
				return self.controller.state.getChannel(target).mute.value === true
			},
		},
		solo_state: {
			name: 'Channel PFL is active',
			type: 'boolean',
			defaultStyle: { bgcolor: combineRgb(255, 200, 0), color: combineRgb(0, 0, 0) },
			options: [sourceOption],
			callback: ({ options }) => {
				const target = sourceFromOptions(options.source)
				self.registerFeedbackChannel(target, 'pfl')
				return self.controller.state.getChannel(target).solo.value === true
			},
		},
		fader_threshold: {
			name: 'Submix fader is above/below threshold',
			type: 'boolean',
			defaultStyle: { bgcolor: combineRgb(0, 100, 180), color: combineRgb(255, 255, 255) },
			options: [
				sourceOption,
				outputOption,
				unitOption,
				{ id: 'threshold', type: 'number', label: 'Threshold', default: -20, min: -65, max: 6, step: 0.1 },
				{
					id: 'comparison',
					type: 'dropdown',
					label: 'Comparison',
					default: 'above',
					choices: [
						{ id: 'above', label: 'At or above' },
						{ id: 'below', label: 'Below' },
					],
				},
			],
			callback: ({ options }) => {
				const target = routeFromOptions(options.source, options.output)
				self.registerFeedbackRoute(target, 'fader', options.unit === 'normalized' ? 'normalized' : 'db')
				const state = self.controller.state.getRoute(target)
				if (state.value === undefined) return false
				const value = options.unit === 'db' ? normalizedToDb(state.value) : state.value
				const threshold = asNumber(options.threshold, 'threshold')
				return options.comparison === 'above' ? value >= threshold : value < threshold
			},
		},
		target_confirmed: {
			name: 'Submix target has confirmed OSC state',
			type: 'boolean',
			defaultStyle: { bgcolor: combineRgb(0, 128, 0), color: combineRgb(255, 255, 255) },
			options: [sourceOption, outputOption],
			callback: ({ options }) => {
				const target = routeFromOptions(options.source, options.output)
				self.registerFeedbackRoute(target, 'fader', 'normalized')
				return self.controller.state.getRoute(target).quality === 'confirmed'
			},
		},
		submix_fader_value: {
			name: 'Submix fader value',
			type: 'value',
			options: [sourceOption, outputOption, unitOption],
			callback: ({ options }) => {
				const target = routeFromOptions(options.source, options.output)
				self.registerFeedbackRoute(target, 'fader', options.unit === 'normalized' ? 'normalized' : 'db')
				const state = self.controller.state.getRoute(target)
				if (state.value === undefined) return ''
				return options.unit === 'db'
					? state.display || formatDb(normalizedToDb(state.value))
					: Math.round(state.value * 10_000) / 10_000
			},
		},
		output_fader_value: {
			name: 'Output fader value',
			type: 'value',
			options: [hardwareOutputOption, unitOption],
			callback: ({ options }) => {
				const output = asIndex(options.output, 'output')
				self.registerFeedbackOutput(output, 'fader', options.unit === 'normalized' ? 'normalized' : 'db')
				const state = self.controller.state.getOutput(output)
				if (state.value === undefined) return ''
				return options.unit === 'db'
					? state.display || formatDb(normalizedToDb(state.value))
					: Math.round(state.value * 10_000) / 10_000
			},
		},
		fader_value: {
			name: 'Fader value',
			type: 'value',
			options: [
				panRowOption,
				panInputSourceOption,
				panPlaybackSourceOption,
				panDestinationOption,
				panOutputOption,
				unitOption,
			],
			callback: ({ options }) => {
				const target = mixerTargetFromOptions(options)
				const unit = options.unit === 'normalized' ? 'normalized' : 'db'
				if (target.row === 'output') {
					self.registerFeedbackOutput(target.output, 'fader', unit)
					const state = self.controller.state.getOutput(target.output)
					if (state.value === undefined) return ''
					return unit === 'db'
						? state.display || formatDb(normalizedToDb(state.value))
						: Math.round(state.value * 10_000) / 10_000
				}

				const route = { bus: target.row, index: target.source, output: target.destination }
				self.registerFeedbackRoute(route, 'fader', unit)
				const state = self.controller.state.getRoute(route)
				if (state.value === undefined) return ''
				return unit === 'db'
					? state.display || formatDb(normalizedToDb(state.value))
					: Math.round(state.value * 10_000) / 10_000
			},
		},
		active_snapshot: {
			name: 'Snapshot is active',
			type: 'boolean',
			defaultStyle: { bgcolor: combineRgb(0, 128, 0), color: combineRgb(255, 255, 255) },
			options: [
				{
					id: 'snapshot',
					type: 'dropdown',
					label: 'Snapshot',
					default: 1,
					choices: Array.from({ length: 8 }, (_, index) => ({ id: index + 1, label: `Snapshot ${index + 1}` })),
				},
			],
			callback: ({ options }) => {
				const snapshot = asIndex(options.snapshot, 'snapshot')
				self.registerGlobalFeedback('snapshots')
				return self.controller.state.getSnapshot(snapshot).value === true
			},
		},
		group_state: {
			name: 'TotalMix group is active',
			type: 'boolean',
			defaultStyle: { bgcolor: combineRgb(0, 100, 180), color: combineRgb(255, 255, 255) },
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
			],
			callback: ({ options }) => {
				const type = options.groupType
				const group = asIndex(options.group, 'group')
				self.registerGlobalFeedback('groups')
				return self.controller.state.getGlobalParameter<boolean>(`group:${type}:${group}`).value === true
			},
		},
		input_gain_value: capabilities.inputGainChannels.length
			? {
					name: 'Input gain value',
					type: 'value',
					options: [capabilityInputOption(capabilities.inputGainChannels)],
					callback: ({ options }) => {
						const target = { bus: 'input' as const, index: inputTargetFromOptions(options) }
						self.registerChannelParameterFeedback(target, 'gain')
						const state = self.controller.state.getChannelParameter<number>(target, 'gain')
						// Legacy OSC reports a normalized 0–1 value and a separate formatted
						// TotalMix value. Do not expose the normalized transport value as gain.
						return formatGainFeedback(state.display ?? (globalOsc ? state.value : undefined))
					},
				}
			: false,
		input_gain_normalized: capabilities.inputGainChannels.length
			? {
					name: 'Input gain normalized value',
					type: 'value',
					options: [capabilityInputOption(capabilities.inputGainChannels)],
					callback: ({ options }) => {
						const target = { bus: 'input' as const, index: inputTargetFromOptions(options) }
						self.registerChannelParameterFeedback(target, 'gain')
						const state = self.controller.state.getChannelParameter<number>(target, 'gain')
						if (!globalOsc) {
							return typeof state.value === 'number' ? normalizedGain(state.value, 0, 1) : ''
						}

						const detectedProfile = self.controller.state.detectedDevice
							? detectDeviceProfile(self.controller.state.detectedDevice)
							: self.profile
						const configuredRange = detectedProfile?.capabilities.inputGainRanges?.[target.index]
						if (!configuredRange || typeof state.value !== 'number') return ''
						let range = configuredRange
						if (configuredRange.instrument) {
							self.registerChannelParameterFeedback(target, 'instrument')
							if (self.controller.state.getChannelParameter<boolean>(target, 'instrument').value === true) {
								range = configuredRange.instrument
							}
						}
						return normalizedGain(state.value, range.min, range.max)
					},
				}
			: false,
		phantom_state: capabilities.phantomChannels.length
			? {
					name: 'Phantom power is active',
					type: 'boolean',
					defaultStyle: { bgcolor: combineRgb(180, 0, 0), color: combineRgb(255, 255, 255) },
					options: [capabilityInputOption(capabilities.phantomChannels)],
					callback: ({ options }) => {
						const target = { bus: 'input' as const, index: asIndex(options.input, 'hardware input') }
						self.registerChannelParameterFeedback(target, 'phantom')
						return self.controller.state.getChannelParameter<boolean>(target, 'phantom').value === true
					},
				}
			: false,
		instrument_state: capabilities.instrumentChannels.length
			? {
					name: 'Instrument input is active',
					type: 'boolean',
					defaultStyle: { bgcolor: combineRgb(0, 100, 180), color: combineRgb(255, 255, 255) },
					options: [capabilityInputOption(capabilities.instrumentChannels)],
					callback: ({ options }) => {
						const target = { bus: 'input' as const, index: asIndex(options.input, 'hardware input') }
						self.registerChannelParameterFeedback(target, 'instrument')
						return self.controller.state.getChannelParameter<boolean>(target, 'instrument').value === true
					},
				}
			: false,
		pad_state: capabilities.padChannels.length
			? {
					name: 'Input pad is active',
					type: 'boolean',
					defaultStyle: { bgcolor: combineRgb(180, 100, 0), color: combineRgb(255, 255, 255) },
					options: [capabilityInputOption(capabilities.padChannels)],
					callback: ({ options }) => {
						const target = { bus: 'input' as const, index: asIndex(options.input, 'hardware input') }
						self.registerChannelParameterFeedback(target, 'pad')
						return self.controller.state.getChannelParameter<boolean>(target, 'pad').value === true
					},
				}
			: false,
		autoset_state: capabilities.autosetChannels.length
			? {
					name: 'AutoSet gain is active',
					type: 'boolean',
					defaultStyle: { bgcolor: combineRgb(0, 128, 0), color: combineRgb(255, 255, 255) },
					options: [capabilityInputOption(capabilities.autosetChannels)],
					callback: ({ options }) => {
						const target = { bus: 'input' as const, index: inputTargetFromOptions(options) }
						self.registerChannelParameterFeedback(target, 'autoset')
						return self.controller.state.getChannelParameter<boolean>(target, 'autoset').value === true
					},
				}
			: false,
		channel_option_state: {
			name: 'Channel option is active',
			type: 'boolean',
			defaultStyle: { bgcolor: combineRgb(0, 100, 180), color: combineRgb(255, 255, 255) },
			options: [
				panRowOption,
				panInputSourceOption,
				panPlaybackSourceOption,
				panOutputOption,
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
					],
				},
			],
			callback: ({ options }) => {
				const target = processingTarget(options)
				const option = String(options.channelOption)
				self.registerChannelParameterFeedback(target, option)
				return self.controller.state.getChannelParameter<boolean>(target, option).value === true
			},
		},
		channel_option_value: {
			name: 'Channel option value',
			type: 'value',
			options: [
				panRowOption,
				panInputSourceOption,
				panPlaybackSourceOption,
				panOutputOption,
				{
					id: 'channelOption',
					type: 'dropdown',
					label: 'Option',
					default: 'width',
					choices: [
						{ id: 'gainRight', label: 'Right-channel input gain' },
						{ id: 'refLevel', label: 'Analog reference level' },
						{ id: 'width', label: 'Stereo width' },
					],
				},
			],
			callback: ({ options }) => {
				const target = processingTarget(options)
				const option = String(options.channelOption)
				self.registerChannelParameterFeedback(target, option)
				const state = self.controller.state.getChannelParameter(target, option)
				return state.display ?? state.value ?? ''
			},
		},
		pan_value: {
			name: 'Pan/balance value',
			type: 'value',
			options: [panRowOption, panInputSourceOption, panPlaybackSourceOption, panDestinationOption, panOutputOption],
			callback: ({ options }) => {
				const target = mixerTargetFromOptions(options)
				if (target.row === 'output') {
					self.registerFeedbackOutput(target.output, 'pan')
					return panPosition(self.controller.state.getOutputPan(target.output).value)
				}
				const route = { bus: target.row, index: target.source, output: target.destination }
				self.registerFeedbackRoute(route, 'pan')
				return panPosition(self.controller.state.getRoutePan(route).value)
			},
		},
		pan_display_value: {
			name: 'Pan/balance display value',
			type: 'value',
			options: [panRowOption, panInputSourceOption, panPlaybackSourceOption, panDestinationOption, panOutputOption],
			callback: ({ options }) => {
				const target = mixerTargetFromOptions(options)
				if (target.row === 'output') {
					self.registerFeedbackOutput(target.output, 'pan')
					return panDisplay(self.controller.state.getOutputPan(target.output).value)
				}
				const route = { bus: target.row, index: target.source, output: target.destination }
				self.registerFeedbackRoute(route, 'pan')
				return panDisplay(self.controller.state.getRoutePan(route).value)
			},
		},
		pan_centered: {
			name: 'Pan/balance is centered',
			type: 'boolean',
			defaultStyle: {},
			options: [panRowOption, panInputSourceOption, panPlaybackSourceOption, panDestinationOption, panOutputOption],
			callback: ({ options }) => {
				const target = mixerTargetFromOptions(options)
				if (target.row === 'output') {
					self.registerFeedbackOutput(target.output, 'pan')
					return panCentered(self.controller.state.getOutputPan(target.output).value)
				}
				const route = { bus: target.row, index: target.source, output: target.destination }
				self.registerFeedbackRoute(route, 'pan')
				return panCentered(self.controller.state.getRoutePan(route).value)
			},
		},
		loopback_state: {
			name: 'Output loopback is active',
			type: 'boolean',
			defaultStyle: { bgcolor: combineRgb(180, 0, 0), color: combineRgb(255, 255, 255) },
			options: [hardwareOutputOption],
			callback: ({ options }) => {
				const target = { bus: 'output' as const, index: asIndex(options.output, 'hardware output') }
				self.registerChannelParameterFeedback(target, 'loopback')
				return self.controller.state.getChannelParameter<boolean>(target, 'loopback').value === true
			},
		},
		control_room_state: {
			name: 'Control Room function is active',
			type: 'boolean',
			defaultStyle: { bgcolor: combineRgb(0, 100, 180), color: combineRgb(255, 255, 255) },
			options: [controlRoomOption],
			callback: ({ options }) => {
				const control = String(options.control)
				self.registerGlobalFeedback('controlRoom')
				return self.controller.state.getGlobalParameter<boolean>(control).value === true
			},
		},
		channel_name: {
			name: 'TotalMix channel name',
			type: 'value',
			options: [panRowOption, panInputSourceOption, panPlaybackSourceOption, panOutputOption],
			callback: ({ options }) => {
				const target = channelTargetFromOptions(options)
				self.registerFeedbackChannel(target, 'name')
				return self.controller.state.getChannel(target).name ?? ''
			},
		},
		channel_name_gauge: {
			name: 'TotalMix channel name for a gauge',
			type: 'value',
			options: [panRowOption, panInputSourceOption, panPlaybackSourceOption, panOutputOption],
			callback: ({ options }) => {
				const target = channelTargetFromOptions(options)
				self.registerFeedbackChannel(target, 'name')
				return compactGaugeChannelName(self.controller.state.getChannel(target).name ?? '')
			},
		},
		preset_value: {
			name: 'Encoder preset value (internal)',
			type: 'value',
			options: [hiddenPresetTargetOption, hiddenPresetValueTypeOption],
			callback: ({ options }) => {
				const target = presetTargetFromOptions(options)
				if (!target) return ''
				const channelTarget =
					target.row === 'output'
						? { bus: 'output' as const, index: target.output }
						: { bus: target.row, index: target.source }

				switch (options.valueType) {
					case 'channel_name':
						self.registerFeedbackChannel(channelTarget, 'name')
						return self.controller.state.getChannel(channelTarget).name ?? ''
					case 'channel_name_gauge':
						self.registerFeedbackChannel(channelTarget, 'name')
						return compactGaugeChannelName(self.controller.state.getChannel(channelTarget).name ?? '')
					case 'fader_db': {
						if (target.row === 'output') {
							self.registerFeedbackOutput(target.output, 'fader', 'db')
							const state = self.controller.state.getOutput(target.output)
							return state.value === undefined ? '' : state.display || formatDb(normalizedToDb(state.value))
						}
						const route = { bus: target.row, index: target.source, output: target.destination }
						self.registerFeedbackRoute(route, 'fader', 'db')
						const state = self.controller.state.getRoute(route)
						return state.value === undefined ? '' : state.display || formatDb(normalizedToDb(state.value))
					}
					case 'gain': {
						if (target.row !== 'input') return ''
						const inputTarget = { bus: 'input' as const, index: target.source }
						self.registerChannelParameterFeedback(inputTarget, 'gain')
						const state = self.controller.state.getChannelParameter<number>(inputTarget, 'gain')
						return formatGainFeedback(state.display ?? (globalOsc ? state.value : undefined))
					}
					case 'gain_normalized': {
						if (target.row !== 'input') return ''
						const inputTarget = { bus: 'input' as const, index: target.source }
						self.registerChannelParameterFeedback(inputTarget, 'gain')
						const state = self.controller.state.getChannelParameter<number>(inputTarget, 'gain')
						if (!globalOsc) return typeof state.value === 'number' ? normalizedGain(state.value, 0, 1) : ''
						const detectedProfile = self.controller.state.detectedDevice
							? detectDeviceProfile(self.controller.state.detectedDevice)
							: self.profile
						const configuredRange = detectedProfile?.capabilities.inputGainRanges?.[target.source]
						if (!configuredRange || typeof state.value !== 'number') return ''
						let range = configuredRange
						if (configuredRange.instrument) {
							self.registerChannelParameterFeedback(inputTarget, 'instrument')
							if (self.controller.state.getChannelParameter<boolean>(inputTarget, 'instrument').value === true) {
								range = configuredRange.instrument
							}
						}
						return normalizedGain(state.value, range.min, range.max)
					}
					case 'pan':
					case 'pan_display': {
						let value: number | undefined
						if (target.row === 'output') {
							self.registerFeedbackOutput(target.output, 'pan')
							value = self.controller.state.getOutputPan(target.output).value
						} else {
							const route = { bus: target.row, index: target.source, output: target.destination }
							self.registerFeedbackRoute(route, 'pan')
							value = self.controller.state.getRoutePan(route).value
						}
						return options.valueType === 'pan' ? panPosition(value) : panDisplay(value)
					}
				}
			},
		},
		preset_state: {
			name: 'Encoder preset state (internal)',
			type: 'boolean',
			defaultStyle: {},
			options: [hiddenPresetTargetOption, hiddenPresetStateTypeOption],
			callback: ({ options }) => {
				const target = presetTargetFromOptions(options)
				if (!target) return false
				if (options.stateType === 'pan_centered') {
					if (target.row === 'output') {
						self.registerFeedbackOutput(target.output, 'pan')
						return panCentered(self.controller.state.getOutputPan(target.output).value)
					}
					const route = { bus: target.row, index: target.source, output: target.destination }
					self.registerFeedbackRoute(route, 'pan')
					return panCentered(self.controller.state.getRoutePan(route).value)
				}
				if (options.stateType === 'autoset') {
					if (target.row !== 'input') return false
					const inputTarget = { bus: 'input' as const, index: target.source }
					self.registerChannelParameterFeedback(inputTarget, 'autoset')
					return self.controller.state.getChannelParameter<boolean>(inputTarget, 'autoset').value === true
				}
				if (target.row === 'output') {
					const outputTarget = { bus: 'output' as const, index: target.output }
					self.registerChannelParameterFeedback(outputTarget, 'mute')
					return self.controller.state.getChannelParameter<boolean>(outputTarget, 'mute').value === true
				}
				const channelTarget = { bus: target.row, index: target.source }
				self.registerFeedbackChannel(channelTarget, 'mute')
				return self.controller.state.getChannel(channelTarget).mute.value === true
			},
		},
		channel_level: {
			name: 'TotalMix channel level',
			type: 'value',
			options: [
				panRowOption,
				panInputSourceOption,
				panPlaybackSourceOption,
				panOutputOption,
				{
					id: 'side',
					type: 'dropdown',
					label: 'Meter side',
					default: 'left',
					choices: [
						{ id: 'left', label: 'Left / mono' },
						{ id: 'right', label: 'Right' },
					],
				},
			],
			callback: ({ options }) => {
				const bus = options.row === 'playback' ? 'playback' : options.row === 'output' ? 'output' : 'input'
				const index = asIndex(
					bus === 'input' ? options.inputSource : bus === 'playback' ? options.playbackSource : options.output,
					`${bus} channel`,
				)
				self.registerFeedbackChannel({ bus, index }, options.side === 'right' ? 'levelRight' : 'levelLeft')
				const channel = self.controller.state.getChannel({ bus, index })
				const state = options.side === 'right' ? channel.levelRight : channel.levelLeft
				return state.display ?? state.value ?? ''
			},
		},
		channel_level_threshold: {
			name: 'Channel level is above threshold',
			type: 'boolean',
			defaultStyle: { bgcolor: combineRgb(180, 0, 0), color: combineRgb(255, 255, 255) },
			options: [
				panRowOption,
				panInputSourceOption,
				panPlaybackSourceOption,
				panOutputOption,
				{
					id: 'side',
					type: 'dropdown',
					label: 'Meter side',
					default: 'either',
					choices: [
						{ id: 'either', label: 'Either / mono' },
						{ id: 'left', label: 'Left' },
						{ id: 'right', label: 'Right' },
					],
				},
				{
					id: 'threshold',
					type: 'number',
					label: 'Threshold (dBFS)',
					default: -1,
					min: -65,
					max: 6,
					step: 0.1,
				},
			],
			callback: ({ options }) => {
				const target = processingTarget(options)
				if (options.side === 'either' || options.side === 'left') self.registerFeedbackChannel(target, 'levelLeft')
				if (options.side === 'either' || options.side === 'right') self.registerFeedbackChannel(target, 'levelRight')
				const channel = self.controller.state.getChannel(target)
				const levelDb = (side: 'left' | 'right'): number | undefined => {
					const state = side === 'left' ? channel.levelLeft : channel.levelRight
					if (state.display) {
						const parsed = Number.parseFloat(state.display.replace(',', '.'))
						if (Number.isFinite(parsed)) return parsed
					}
					return globalOsc && typeof state.value === 'number' ? state.value : undefined
				}
				const sides = options.side === 'either' ? (['left', 'right'] as const) : [options.side]
				return sides.some((side) => {
					const level = levelDb(side)
					return level !== undefined && level >= Number(options.threshold)
				})
			},
		},
		durec_state: capabilities.duRec
			? {
					name: 'DURec state',
					type: 'value',
					options: [],
					callback: () => {
						self.registerGlobalFeedback('duRec')
						return self.controller.state.getGlobalParameter('recordState').value ?? '—'
					},
				}
			: false,
		durec_time: capabilities.duRec
			? {
					name: 'DURec time',
					type: 'value',
					options: [],
					callback: () => {
						self.registerGlobalFeedback('duRec')
						return self.controller.state.getGlobalParameter('recordTime').value ?? '00:00:00'
					},
				}
			: false,
		durec_recording: capabilities.duRec
			? {
					name: 'DURec is recording',
					type: 'boolean',
					defaultStyle: { bgcolor: combineRgb(180, 0, 0), color: combineRgb(255, 255, 255) },
					options: [],
					callback: () => {
						self.registerGlobalFeedback('duRec')
						return self.controller.state.getGlobalParameter<string>('recordState').value === 'Record'
					},
				}
			: false,
		durec_playing: capabilities.duRec
			? {
					name: 'DURec is playing',
					type: 'boolean',
					defaultStyle: { bgcolor: combineRgb(52, 92, 115), color: combineRgb(255, 255, 255) },
					options: [],
					callback: () => {
						self.registerGlobalFeedback('duRec')
						return self.controller.state.getGlobalParameter<string>('recordState').value === 'Play'
					},
				}
			: false,
		channel_processing_state: capabilities.channelFx
			? {
					name: 'Channel processing is active',
					type: 'boolean',
					defaultStyle: { bgcolor: combineRgb(0, 100, 180), color: combineRgb(255, 255, 255) },
					options: [
						panRowOption,
						panInputSourceOption,
						panPlaybackSourceOption,
						panOutputOption,
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
					],
					callback: ({ options }) => {
						const target = processingTarget(options)
						const processor = String(options.processor)
						self.registerChannelParameterFeedback(target, processor)
						return self.controller.state.getChannelParameter<boolean>(target, processor).value === true
					},
				}
			: false,
		channel_processing_value: capabilities.channelFx
			? {
					name: 'Channel processing parameter value',
					type: 'value',
					options: [
						panRowOption,
						panInputSourceOption,
						panPlaybackSourceOption,
						panOutputOption,
						{
							id: 'parameter',
							type: 'dropdown',
							label: 'Parameter',
							default: 'eqGain1',
							choices: channelProcessingParameters,
						},
					],
					callback: ({ options }) => {
						const target = processingTarget(options)
						const parameter = String(options.parameter)
						self.registerChannelParameterFeedback(target, parameter)
						const state = self.controller.state.getChannelParameter(target, parameter)
						return state.display ?? state.value ?? ''
					},
				}
			: false,
		global_fx_state: capabilities.globalFx
			? {
					name: 'Global FX is active',
					type: 'boolean',
					defaultStyle: { bgcolor: combineRgb(0, 100, 180), color: combineRgb(255, 255, 255) },
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
					],
					callback: ({ options }) => {
						const effect = String(options.effect)
						self.registerGlobalFeedback('globalFx')
						return self.controller.state.getGlobalParameter<boolean>(effect).value === true
					},
				}
			: false,
		global_fx_value: capabilities.globalFx
			? {
					name: 'Global FX parameter value',
					type: 'value',
					options: [
						{
							id: 'parameter',
							type: 'dropdown',
							label: 'Parameter',
							default: 'reverbVolume',
							choices: globalFxParameters,
						},
					],
					callback: ({ options }) => {
						const parameter = String(options.parameter)
						self.registerGlobalFeedback('globalFx')
						const state = self.controller.state.getGlobalParameter(parameter)
						return state.display ?? state.value ?? ''
					},
				}
			: false,
		room_eq_state: capabilities.roomEq
			? {
					name: 'Room EQ is active',
					type: 'boolean',
					defaultStyle: { bgcolor: combineRgb(0, 100, 180), color: combineRgb(255, 255, 255) },
					options: [hardwareOutputOption, roomEqSideOption],
					callback: ({ options }) => {
						const output = asIndex(options.output, 'hardware output')
						self.registerRoomEqFeedback(output, options.side, 'reqEnable')
						return (
							self.controller.state.getChannelParameter<boolean>(
								{ bus: 'output', index: output },
								`roomEq:${options.side}:reqEnable`,
							).value === true
						)
					},
				}
			: false,
		room_eq_value: capabilities.roomEq
			? {
					name: 'Room EQ parameter value',
					type: 'value',
					options: [
						hardwareOutputOption,
						roomEqSideOption,
						{
							id: 'parameter',
							type: 'dropdown',
							label: 'Parameter',
							default: 'reqGain1',
							choices: roomEqParameters,
						},
					],
					callback: ({ options }) => {
						const output = asIndex(options.output, 'hardware output')
						const parameter = String(options.parameter)
						self.registerRoomEqFeedback(output, options.side, parameter)
						const state = self.controller.state.getChannelParameter(
							{ bus: 'output', index: output },
							`roomEq:${options.side}:${parameter}`,
						)
						return state.display ?? state.value ?? ''
					},
				}
			: false,
	})
}
