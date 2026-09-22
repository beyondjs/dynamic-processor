import type { EventEmitter } from 'events';
import { PendingPromise } from '@beyond-js/pending-promise/main';
import { Children, ChildrenType } from './children';
import { ProcessorFailure, identity } from './failure';
import { announce } from './announcer';
import type { Phase } from './failure';
import { Subscriptions } from './subscriptions';
import { registry } from './registry';
import { flags, slow } from './response';
import logs from './logs';

export /*bundle*/ interface IRequest {
	is: 'dynamic-processor';
	value: number;
}

export /*bundle*/ type IProcessResponse = void | boolean | null | { notify?: boolean; changed?: boolean };

export /*bundle*/ type Listener = (...args: any[]) => any;

export /*bundle*/ type RequireType = (dp: DynamicProcessorImplementation, id?: string) => boolean;

let autoincremental = { id: 0, request: 0 };

/**
 * A readiness promise whose rejection is always observed: a failure is delivered to whoever awaits it, and a
 * processor nobody awaits does not end the process with an unhandled rejection
 */
const readiness = () => {
	const promise: PendingPromise<void> = new PendingPromise();
	promise.catch(() => void 0);
	return promise;
};

export /*bundle*/ class DynamicProcessorImplementation {
	get dp(): string {
		throw new Error('Getter .dp must be overriden by the subclass');
	}

	#autoincremented = autoincremental.id++;
	get autoincremented() {
		return this.#autoincremented;
	}

	// Identifies the processor in diagnostics; the autoincremented id unless overridden
	get id(): string {
		return this.autoincremented.toString();
	}

	/**
	 * The object subscribers register on and receive with `change`: the outer object of a mixin, which
	 * redirects this accessor, or the implementation itself when it is subclassed directly
	 */
	get self(): DynamicProcessorImplementation {
		return this;
	}

	// Declared for compatibility and not applied: the lifecycle does not debounce an invalidation
	waitToProcess = 0;

	// Execute _notify method on first processing
	#notifyOnFirst = false;
	get notifyOnFirst() {
		return this.#notifyOnFirst;
	}
	set notifyOnFirst(value: boolean) {
		this.#notifyOnFirst = !!value;
	}

	#children: Children;
	get children() {
		return this.#children;
	}

	/**
	 * Dynamic processor setup
	 *
	 * @param children {ChildrenType} The children to register
	 */
	setup(children: ChildrenType) {
		this.#children.register(children, false);
	}

	// Is a property that is defined only when processing and before initialised
	#ready: PendingPromise<void> | undefined = readiness();
	get ready(): Promise<void> {
		if (this.#processed || this.#destroyed) return Promise.resolve();

		const ready = (this.#ready = this.#ready || readiness());

		// Initialization triggers processing, and promise resolution. A failure is delivered through the
		// readiness promise, which a synchronous failure settles before this getter returns it.
		!this.#initialising && !this.#initialised && this.initialise().catch(() => void 0);
		return ready;
	}

	/**
	 * The failure of the last attempt, until a later attempt begins. A processor that failed is neither
	 * processing nor processed; its `ready` rejected with this failure, and a later `ready` or invalidation
	 * is a new attempt.
	 */
	#error: ProcessorFailure | undefined;
	get error(): ProcessorFailure | undefined {
		return this.#error;
	}

	get failed() {
		return !!this.#error;
	}

	/**
	 * The identity of the processor for a diagnostic, readable even when the `dp` getter itself throws
	 */
	get identity(): { dp: string; id: string } {
		return identity(this);
	}

	/**
	 * The emitter of the events of this processor, reached through a prototype accessor and never held as an
	 * instance field: the mixin forwards prototype members only, and an outer subclass that emits an event of
	 * its own — the finder does — would otherwise read `undefined` here and throw on every emit.
	 */
	readonly #subscriptions = new Subscriptions(this);
	get _events(): EventEmitter {
		return this.#subscriptions.emitter;
	}

	on(event: string, listener: Listener) {
		return this.#subscriptions.on(event, listener);
	}
	off(event: string, listener: Listener) {
		return this.#subscriptions.off(event, listener);
	}
	listenerCount(event: string) {
		return this._events.listenerCount(event);
	}
	removeAllListeners(event?: string) {
		// An explicit undefined would name an event called "undefined" to the Node emitter
		return event === void 0 ? this._events.removeAllListeners() : this._events.removeAllListeners(event);
	}
	setMaxListeners(n: number) {
		return this._events.setMaxListeners(n);
	}

	constructor() {
		registry.add(this);

		this.#children = new Children(this, this.#preprocess);
		this.setMaxListeners(500);
	}

	#initialising = false;
	get initialising() {
		return this.#initialising;
	}

	#initialised = false;
	get initialised() {
		return this.#initialised;
	}

	// This method can be overridden
	async _begin() {}

	/**
	 * Validates the identity, runs `_begin` and starts the children. A failure rejects `ready`, is exposed by
	 * `error`, and leaves the processor uninitialised so that a later `ready` is a new attempt.
	 */
	async initialise() {
		if (this.#destroyed || this.#initialising || this.#initialised) return;
		this.#initialising = true;
		this.#error = void 0;

		try {
			if (typeof this.dp !== 'string' || !this.dp) throw new Error('Getter .dp must return a string');
			await this._begin();
		} catch (exc) {
			this.#initialising = false;
			throw this.#fail('initialise', exc);
		}

		this.#initialising = false;
		if (this.#destroyed) return;
		this.#initialised = true;

		// On children initialisation, and after all child objects are ready, the #preprocess method is called
		this.#children.initialise();
	}

	// The processor is processing, specifically in the preparation phase
	#preparing: boolean;
	get preparing() {
		return this.#preparing;
	}

	_prepared(require: RequireType): boolean | string | undefined | void {
		void require;
		return;
	}

	// Whether the processor is prepared to process; if not, the children call #preprocess again when ready
	get __prepared(): boolean | string {
		this.#preparing = true;
		this.#children.reset();

		// Check if dynamic processor is processed, but also initialise it if it wasn't previously initialised
		const require: RequireType = (dp, id) => {
			this.#children.require(dp, { id });
			return dp.processed;
		};

		try {
			let prepared = this._prepared(require);
			if (typeof prepared === 'string') {
				this.#children.monitor.hang(prepared);
				prepared = false;
			}
			return prepared === void 0 ? true : !!prepared;
		} finally {
			this.#preparing = false;
		}
	}

	#first = true; // Is it the first notification?
	get first() {
		return this.#first;
	}

	// This method should be overridden
	_notify() {}

	#processing = false;
	get processing() {
		return this.#processing;
	}

	#processed = false;
	get processed() {
		return this.#processed;
	}

	// This method should be overridden
	_process(request: IRequest): IProcessResponse | Promise<IProcessResponse> {
		void request;
		return;
	}

	#tu: number;
	get tu() {
		return this.#tu;
	}

	#request: IRequest;
	get _request() {
		return this.#request;
	}

	cancelled(request: IRequest) {
		return this.#request !== request;
	}

	/**
	 * Records the failure of the current attempt, rejects whoever awaits readiness and reports it.
	 * A failure of an attempt that is no longer current is reported but changes nothing.
	 */
	#fail(phase: Phase, cause: unknown, request?: IRequest): ProcessorFailure {
		const { dp, id } = this.identity;
		const failure = new ProcessorFailure(dp, id, phase, cause);
		failure.report();
		if (request && this.#request !== request) return failure;

		this.#processing = false;
		this.#error = failure;

		const ready = this.#ready;
		this.#ready = void 0;
		ready?.reject(failure);
		return failure;
	}

	/**
	 * Called by children when ready or upon a change in any of the children, or upon invalidation
	 */
	#preprocess = () => {
		if (this.#destroyed) return;

		this.#processed = false;
		this.#processing = true;
		this.#error = void 0;

		// From here on, a completion of an earlier attempt is stale, whether or not this attempt gets to
		// allocate a request of its own: an attempt blocked in preparation must not adopt an older result
		this.#request = void 0;

		let prepared: boolean | string;
		try {
			prepared = this.__prepared;
		} catch (exc) {
			this.#fail('prepare', exc);
			return;
		}

		const changed = this.#children.update();
		if (changed) {
			/**
			 * The processor became invalid while preparing, so call preprocess again
			 * In this case __prepared is called again until all children is properly set
			 */
			this.#preprocess();
			return;
		}

		// If not prepared, the children is responsible to call #preprocess again when ready
		if (!prepared || !this.#children.prepared) return;

		const request = (this.#request = { is: 'dynamic-processor', value: autoincremental.request++ });

		const started = Date.now();

		/**
		 * Once process is completed
		 *
		 * @param pr? The process response
		 */
		const done = (pr?: IProcessResponse): void => {
			if (this.#request !== request) return;

			const { changed, notify } = flags(pr);
			this.#tu = Date.now(); // The time updated
			slow(this.dp, started);
			this.#processing = false;
			this.#processed = !this.#destroyed;

			const ready = this.#ready;
			this.#ready = void 0;
			ready?.resolve();

			const first = this.#first;
			this.#first = false;
			announce(this, changed, notify, first);
		};

		// The process response. A thenable is awaited, whether or not it is a native Promise.
		let pr: IProcessResponse | Promise<IProcessResponse>;
		try {
			pr = this._process(request);
		} catch (exc) {
			this.#fail('process', exc, request);
			return;
		}

		if (pr && typeof (<Promise<IProcessResponse>>pr).then === 'function') {
			Promise.resolve(pr).then(done, exc => this.#fail('process', exc, request));
		} else {
			done(<IProcessResponse>pr);
		}
	}

	_invalidate() {
		this.#initialised && !this.#preparing && this.#preprocess();
	}

	#destroyed = false;
	get destroyed() {
		return this.#destroyed;
	}

	/**
	 * Releases the subscriptions to the children and the checkpoint, settles whoever awaits readiness and
	 * announces `change` one last time. Children are not destroyed: whoever created them does that.
	 */
	destroy() {
		if (this.#destroyed) throw new Error('Object is already destroyed');
		this.#request = void 0;
		this.#children.destroy();
		this.#destroyed = true;
		this.#processing = false;
		registry.delete(this);

		// An awaiter of a destroyed processor is released, as `ready` answers for a destroyed one
		const ready = this.#ready;
		this.#ready = void 0;
		ready?.resolve();

		announce(this, true, false, false);
	}
}
