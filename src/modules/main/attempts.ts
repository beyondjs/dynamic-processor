import type { DynamicProcessorImplementation } from './dp';
import type { IRequest, IProcessResponse } from './types';
import type { Phase } from './failure';
import { PendingPromise } from '@beyond-js/pending-promise/main';
import { ProcessorFailure } from './failure';
import { Announcer } from './announcer';
import { flags } from './response';
import logs from './logs';

// The value of the next request, unique across the processors of this process
let requests = 0;

/**
 * A readiness promise whose rejection is always observed: a failure is delivered to whoever awaits it, and a
 * processor nobody awaits does not end the process with an unhandled rejection
 */
const readiness = () => {
	const promise: PendingPromise<void> = new PendingPromise();
	promise.catch((): void => void 0);
	return promise;
};

/**
 * The attempts of a dynamic processor to produce its result, one current attempt at a time.
 *
 * It records what the processor exposes about them (`processing`, `processed`, `first`, `tu`, `error` and the
 * current request) and settles the readiness promise on every path that ends an attempt: a completion resolves
 * it, a failure rejects it with a `ProcessorFailure`, destruction resolves it. A completion of an attempt that
 * is no longer current is dropped.
 */
export class Attempts {
	#processor: DynamicProcessorImplementation;
	#announcer: Announcer;

	#ready: PendingPromise<void> | undefined = readiness();

	/**
	 * The readiness promise of the current attempt, created when none is pending
	 */
	get ready(): Promise<void> {
		this.#ready = this.#ready ?? readiness();
		return this.#ready;
	}

	#processing = false;
	get processing() {
		return this.#processing;
	}

	#processed = false;
	get processed() {
		return this.#processed;
	}

	// Whether the next completion is the first one
	#first = true;
	get first() {
		return this.#first;
	}

	// The time of the last completion
	#tu: number;
	get tu() {
		return this.#tu;
	}

	#error: ProcessorFailure | undefined;
	get error() {
		return this.#error;
	}

	#request: IRequest | undefined;
	get request() {
		return this.#request;
	}

	constructor(processor: DynamicProcessorImplementation) {
		this.#processor = processor;
		this.#announcer = new Announcer(processor);
	}

	/**
	 * Whether a request is no longer the current one: its completion will not be adopted
	 */
	cancelled(request: IRequest) {
		return this.#request !== request;
	}

	/**
	 * Forgets the failure of the last attempt, when a new initialisation begins
	 */
	clear() {
		this.#error = void 0;
	}

	/**
	 * Begins an attempt. From here on, a completion of an earlier attempt is stale, whether or not this attempt
	 * gets to allocate a request of its own: an attempt blocked in preparation must not adopt an older result.
	 */
	begin() {
		this.#processed = false;
		this.#processing = true;
		this.#error = void 0;
		this.#request = void 0;
	}

	/**
	 * Runs `_process` under a new request and adopts its completion while that request is current. A thenable
	 * response is awaited, whether or not it is a native Promise.
	 */
	run() {
		const request: IRequest = (this.#request = { is: 'dynamic-processor', value: requests++ });
		const started = Date.now();
		const done = (pr?: IProcessResponse) => this.#complete(request, started, pr);

		let pr: IProcessResponse | Promise<IProcessResponse>;
		try {
			pr = this.#processor._process(request);
		} catch (exc) {
			this.fail('process', exc, request);
			return;
		}

		if (pr && typeof (<Promise<IProcessResponse>>pr).then === 'function') {
			Promise.resolve(pr).then(done, exc => this.fail('process', exc, request));
		} else {
			done(<IProcessResponse>pr);
		}
	}

	/**
	 * Adopts a completion: the state is recorded and readiness resolved before anything is announced
	 */
	#complete(request: IRequest, started: number, pr: IProcessResponse) {
		if (this.#request !== request) return;

		const { changed, notify } = flags(pr);
		this.#tu = Date.now();
		logs.duration(this.#processor.dp, started);
		this.#processing = false;
		this.#processed = !this.#processor.destroyed;
		this.#settle();

		const first = this.#first;
		this.#first = false;
		this.#announcer.announce(changed, notify, first);
	}

	/**
	 * Records the failure of the current attempt, rejects whoever awaits readiness and reports it.
	 * A failure of an attempt that is no longer current is reported but changes nothing.
	 */
	fail(phase: Phase, cause: unknown, request?: IRequest): ProcessorFailure {
		const { dp, id } = this.#processor.identity;
		const failure = new ProcessorFailure(dp, id, phase, cause);
		failure.report();
		if (request && this.#request !== request) return failure;

		this.#processing = false;
		this.#error = failure;
		this.#settle(failure);
		return failure;
	}

	/**
	 * Resolves the pending readiness, or rejects it with a failure, exactly once
	 */
	#settle(failure?: ProcessorFailure) {
		const ready = this.#ready;
		this.#ready = void 0;
		failure ? ready?.reject(failure) : ready?.resolve();
	}

	/**
	 * Ends the attempts of a destroyed processor: no completion is adopted any more, whoever awaits readiness
	 * is released, as `ready` answers for a destroyed processor, and `change` is announced one last time
	 */
	destroy() {
		this.#request = void 0;
		this.#processing = false;
		this.#settle();
		this.#announcer.announce(true, false, false);
	}
}
