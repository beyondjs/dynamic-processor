import logs from './logs';

/**
 * The phases of the lifecycle in which a processor can fail
 */
export type Phase = 'initialise' | 'prepare' | 'process' | 'notify';

/**
 * A failure of a dynamic processor, named after the processor and the phase it failed in, with the original
 * error as its cause.
 *
 * It is what a consumer awaiting `ready` receives and what `error` exposes on the object, so the identity of
 * the processor and the phase travel with the cause instead of being lost in a log line.
 */
export class ProcessorFailure extends Error {
	#phase: Phase;
	get phase() {
		return this.#phase;
	}

	constructor(dp: string, id: string, phase: Phase, cause: unknown) {
		const reason = cause instanceof Error ? cause.message : String(cause);
		super(`Dynamic processor "${dp}" (id "${id}") failed while ${phase}: ${reason}`, { cause });
		this.name = 'ProcessorFailure';
		this.#phase = phase;
	}

	/**
	 * Reports the failure: one line on the console, so that a processor nobody awaits is not silent, and the
	 * complete stack in the log of the dynamic processors
	 */
	report() {
		const stack = this.cause instanceof Error ? this.cause.stack : String(this.cause);
		logs.append(`${this.message}\n${stack}\n`);
		console.error(`${this.message}. Check the logs: ${logs.store}`);
	}
}

/**
 * Reports an error raised by a subscriber or by a `_notify` hook. The processor's own bookkeeping is
 * complete by then, so the error is the consumer's and is reported rather than allowed to corrupt the
 * state of the processor that announced.
 */
export function report(dp: string, id: string, what: string, error: unknown) {
	const stack = error instanceof Error ? error.stack : String(error);
	const message = `Dynamic processor "${dp}" (id "${id}"): ${what} threw`;
	logs.append(`${message}\n${stack}\n`);
	console.error(`${message}: ${error instanceof Error ? error.message : String(error)}`);
}

/**
 * The identity of a processor for a diagnostic, readable even when its `dp` getter throws, which is the case
 * of a subclass that did not define it
 */
export function identity(processor: { dp: string; id: string; autoincremented: number }): { dp: string; id: string } {
	let dp: string;
	let id: string;
	try {
		dp = processor.dp;
	} catch {
		dp = '<no dp>';
	}
	try {
		id = processor.id;
	} catch {
		id = processor.autoincremented.toString();
	}
	return { dp, id };
}
