import { EventEmitter } from 'events';
import { PendingPromise } from '@beyond-js/pending-promise/main';
import { Children, ChildrenType } from './children';
import logs from './logs';

// A generic Constructor type to represent any class constructor
type Constructor<T = {}> = new (...args: any[]) => T;

// A default base class in case no Base is provided
const Nothing = class {};

// Get the class returned by the factory
type DynamicProcessorType = ReturnType<typeof DynamicProcessor>;

// Get the instance type of the dynamically created class
export type DynamicProcessorInstance = InstanceType<DynamicProcessorType>;

export /*bundle*/ type IProcessResponse = void | boolean | { notify?: boolean; changed?: boolean };

type Listener = (...args: any[]) => any;

let autoincremental = { id: 0, request: 0 };

// A registry of all Dynamic Processors created across the instance of the engine
const registry: Set<DynamicProcessorInstance> = new Set();

export /*bundle*/ type RequireType = (dp: DynamicProcessorInstance, id: string) => boolean;

export interface IRequest {
	is: 'dynamic-processor';
	value: number;
}

/**
 * DynamicProcessor is a base class for creating dynamic processors.
 * It provides a structure for managing child processors, handling events,
 * and processing data in a dynamic way.
 *
 * @param Base {object} - The base class to extend from. Defaults to Nothing if not provided.
 */
export /*bundle*/ const DynamicProcessor = <TBase extends Constructor>(Base: TBase = Nothing as TBase) =>
	class DynamicProcessor extends Base {
		get dp(): string {
			throw new Error('Getter .dp must return a string');
		}

		#autoincremented = autoincremental.id++;
		get autoincremented() {
			return this.#autoincremented;
		}

		// This method can be overridden
		// It should return a string that identifies the dynamic processor
		// If not overridden, it will return the autoincremented id
		// This is useful for debugging purposes and to identify the dynamic processor in the registry
		get id(): string {
			return this.autoincremented.toString();
		}

		// ms to wait to process after invalidation
		waitToProcess = 0;
		// Execute _notify method on first processing
		notifyOnFirst = false;

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
		#ready: PendingPromise<void> = new PendingPromise();
		get ready() {
			if (this.#processed || this.#destroyed) return Promise.resolve();

			this.#ready = this.#ready || new PendingPromise();

			// Initialization triggers processing, and promise resolution
			!this.#initialising && !this.#initialised && this.initialise().catch(exc => console.error(exc.stack));
			return this.#ready;
		}

		_events = new EventEmitter();
		on = (event: string, listener: Listener) => {
			// To find if a dynamic processor hasn't set the maxListeners correctly
			const count = this._events.listenerCount(event);
			const max = this._events.getMaxListeners();

			if (max === count) {
				const message = `Max. listeners (${max}) achieved on dp "${this.dp}" - with id: "${this.id}"`;
				logs.append(message);
				console.log(`${message}.\nCheck the logs: ${logs.store}\n`);

				const consumers = (() => {
					let consumers = '';
					let count = 0;
					registry.forEach(consumer => {
						const { items: requiring } = consumer.children.monitor;
						if (!requiring.has(this)) return;

						const { dp, id } = consumer;
						consumers += `\t* [${++count}] - dp "${dp}" - with id: "${id}"\n`;
					});
					return consumers;
				})();
				logs.append(consumers);
			}

			this._events.on(event, listener);
		};
		off = (event: string, listener: Listener) => this._events.off(event, listener);
		removeALlListeners = () => this._events.removeAllListeners();
		setMaxListeners = (n: number) => this._events.setMaxListeners(n);

		constructor(...params: any[]) {
			super(...params);
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

		async initialise() {
			if (typeof this.dp !== 'string' || !this.dp) throw new Error('Getter .dp must return a string');

			if (this.#destroyed || this.#initialising || this.#initialised) return;
			this.#initialising = true;

			await this._begin();

			this.#initialising = false;
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

		// Is the processor prepared to process?
		// If not prepared, the promise will be kept pending, and will be processed at the next invalidation.
		get __prepared(): boolean | string {
			this.#preparing = true;
			this.#children.reset();

			// Check if dynamic processor is processed, but also initialise it if it wasn't previously initialised
			const require: RequireType = (dp, id) => {
				this.#children.require(dp, { id });
				return dp.processed;
			};

			let prepared = this._prepared(require);
			if (typeof prepared === 'string') {
				this.#children.monitor.hang(prepared);
				prepared = false;
			}
			prepared = prepared === void 0 ? true : !!prepared;

			this.#preparing = false;
			return prepared;
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
		 * Called by children when ready or upon a change in any of the children, or upon invalidation
		 */
		#preprocess = () => {
			if (this.#destroyed) return;

			this.#processed = false;
			this.#processing = true;

			const prepared = this.__prepared;
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

			const performance = {
				now: Date.now(),
				check: () => {
					const ms = Date.now() - performance.now;
					ms > 2000 && logs.append(`"${this.dp}" took ${ms} ms. to process`);
				}
			};

			/**
			 * Once process is completed
			 *
			 * @param pr? The process response
			 */
			const done = (pr?: IProcessResponse): void => {
				if (this.#request !== request) return;

				pr = typeof pr === 'object' ? pr : { notify: <boolean>pr, changed: !!pr };
				pr.notify = pr.notify === void 0 ? true : !!pr.notify;
				pr.changed = pr.changed === void 0 ? true : !!pr.changed;

				this.#tu = Date.now(); // The time updated
				performance.check();
				this.#processing = false;
				this.#processed = !this.#destroyed;

				const ready = this.#ready;
				this.#ready = void 0;
				ready?.resolve();

				const { changed, notify } = pr;
				(changed || this.#destroyed || this.#first) && this._events.emit('change', this);
				!this.#destroyed && notify && (!this.#first || this.notifyOnFirst) && this._notify();
				this.#first = false;
			};

			// The process response
			const pr = this._process(request);
			pr instanceof Promise ? pr.then(done).catch(exc => console.error(exc.stack)) : done(pr);
		};

		_invalidate = () => {
			this.#initialised && !this.#preparing && this.#preprocess();
		};

		#destroyed = false;
		get destroyed() {
			return this.#destroyed;
		}

		destroy() {
			if (this.#destroyed) throw new Error('Object is already destroyed');
			this.#request = void 0;
			this.#children.destroy();
			this.#destroyed = true;
			registry.delete(this);

			this._events.emit('change', this);
		}
	};
