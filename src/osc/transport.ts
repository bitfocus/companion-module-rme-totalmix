import dgram from 'node:dgram'
import { decodeOscPacket, encodeOscMessage, type OscArgument, type OscMessage } from './codec.js'

export interface OscTransportOptions {
	host: string
	targetPort: number
	feedbackPort: number
}

export interface OscTransportCallbacks {
	onMessage: (message: OscMessage) => void
	onListening: () => void
	onError: (error: Error) => void
}

export class OscTransport {
	private socket?: dgram.Socket

	constructor(
		private readonly options: OscTransportOptions,
		private readonly callbacks: OscTransportCallbacks,
	) {}

	start(): void {
		this.close()
		const socket = dgram.createSocket('udp4')
		this.socket = socket
		socket.on('message', (packet) => {
			try {
				for (const message of decodeOscPacket(packet)) this.callbacks.onMessage(message)
			} catch (error) {
				this.callbacks.onError(error instanceof Error ? error : new Error(String(error)))
			}
		})
		socket.on('listening', this.callbacks.onListening)
		socket.on('error', this.callbacks.onError)
		socket.bind(this.options.feedbackPort)
	}

	async send(address: string, ...args: OscArgument[]): Promise<void> {
		const socket = this.socket
		if (!socket) throw new Error('OSC transport is not running')
		const packet = encodeOscMessage({ address, args })
		await new Promise<void>((resolve, reject) => {
			socket.send(packet, this.options.targetPort, this.options.host, (error) => (error ? reject(error) : resolve()))
		})
	}

	close(): void {
		const socket = this.socket
		this.socket = undefined
		if (socket) {
			socket.removeAllListeners()
			try {
				socket.close()
			} catch {
				// Already closed.
			}
		}
	}
}
