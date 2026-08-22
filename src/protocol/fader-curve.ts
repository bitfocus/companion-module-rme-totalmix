const FADER_STEPS = 1023

export function normalizedToDb(value: number): number {
	const normalized = clampNormalized(value)
	const position = normalized * FADER_STEPS
	if (position >= 649) return position * 0.0320855615 - 26.8235294118
	return position * position * (-1 / 11033) + position * 0.1497326203 - 65
}

export function dbToNormalized(db: number): number {
	if (db <= -65) return 0
	if (db >= 6) return 1
	const clamped = Math.max(-65, Math.min(6, db))
	const position = clamped >= -6 ? (clamped + 26.8235294118) / 0.0320855615 : 826 - Math.sqrt(-34869 - 11033 * clamped)
	return clampNormalized(position / FADER_STEPS)
}

export function clampNormalized(value: number): number {
	return Math.max(0, Math.min(1, value))
}

export function formatDb(value: number): string {
	if (value <= -65) return '-∞ dB'
	return `${value.toFixed(1)} dB`
}
