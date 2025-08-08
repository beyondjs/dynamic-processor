import type { DynamicProcessorImplementation } from '../dp';
import Registered from './registered';
import Required from './required';
import Monitor from './monitor';

// A map of children where each child is an instance of a DynamicProcessor
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
		if (this.dp === required) throw new Error('Requiring itself as a required processor');
		this.#required.register(required, data);
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
