export type OscArgument = number | string | boolean

export interface OscMessage {
	address: string
	args: OscArgument[]
}

function padding(length: number): number {
	return (4 - (length % 4)) % 4
}

function encodeString(value: string): Buffer {
	const text = Buffer.from(value, 'utf8')
	const length = text.length + 1
	return Buffer.concat([text, Buffer.alloc(1 + padding(length))])
}

export function encodeOscMessage(message: OscMessage): Buffer {
	const tags: string[] = []
	const values: Buffer[] = []
	for (const arg of message.args) {
		if (typeof arg === 'string') {
			tags.push('s')
			values.push(encodeString(arg))
		} else if (typeof arg === 'boolean') {
			tags.push(arg ? 'T' : 'F')
		} else {
			// TotalMix documents and expects numeric command data as OSC float32,
			// including selectors and toggles that happen to contain whole numbers.
			tags.push('f')
			const value = Buffer.alloc(4)
			value.writeFloatBE(arg)
			values.push(value)
		}
	}
	return Buffer.concat([encodeString(message.address), encodeString(`,${tags.join('')}`), ...values])
}

function readString(buffer: Buffer, offset: number): { value: string; next: number } {
	const end = buffer.indexOf(0, offset)
	if (end < 0) throw new Error('Invalid OSC string')
	const consumed = end - offset + 1
	return { value: buffer.toString('utf8', offset, end), next: end + 1 + padding(consumed) }
}

function decodeMessage(buffer: Buffer, offset = 0, limit = buffer.length): OscMessage {
	const address = readString(buffer, offset)
	const tagString = readString(buffer, address.next)
	if (!address.value.startsWith('/') || !tagString.value.startsWith(',')) throw new Error('Invalid OSC message')

	let cursor = tagString.next
	const args: OscArgument[] = []
	for (const tag of tagString.value.slice(1)) {
		if (cursor > limit) throw new Error('OSC message exceeds packet')
		switch (tag) {
			case 'i':
				args.push(buffer.readInt32BE(cursor))
				cursor += 4
				break
			case 'f':
				args.push(buffer.readFloatBE(cursor))
				cursor += 4
				break
			case 's': {
				const value = readString(buffer, cursor)
				args.push(value.value)
				cursor = value.next
				break
			}
			case 'T':
				args.push(true)
				break
			case 'F':
				args.push(false)
				break
			default:
				throw new Error(`Unsupported OSC type tag: ${tag}`)
		}
	}
	return { address: address.value, args }
}

export function decodeOscPacket(buffer: Buffer): OscMessage[] {
	const first = readString(buffer, 0)
	if (first.value !== '#bundle') return [decodeMessage(buffer)]

	const messages: OscMessage[] = []
	let cursor = first.next + 8 // OSC timetag
	while (cursor + 4 <= buffer.length) {
		const size = buffer.readInt32BE(cursor)
		cursor += 4
		if (size <= 0 || cursor + size > buffer.length) throw new Error('Invalid OSC bundle element')
		messages.push(...decodeOscPacket(buffer.subarray(cursor, cursor + size)))
		cursor += size
	}
	return messages
}
