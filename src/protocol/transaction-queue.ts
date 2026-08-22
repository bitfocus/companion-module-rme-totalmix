export class TransactionQueue {
	private tail: Promise<void> = Promise.resolve()

	async run<T>(operation: () => Promise<T>): Promise<T> {
		const result = this.tail.then(operation, operation)
		this.tail = result.then(
			() => undefined,
			() => undefined,
		)
		return result
	}
}
