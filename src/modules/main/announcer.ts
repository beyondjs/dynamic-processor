import type { DynamicProcessorImplementation } from './dp';
import { identity } from './failure';
import logs from './logs';

/**
 * Announces the completions of a dynamic processor: `change` to the subscribers, `_notify` to the object itself.
 *
 * `change` is emitted when the result changed, on the first completion and on destruction; `_notify` runs
 * when the response asks for it, and not on the first completion unless `notifyOnFirst` is set. An error
 * raised by either is the consumer's: it is reported and does not alter the state the processor recorded.
 */
export class Announcer {
	#processor: DynamicProcessorImplementation;

	constructor(processor: DynamicProcessorImplementation) {
		this.#processor = processor;
	}

	/**
	 * Announces one completion, after the processor recorded it
	 */
	announce(changed: boolean, notify: boolean, first: boolean) {
		const processor = this.#processor;
		const { destroyed } = processor;

		try {
			(changed || destroyed || first) && processor._events.emit('change', processor.self);
		} catch (exc) {
			this.#report('a "change" subscriber', exc);
		}

		if (destroyed || !notify || (first && !processor.notifyOnFirst)) return;
		try {
			const outcome: unknown = processor._notify();
			if (outcome instanceof Promise) outcome.catch(exc => this.#report('_notify', exc));
		} catch (exc) {
			this.#report('_notify', exc);
		}
	}

	/**
	 * Reports an error raised by a subscriber or by a `_notify` hook. The processor's own bookkeeping is
	 * complete by then, so the error is the consumer's and is reported rather than allowed to corrupt the
	 * state of the processor that announced.
	 */
	#report(what: string, error: unknown) {
		const { dp, id } = identity(this.#processor);
		const stack = error instanceof Error ? error.stack : String(error);
		const message = `Dynamic processor "${dp}" (id "${id}"): ${what} threw`;
		logs.append(`${message}\n${stack}\n`);
		console.error(`${message}: ${error instanceof Error ? error.message : String(error)}`);
	}
}
