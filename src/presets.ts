import {
	ButtonGraphicsDecorationType,
	combineRgb,
	type CompanionLayeredButtonPresetDefinition,
	type CompanionPresetDefinitions,
	type CompanionPresetSection,
	type CompanionSimplePresetDefinition,
	type SomePresetActionEntry,
	type SomePresetLayeredFeedbackEntry,
	type SomePresetSimpleFeedbackEntry,
} from '@companion-module/base'
import type ModuleInstance from './main.js'
import type { ModuleSchema } from './main.js'

const white = combineRgb(255, 255, 255)
const tmDark = combineRgb(20, 27, 31)
const tmText = combineRgb(145, 177, 193)
const tmCyan = combineRgb(0, 205, 215)
const tmCyanDark = combineRgb(0, 65, 72)
const tmOrange = combineRgb(235, 132, 70)
const tmOrangeDark = combineRgb(91, 47, 23)
const tmRed = combineRgb(255, 57, 31)
const tmRedDark = combineRgb(96, 17, 12)
const tmBlue = combineRgb(52, 92, 115)
const simpleFontSize = '14'
const layeredFontSize = 25
const gaugeFontSize = 20

type PresetAction = SomePresetActionEntry<ModuleSchema>
type PresetFeedback = SomePresetSimpleFeedbackEntry<ModuleSchema>
type LayeredPreset = CompanionLayeredButtonPresetDefinition<ModuleSchema>
type LayeredFeedback = SomePresetLayeredFeedbackEntry<ModuleSchema>

function fixedValue<T extends string | number | boolean>(value: T): { isExpression: false; value: T } {
	return { isExpression: false, value }
}

const localTarget = { isExpression: true as const, value: '$(local:target)' }
const localTargetBinding = { target: localTarget }

function levelRingGauge(id: string, name: string, variableName: string): LayeredPreset['elements'][number] {
	return {
		id,
		name,
		type: 'gauge',
		enabled: true,
		x: 0,
		y: 3,
		width: 100,
		height: 100,
		value: { isExpression: true, value: `$(local:${variableName})` },
		min: 0,
		max: 1,
		origin: 0,
		symmetric: false,
		orientation: 'ring',
		reverse: false,
		trackWidth: 100,
		startAngle: 230,
		endAngle: 130,
		ringWidth: 15,
		roundedEnds: true,
		fillEnabled: true,
		multiColour: false,
		stops: [{ value: 0, color: tmOrange, gradient: false }],
		markerEnabled: false,
		trackStyle: 'transparent',
		trackAmount: 0,
	}
}

function layeredStateFeedback(
	feedbackId:
		| 'mute_state'
		| 'autoset_state'
		| 'preset_state'
		| 'channel_option_state'
		| 'control_room_state'
		| 'durec_recording'
		| 'durec_playing',
	options: Record<string, unknown>,
	background: number,
	foreground: number,
	text?: string,
): LayeredFeedback {
	return {
		feedbackId,
		options,
		styleOverrides: [
			{ elementId: 'background', elementProperty: 'color', override: fixedValue(background) },
			{ elementId: 'label', elementProperty: 'color', override: fixedValue(foreground) },
			...(text ? [{ elementId: 'label', elementProperty: 'text', override: fixedValue(text) }] : []),
		],
	} as LayeredFeedback
}

function simpleButton(
	name: string,
	text: string,
	actions: PresetAction[],
	feedbacks: PresetFeedback[] = [],
	keywords: string[] = [],
	upActions: PresetAction[] = [],
): CompanionSimplePresetDefinition<ModuleSchema> {
	return {
		type: 'simple',
		name,
		keywords,
		style: { text, size: simpleFontSize, color: tmText, bgcolor: tmDark, show_topbar: false },
		steps: [{ down: actions, up: upActions }],
		feedbacks,
	}
}

function layeredButton(
	name: string,
	text: string,
	down: PresetAction[] = [],
	localVariables: LayeredPreset['localVariables'] = [],
	feedbacks: LayeredPreset['feedbacks'] = [],
	keywords: string[] = [],
): LayeredPreset {
	return {
		type: 'layered',
		name,
		keywords,
		canvas: { decoration: ButtonGraphicsDecorationType.None },
		elements: [
			{ id: 'background', type: 'box', x: 0, y: 0, width: 100, height: 100, color: tmDark },
			{
				id: 'label',
				type: 'text',
				x: 0,
				y: 0,
				width: 100,
				height: 100,
				text,
				fontsize: layeredFontSize,
				fontsizeAllowShrink: false,
				color: tmText,
				halign: 'center',
				valign: 'center',
			},
		],
		steps: [{ down, up: [] }],
		localVariables,
		feedbacks,
	}
}

