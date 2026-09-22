import type { DynamicProcessorImplementation } from '../dp';
import type { RequireType } from '../types';
import Registered from './registered';
import Required from './required';
import Monitor from './monitor';

/**
 * The children a processor registers with `setup`, by name: each entry holds a dynamic processor
 */
export /*bundle*/ type ChildrenType = Map<string, { child: DynamicProcessorImplementation }>;

export class Children extends Registered {
	readonly #required: Required;
	get required(): Required {
		return this.#required;
	}

	readonly #monitor: Monitor;
	get monitor(): Monitor {
		return this.#monitor;
	}

	get pending(): DynamicProcessorImplementation[] {
		return this.#monitor.pending;
	}

	/**
	 * DP Children constructor
	 *
	 * @param dp {object} The parent dynamic processor
	 * @param ready {function} The function to call when the children get ready
	 */
	constructor(dp: DynamicProcessorImplementation, ready: () => void) {
		super(dp);
		this.#required = new Required();
		this.#monitor = new Monitor(dp, this, ready);
	}

	/**
	 * The pendings are registered when the check(dp) function is called in the _prepared method
	 * If the processor that is being requested is not processed, then it is registered as a pending dp
	 *
	 * @param required {DynamicProcessorImplementation} The pending dp
	 * @param data {{id: string}} Information provided when the check function is called
	 */
	require(required: DynamicProcessorImplementation, data: { id: string }) {
		if (this.dp === required || this.dp.self === required) throw new Error('Requiring itself as a required processor');
		this.#required.register(required, data);
	}

	reset(): void {
		return this.#required.reset();
	}

	/**
	 * Runs the preparation hook of the parent against these children: the required children are collected
	 * again, a processor the hook requires is registered and answers whether it is processed, and a string
	 * answer is a reason that holds the parent, reported by the monitor
	 *
	 * @returns Whether the parent is prepared to process
	 */
	prepare(hook: (require: RequireType) => boolean | string | undefined | void): boolean {
		this.reset();

		// Requiring a processor also initialises it if it was not initialised before
		const require: RequireType = (dp, id) => {
			this.require(dp, { id });
			return dp.processed;
		};

		const prepared = hook(require);
		if (typeof prepared !== 'string') return prepared === void 0 ? true : !!prepared;

		this.#monitor.hang(prepared);
		return false;
	}

	get prepared() {
		return this.#monitor.prepared;
	}

	initialise(): void {
		this.#monitor.initialise();
	}

	update(): boolean {
		return this.#monitor.update();
	}

	destroy(): void {
		this.#monitor.destroy();
	}
}
