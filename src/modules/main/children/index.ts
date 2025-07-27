import type { DynamicProcessorInstance } from '..';
import Registered from './registered';
import Required from './required';
import Monitor from './monitor';

// A map of children where each child is an instance of a DynamicProcessor
export type ChildrenType = Map<string, { child: DynamicProcessorInstance }>;

export class Children extends Registered {
	readonly #required: Required;
	get required() {
		return this.#required;
	}

	readonly #monitor: Monitor;
	get monitor() {
		return this.#monitor;
	}

	get pending() {
		return this.#monitor.pending;
	}

	/**
	 * DP Children constructor
	 *
	 * @param dp {object} The parent dynamic processor
	 * @param ready {function} The function to call when the children get ready
	 */
	constructor(dp: DynamicProcessorInstance, ready: () => void) {
		super(dp);
		this.#required = new Required();
		this.#monitor = new Monitor(dp, this, ready);
	}

	/**
	 * The pendings are registered when the check(dp) function is called in the _prepared method
	 * If the processor that is being requested is not processed, then it is registered as a pending dp
	 *
	 * @param child {DynamicProcessorInstance} The pending dp
	 * @param data {{id: string}} Information provided when the check function is called
	 */
	require(child: DynamicProcessorInstance, data: { id: string }) {
		if (this.dp === child) throw new Error('Requiring itself as a child processor');
		this.#required.register(child, data);
	}

	reset(): void {
		return this.#required.reset();
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
