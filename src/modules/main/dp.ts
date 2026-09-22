import type { EventEmitter } from 'events';
import type { ProcessorFailure } from './failure';
import { Children, ChildrenType } from './children';
import { identity } from './failure';
import { Attempts } from './attempts';
import { Subscriptions } from './subscriptions';
import { registry } from './registry';
import type { IRequest, IProcessResponse, Listener, RequireType } from './types';

let autoincremental = 0;

/**
 * The lifecycle of a dynamic processor: initialisation, preparation against the children it registers or
 * requires, processing, invalidation, readiness, announcements and destruction.
 *
 * A subclass defines `dp` and implements the hooks `_begin`, `_prepared`, `_process` and `_notify`. The
 * `DynamicProcessor` mixin composes this implementation into another class and forwards its prototype members,
 * so a member the outer object must expose is a prototype accessor or method, never an instance field.
 */
export /*bundle*/ class DynamicProcessorImplementation {
	get dp(): string {
		throw new Error('Getter .dp must be overriden by the subclass');
	}

	#autoincremented = autoincremental++;
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

	readonly #attempts = new Attempts(this);

	/**
	 * Starts the processor and resolves once its processing completed; resolved at once for a processed or a
	 * destroyed processor. A failure rejects it with a `ProcessorFailure`, and a later `ready` is a new attempt.
	 */
	get ready(): Promise<void> {
		if (this.#attempts.processed || this.#destroyed) return Promise.resolve();

		const ready = this.#attempts.ready;

		// Initialization triggers processing, and promise resolution. A failure is delivered through the
		// readiness promise, which a synchronous failure settles before this getter returns it.
		!this.#initialising && !this.#initialised && this.initialise().catch((): void => void 0);
		return ready;
	}

	/**
	 * The failure of the last attempt, until a later attempt begins. A processor that failed is neither
	 * processing nor processed; its `ready` rejected with this failure, and a later `ready` or invalidation
	 * is a new attempt.
	 */
	get error(): ProcessorFailure | undefined {
		return this.#attempts.error;
	}

	get failed() {
		return !!this.#attempts.error;
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

	/** Subscribes a listener to an event of this processor, `change` among them */
	on(event: string, listener: Listener) {
		return this.#subscriptions.on(event, listener);
	}
	/** Releases a listener of an event of this processor */
	off(event: string, listener: Listener) {
		return this.#subscriptions.off(event, listener);
	}
	/** How many listeners an event of this processor has */
	listenerCount(event: string) {
		return this._events.listenerCount(event);
	}
	/** Releases every listener of an event, or of every event when none is named */
	removeAllListeners(event?: string) {
		// An explicit undefined would name an event called "undefined" to the Node emitter
		return event === void 0 ? this._events.removeAllListeners() : this._events.removeAllListeners(event);
	}
	/** Sets how many listeners an event takes before the overflow is logged; 500 by default */
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
		this.#attempts.clear();

		try {
			if (typeof this.dp !== 'string' || !this.dp) throw new Error('Getter .dp must return a string');
			await this._begin();
		} catch (exc) {
			this.#initialising = false;
			throw this.#attempts.fail('initialise', exc);
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
	get __prepared(): boolean {
		this.#preparing = true;
		try {
			return this.#children.prepare(require => this._prepared(require));
		} finally {
			this.#preparing = false;
		}
	}

	// Whether the next completion is the first one
	get first() {
		return this.#attempts.first;
	}

	// This method should be overridden
	_notify() {}

	get processing() {
		return this.#attempts.processing;
	}

	get processed() {
		return this.#attempts.processed;
	}

	// This method should be overridden
	_process(request: IRequest): IProcessResponse | Promise<IProcessResponse> {
		void request;
		return;
	}

	// The time of the last completion
	get tu() {
		return this.#attempts.tu;
	}

	get _request() {
		return this.#attempts.request;
	}

	/** Whether a request is no longer the current one: an implementation checks it before its own side effects */
	cancelled(request: IRequest) {
		return this.#attempts.cancelled(request);
	}

	/**
	 * Called by children when ready or upon a change in any of the children, or upon invalidation
	 */
	#preprocess = () => {
		if (this.#destroyed) return;
		this.#attempts.begin();

		let prepared: boolean;
		try {
			prepared = this.__prepared;
		} catch (exc) {
			this.#attempts.fail('prepare', exc);
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

		this.#attempts.run();
	};

	/** Starts a new attempt of an initialised processor that is not preparing */
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
		this.#children.destroy();
		this.#destroyed = true;
		registry.delete(this);
		this.#attempts.destroy();
	}
}