function encoder(
	name: string,
	text: string,
	rotateLeft: PresetAction[],
	rotateRight: PresetAction[],
	down: PresetAction[] = [],
	localVariables: LayeredPreset['localVariables'] = [],
	feedbacks: LayeredPreset['feedbacks'] = [],
	keywords: string[] = [],
	extraElements: LayeredPreset['elements'] = [],
	fontSizeOverride?: number,
): LayeredPreset {
	const fontSize =
		fontSizeOverride ??
		(extraElements.some((element) => 'type' in element && element.type === 'gauge') ? gaugeFontSize : layeredFontSize)
	return {
		type: 'layered',
		name,
		keywords: [...keywords, 'encoder', 'dial', 'rotate', 'Stream Deck Plus'],
		canvas: { decoration: ButtonGraphicsDecorationType.None },
		elements: [
			{ id: 'background', type: 'box', x: 0, y: 0, width: 100, height: 100, color: tmDark },
			...extraElements,
			{
				id: 'label',
				type: 'text',
				x: 0,
				y: 0,
				width: 100,
				height: 100,
				text,
				fontsize: fontSize,
				fontsizeAllowShrink: false,
				color: tmText,
				halign: 'center',
				valign: 'center',
			},
		],
		steps: [{ down, up: [], rotate_left: rotateLeft, rotate_right: rotateRight }],
		localVariables,
		feedbacks,
	}
}

