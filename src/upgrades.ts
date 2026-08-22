import type {
	CompanionMigrationAction,
	CompanionMigrationFeedback,
	CompanionStaticUpgradeScript,
} from '@companion-module/base'
import type { ModuleConfig } from './config.js'

const legacyFaderActions: Record<string, { actionId: 'set_fader' | 'adjust_fader'; targetType: 'submix' | 'output' }> =
	{
		set_submix_fader: { actionId: 'set_fader', targetType: 'submix' },
		adjust_submix_fader: { actionId: 'adjust_fader', targetType: 'submix' },
		set_output_fader: { actionId: 'set_fader', targetType: 'output' },
		adjust_output_fader: { actionId: 'adjust_fader', targetType: 'output' },
	}

const migrateFaderActions: CompanionStaticUpgradeScript<ModuleConfig> = (_context, props) => {
	const updatedActions: CompanionMigrationAction[] = []
	for (const action of props.actions) {
		const migration = legacyFaderActions[action.actionId]
		if (!migration) continue
		action.actionId = migration.actionId
		action.options.targetType = { isExpression: false, value: migration.targetType }
		action.options.source ??= { isExpression: false, value: 'input:0' }
		updatedActions.push(action)
	}
	return {
		updatedConfig: null,
		updatedSecrets: null,
		updatedActions,
		updatedFeedbacks: [],
	}
}

const migrateFaderRows: CompanionStaticUpgradeScript<ModuleConfig> = (_context, props) => {
	const updatedActions: CompanionMigrationAction[] = []
	for (const action of props.actions) {
		if ((action.actionId !== 'set_fader' && action.actionId !== 'adjust_fader') || action.options.row) continue

		const targetType = action.options.targetType?.value
		const sourceValue = action.options.source?.value
		const encodedSource = typeof sourceValue === 'string' ? sourceValue : 'input:0'
		const sourceMatch = /^(input|playback):(\d+)$/.exec(encodedSource)
		const row = targetType === 'output' ? 'output' : (sourceMatch?.[1] ?? 'input')

		action.options.row = { isExpression: false, value: row }
		if (row === 'output') {
			action.options.output ??= { isExpression: false, value: 0 }
		} else {
			const sourceOptionId = row === 'playback' ? 'playbackSource' : 'inputSource'
			action.options[sourceOptionId] = { isExpression: false, value: Number(sourceMatch?.[2] ?? 0) }
			action.options.destination = action.options.output ?? { isExpression: false, value: 0 }
			delete action.options.output
		}
		delete action.options.targetType
		delete action.options.source
		updatedActions.push(action)
	}
	return {
		updatedConfig: null,
		updatedSecrets: null,
		updatedActions,
		updatedFeedbacks: [],
	}
}

const migratePresetTargetMode: CompanionStaticUpgradeScript<ModuleConfig> = (_context, props) => {
	const updatedActions: CompanionMigrationAction[] = []
	for (const action of props.actions) {
		if (action.options.target?.isExpression !== true || action.options.target.value !== '$(local:target)') continue
		action.options.presetTargetMode = { isExpression: false, value: true }
		updatedActions.push(action)
	}

	const updatedFeedbacks: CompanionMigrationFeedback[] = []
	for (const feedback of props.feedbacks) {
		if (feedback.options.target?.isExpression !== true || feedback.options.target.value !== '$(local:target)') continue
		feedback.options.presetTargetMode = { isExpression: false, value: true }
		updatedFeedbacks.push(feedback)
	}

	return {
		updatedConfig: null,
		updatedSecrets: null,
		updatedActions,
		updatedFeedbacks,
	}
}

const targetBoundActionMigrations: Record<string, { actionId: string; optionKeys: string[] }> = {
	adjust_fader: { actionId: 'preset_adjust_fader', optionKeys: ['target', 'unit', 'amount'] },
	adjust_pan: { actionId: 'preset_adjust_pan', optionKeys: ['target', 'amount'] },
	set_pan: { actionId: 'preset_set_pan', optionKeys: ['target', 'value'] },
	set_mute: { actionId: 'preset_set_mute', optionKeys: ['target', 'operation'] },
	adjust_input_gain: { actionId: 'preset_adjust_input_gain', optionKeys: ['target', 'amount'] },
	set_autoset: { actionId: 'preset_set_autoset', optionKeys: ['target', 'operation'] },
}

const targetBoundFeedbackMigrations: Record<
	string,
	{ feedbackId: string; typeKey: 'valueType' | 'stateType'; typeValue: string }
> = {
	channel_name: { feedbackId: 'preset_value', typeKey: 'valueType', typeValue: 'channel_name' },
	channel_name_gauge: { feedbackId: 'preset_value', typeKey: 'valueType', typeValue: 'channel_name_gauge' },
	fader_value: { feedbackId: 'preset_value', typeKey: 'valueType', typeValue: 'fader_db' },
	input_gain_value: { feedbackId: 'preset_value', typeKey: 'valueType', typeValue: 'gain' },
	input_gain_normalized: { feedbackId: 'preset_value', typeKey: 'valueType', typeValue: 'gain_normalized' },
	pan_value: { feedbackId: 'preset_value', typeKey: 'valueType', typeValue: 'pan' },
	pan_display_value: { feedbackId: 'preset_value', typeKey: 'valueType', typeValue: 'pan_display' },
	mute_state: { feedbackId: 'preset_state', typeKey: 'stateType', typeValue: 'mute' },
	autoset_state: { feedbackId: 'preset_state', typeKey: 'stateType', typeValue: 'autoset' },
	pan_centered: { feedbackId: 'preset_state', typeKey: 'stateType', typeValue: 'pan_centered' },
}

function localTargetBinding(options: CompanionMigrationAction['options']): boolean {
	return options.target?.isExpression === true && options.target.value === '$(local:target)'
}

const migrateEncoderPresetBindings: CompanionStaticUpgradeScript<ModuleConfig> = (_context, props) => {
	const updatedActions: CompanionMigrationAction[] = []
	for (const action of props.actions) {
		const migration = targetBoundActionMigrations[action.actionId]
		if (!migration || !localTargetBinding(action.options)) continue
		const options = Object.fromEntries(
			migration.optionKeys.flatMap((key) => (action.options[key] === undefined ? [] : [[key, action.options[key]]])),
		)
		action.actionId = migration.actionId
		action.options = options
		updatedActions.push(action)
	}

	const updatedFeedbacks: CompanionMigrationFeedback[] = []
	for (const feedback of props.feedbacks) {
		const migration = targetBoundFeedbackMigrations[feedback.feedbackId]
		if (!migration || !localTargetBinding(feedback.options)) continue
		feedback.feedbackId = migration.feedbackId
		feedback.options = {
			target: feedback.options.target,
			[migration.typeKey]: { isExpression: false, value: migration.typeValue },
		}
		updatedFeedbacks.push(feedback)
	}

	return {
		updatedConfig: null,
		updatedSecrets: null,
		updatedActions,
		updatedFeedbacks,
	}
}

export const UpgradeScripts: CompanionStaticUpgradeScript<ModuleConfig>[] = [
	migrateFaderActions,
	migrateFaderRows,
	migratePresetTargetMode,
	migrateEncoderPresetBindings,
]