export function UpdatePresets(self: ModuleInstance): void {
	const capabilities = self.capabilities ?? self.profile.capabilities
	const inputs = self.getChoiceChannels('input')
	const playbacks = self.getChoiceChannels('playback')
	const outputs = self.getChoiceChannels('output')
	const input = inputs[0]?.index ?? 0
	const playback = playbacks[0]?.index ?? 0
	const output = outputs[0]?.index ?? 0
	const mainOutput = outputs.find((channel) => channel.label.trim().toLowerCase() === 'main')?.index ?? output
	const globalOsc = self.config?.protocolMode === 'global'
	const baseInputTarget = {
		row: 'input' as const,
		inputSource: input,
		playbackSource: playback,
		destination: output,
		output,
	}
	const presets: CompanionPresetDefinitions<ModuleSchema> = {}
	const encoders: string[] = []
	const channels: string[] = []
	const controlRoom: string[] = []
	const sessions: string[] = []
	const duRec: string[] = []

	presets['fader-encoder'] = encoder(
		'Fader',
		'$(local:channel_name)\n$(local:current_volume)',
		[{ actionId: 'preset_adjust_fader', options: { ...localTargetBinding, unit: 'db', amount: -1 } }],
		[{ actionId: 'preset_adjust_fader', options: { ...localTargetBinding, unit: 'db', amount: 1 } }],
		[
			{
				actionId: 'preset_set_mute',
				options: { ...localTargetBinding, operation: 'toggle' },
			},
		],
		[
			{
				variableType: 'feedback',
				variableName: 'target',
				headline: 'Target',
				feedbackId: 'mixer_target',
				options: baseInputTarget,
			},
			{
				variableType: 'feedback',
				variableName: 'channel_name',
				feedbackId: 'preset_value',
				options: { ...localTargetBinding, valueType: 'channel_name' },
			},
			{
				variableType: 'feedback',
				variableName: 'current_volume',
				feedbackId: 'preset_value',
				options: { ...localTargetBinding, valueType: 'fader_db' },
			},
		],
		[
			layeredStateFeedback(
				'preset_state',
				{ ...localTargetBinding, stateType: 'mute' },
				tmCyanDark,
				tmCyan,
				'$(local:channel_name)\nMUTED',
			),
		],
		['input', 'playback', 'output', 'submix', 'fader', 'volume', 'level', 'mute'],
		[],
		gaugeFontSize,
	)
	if (outputs.length > 0) {
		presets['main-fader-encoder'] = encoder(
			'Main output fader',
			'$(local:channel_name)\n$(local:current_volume)',
			[{ actionId: 'preset_adjust_fader', options: { ...localTargetBinding, unit: 'db', amount: -1 } }],
			[{ actionId: 'preset_adjust_fader', options: { ...localTargetBinding, unit: 'db', amount: 1 } }],
			[
				{
					actionId: 'preset_set_mute',
					options: {
						operation: 'toggle',
						...localTargetBinding,
					},
				},
			],
			[
				{
					variableType: 'feedback',
					variableName: 'target',
					headline: 'Target',
					feedbackId: 'output_target',
					options: { output: mainOutput },
				},
				{
					variableType: 'feedback',
					variableName: 'channel_name',
					feedbackId: 'preset_value',
					options: { ...localTargetBinding, valueType: 'channel_name' },
				},
				{
					variableType: 'feedback',
					variableName: 'current_volume',
					feedbackId: 'preset_value',
					options: { ...localTargetBinding, valueType: 'fader_db' },
				},
			],
			[
				layeredStateFeedback(
					'preset_state',
					{ ...localTargetBinding, stateType: 'mute' },
					tmCyanDark,
					tmCyan,
					'$(local:channel_name)\nMUTED',
				),
			],
			['main', 'output', 'fader', 'volume', 'mute'],
		)
	}

	const gainInput = capabilities.inputGainChannels[0]
	if (gainInput !== undefined) {
		const autoset = capabilities.autosetChannels.includes(gainInput)
		presets['input-gain-encoder'] = encoder(
			'Input gain encoder',
			'$(local:channel_name)\nGAIN $(local:current_gain)',
			[
				{
					actionId: 'preset_adjust_input_gain',
					options: { ...localTargetBinding, amount: globalOsc ? -0.5 : -0.01 },
				},
			],
			[
				{
					actionId: 'preset_adjust_input_gain',
					options: { ...localTargetBinding, amount: globalOsc ? 0.5 : 0.01 },
				},
			],
			autoset ? [{ actionId: 'preset_set_autoset', options: { ...localTargetBinding, operation: 'toggle' } }] : [],
			[
				{
					variableType: 'feedback',
					variableName: 'target',
					headline: 'Target',
					feedbackId: 'input_target',
					options: { input: gainInput },
				},
				{
					variableType: 'feedback',
					variableName: 'channel_name',
					feedbackId: 'preset_value',
					options: { ...localTargetBinding, valueType: 'channel_name_gauge' },
				},
				{
					variableType: 'feedback',
					variableName: 'current_gain',
					feedbackId: 'preset_value',
					options: { ...localTargetBinding, valueType: 'gain' },
				},
				{
					variableType: 'feedback',
					variableName: 'current_gain_gauge',
					feedbackId: 'preset_value',
					options: { ...localTargetBinding, valueType: 'gain_normalized' },
				},
			],
			autoset
				? [
						layeredStateFeedback(
							'preset_state',
							{ ...localTargetBinding, stateType: 'autoset' },
							tmOrangeDark,
							tmOrange,
						),
					]
				: [],
			['input', 'gain', 'preamp', 'autoset'],
			[levelRingGauge('gain-gauge', 'Input gain', 'current_gain_gauge')],
		)
	}

	presets['input-pan-encoder'] = encoder(
		'Pan/balance encoder',
		'$(local:channel_name)\nPAN $(local:current_pan_display)',
		[{ actionId: 'preset_adjust_pan', options: { ...localTargetBinding, amount: -5 } }],
		[{ actionId: 'preset_adjust_pan', options: { ...localTargetBinding, amount: 5 } }],
		[{ actionId: 'preset_set_pan', options: { ...localTargetBinding, value: 0 } }],
		[
			{
				variableType: 'feedback',
				variableName: 'target',
				headline: 'Target',
				feedbackId: 'mixer_target',
				options: baseInputTarget,
			},
			{
				variableType: 'feedback',
				variableName: 'channel_name',
				feedbackId: 'preset_value',
				options: { ...localTargetBinding, valueType: 'channel_name_gauge' },
			},
			{
				variableType: 'feedback',
				variableName: 'current_pan',
				feedbackId: 'preset_value',
				options: { ...localTargetBinding, valueType: 'pan' },
			},
			{
				variableType: 'feedback',
				variableName: 'current_pan_display',
				feedbackId: 'preset_value',
				options: { ...localTargetBinding, valueType: 'pan_display' },
			},
		],
		[
			{
				feedbackId: 'preset_state',
				options: { ...localTargetBinding, stateType: 'pan_centered' },
				styleOverrides: [{ elementId: 'pan-center', elementProperty: 'enabled', override: fixedValue(true) }],
			},
		],
		['pan', 'balance', 'center'],
		[
			{
				id: 'pan-gauge',
				name: 'Pan position',
				type: 'gauge',
				enabled: true,
				x: 0,
				y: 3,
				width: 100,
				height: 100,
				value: { isExpression: true, value: '$(local:current_pan)' },
				min: -100,
				max: 100,
				origin: 0,
				symmetric: false,
				orientation: 'ring',
				reverse: false,
				trackWidth: 100,
				startAngle: 230,
				endAngle: 130,
				ringWidth: 15,
				roundedEnds: true,
				fillEnabled: true,
				multiColour: false,
				stops: [{ value: -100, color: tmOrange, gradient: false }],
				markerEnabled: false,
				trackStyle: 'transparent',
				trackAmount: 0,
			},
			{
				id: 'pan-center',
				name: 'Center marker',
				type: 'circle',
				enabled: false,
				x: 46,
				y: 4,
				width: 8,
				height: 8,
				color: tmOrange,
			},
		],
	)
	if (presets['input-gain-encoder']) encoders.push('input-gain-encoder')
	encoders.push('input-pan-encoder', 'fader-encoder')
	if (presets['main-fader-encoder']) encoders.push('main-fader-encoder')

	presets['input-1-mute'] = simpleButton(
		'Toggle hardware input mute',
		'MUTE',
		[{ actionId: 'set_mute', options: { source: `input:${input}`, operation: 'toggle' } }],
		[
			{
				feedbackId: 'mute_state',
				options: { source: `input:${input}` },
				style: { bgcolor: tmCyanDark, color: tmCyan },
			},
		],
		['mute', 'channel', 'input'],
	)
	channels.push('input-1-mute')

	presets['input-1-solo'] = simpleButton(
		'Toggle hardware input PFL',
		'PFL',
		[{ actionId: 'set_solo', options: { source: `input:${input}`, operation: 'toggle' } }],
		[
			{
				feedbackId: 'solo_state',
				options: { source: `input:${input}` },
				style: { bgcolor: tmOrangeDark, color: tmOrange },
			},
		],
		['pfl', 'solo', 'channel', 'input'],
	)
	channels.push('input-1-solo')

	presets['input-1-peak'] = simpleButton(
		'Input peak/clip indicator',
		'PEAK',
		[],
		[
			{
				feedbackId: 'channel_level_threshold',
				options: { ...baseInputTarget, side: 'either', threshold: -1 },
				style: { bgcolor: tmRedDark, color: tmRed },
			},
		],
		['peak', 'clip', 'meter', 'level', 'input'],
	)
	channels.push('input-1-peak')

	const inputOptionPresets = [
		['phantom', capabilities.phantomChannels[0], 'Phantom power', '48V', 'set_phantom', 'phantom_state'],
		[
			'instrument',
			capabilities.instrumentChannels[0],
			'Instrument input',
			'INSTR.',
			'set_instrument',
			'instrument_state',
		],
		['pad', capabilities.padChannels[0], 'Input pad', 'PAD', 'set_pad', 'pad_state'],
		['autoset', capabilities.autosetChannels[0], 'AutoSet gain', 'AUTO\nSET', 'set_autoset', 'autoset_state'],
	] as const
	for (const [id, target, name, text, actionId, feedbackId] of inputOptionPresets) {
		if (target === undefined) continue
		presets[`input-${id}`] = simpleButton(
			name,
			text,
			[{ actionId, options: { input: target, operation: 'toggle' } }],
			[{ feedbackId, options: { input: target }, style: { bgcolor: tmOrangeDark, color: tmOrange } }],
			[id, 'input'],
		)
		channels.push(`input-${id}`)
	}

	if (outputs.length > 0) {
		presets['output-loopback'] = simpleButton(
			'Output loopback',
			'LOOP\nBACK',
			[{ actionId: 'set_loopback', options: { output, operation: 'toggle' } }],
			[{ feedbackId: 'loopback_state', options: { output }, style: { bgcolor: tmRedDark, color: tmRed } }],
			['loopback', 'output', 'routing'],
		)
		channels.push('output-loopback')
	}

	const controlRoomPresets = [
		['dim', 'Dim', 'DIM', 'mainDim'],
		['mono', 'Mono', 'MONO', 'mainMono'],
		['talkback', 'Talkback', 'TALK\nBACK', 'mainTalkback'],
		['speaker-b', 'Speaker B', 'SPEA\nKER B', 'mainSpeakerB'],
	] as const
	for (const [id, name, text, control] of controlRoomPresets) {
		const presetId = `control-room-${id}`
		const momentary = id === 'mono'
		presets[presetId] = simpleButton(
			name,
			text,
			[{ actionId: 'control_room', options: { control, operation: momentary ? 'on' : 'toggle' } }],
			[{ feedbackId: 'control_room_state', options: { control }, style: { bgcolor: tmBlue, color: white } }],
			['control room', id],
			momentary ? [{ actionId: 'control_room', options: { control, operation: 'off' } }] : [],
		)
		controlRoom.push(presetId)
	}

	for (let snapshot = 1; snapshot <= 8; snapshot++) {
		const presetId = `snapshot-${snapshot}-recall`
		presets[presetId] = simpleButton(
			`Recall snapshot ${snapshot}`,
			`SNAP ${snapshot}`,
			[{ actionId: 'recall_snapshot', options: { snapshot } }],
			[
				{
					feedbackId: 'active_snapshot',
					options: { snapshot },
					style: { bgcolor: tmOrangeDark, color: tmOrange },
				},
			],
			['snapshot', 'recall', String(snapshot)],
		)
		sessions.push(presetId)
	}
	presets.undo = simpleButton('Undo', 'UNDO', [{ actionId: 'undo_redo', options: { command: 'undo' } }], [], ['undo'])
	presets.redo = simpleButton('Redo', 'REDO', [{ actionId: 'undo_redo', options: { command: 'redo' } }], [], ['redo'])
	sessions.push('undo', 'redo')

	if (capabilities.duRec) {
		presets['durec-record-stop'] = layeredButton(
			'DURec Record Toggle',
			'REC',
			[{ actionId: 'durec_transport', options: { command: 'recordStop' } }],
			[{ variableType: 'feedback', variableName: 'durec_time', feedbackId: 'durec_time', options: {} }],
			[layeredStateFeedback('durec_recording', {}, tmRedDark, tmRed, 'REC\n$(local:durec_time)')],
			['durec', 'record', 'stop', 'recorder'],
		)
		presets['durec-play-pause'] = layeredButton(
			'DURec Play / Pause',
			'PLAY',
			[{ actionId: 'durec_transport', options: { command: 'playPause' } }],
			[{ variableType: 'feedback', variableName: 'durec_time', feedbackId: 'durec_time', options: {} }],
			[layeredStateFeedback('durec_playing', {}, tmBlue, white, 'PAUSE\n$(local:durec_time)')],
			['durec', 'play', 'pause'],
		)
		presets['durec-stop'] = simpleButton(
			'DURec Record Stop',
			'STOP',
			[{ actionId: 'durec_transport', options: { command: 'stop' } }],
			[],
			['durec', 'stop'],
		)
		duRec.push('durec-record-stop', 'durec-play-pause', 'durec-stop')

		if (globalOsc) {
			presets['durec-previous'] = simpleButton(
				'DURec previous file',
				'PREV',
				[{ actionId: 'durec_transport', options: { command: 'previous' } }],
				[],
				['durec', 'previous'],
			)
			presets['durec-next'] = simpleButton(
				'DURec next file',
				'NEXT',
				[{ actionId: 'durec_transport', options: { command: 'next' } }],
				[],
				['durec', 'next'],
			)
			duRec.push('durec-previous', 'durec-next')
		}

		if (inputs.length > 0) {
			presets['durec-channel-record'] = simpleButton(
				'DURec channel recording',
				'REC\nCHANNEL',
				[{ actionId: 'durec_channel_record', options: { row: 'input', input, output, operation: 'toggle' } }],
				[
					{
						feedbackId: 'channel_option_state',
						options: {
							row: 'input',
							inputSource: input,
							playbackSource: playback,
							output,
							channelOption: 'recordEnable',
						},
						style: { bgcolor: tmRedDark, color: tmRed },
					},
				],
				['durec', 'channel', 'record enable'],
			)
			duRec.push('durec-channel-record')
		}
	}

	const structure: CompanionPresetSection<ModuleSchema>[] = [
		{
			id: 'stream-deck-plus',
			name: 'Stream Deck + encoders',
			definitions: encoders,
		},
		{
			id: 'channel-controls',
			name: 'Channel controls',
			definitions: channels,
		},
		{
			id: 'control-room',
			name: 'Control Room',
			definitions: controlRoom,
		},
		{
			id: 'sessions',
			name: 'Snapshots and history',
			definitions: sessions,
		},
	]
	if (duRec.length > 0) {
		structure.push({
			id: 'durec',
			name: 'DURec',
			definitions: duRec,
		})
	}

	self.setPresetDefinitions(structure, presets)
}
