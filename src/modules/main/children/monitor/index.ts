import type { DynamicProcessorImplementation } from '../../dp';
import type { Children } from '..';
import Controller from './controller';
import Checkpoint from './checkpoint';
import Child from './child';
import log from './logs';

export default class extends Map<DynamicProcessorImplementation, Child> {
	#children: Children;
	#ready: () => void;
	#controller: Controller;

	#checkpoint: Checkpoint;
	get checkpoint() {
		return this.#checkpoint;
	}

	/**
	 * DP Monitor constructor
	 *
	 * @param dp {object} The dynamic processor
	 * @param children {object} The dynamic processor children
	 * @param ready {function} The function to call when the children get ready
	 */
	constructor(dp: DynamicProcessorImplementation, children: Children, ready: () => void) {
		super();

		this.#children = children;
		this.#ready = ready;
		this.#controller = new Controller(dp, this);
		this.#checkpoint = new Checkpoint(this.#children);
	}

	get items(): Set<DynamicProcessorImplementation> {
		const registered = this.#children;
		const { required } = this.#children;

		const children: Set<DynamicProcessorImplementation> = new Set();
		registered.forEach(({ child }) => children.add(child));
		[...required.keys()].forEach(child => children.add(child));

		return children;
	}

	get pending(): DynamicProcessorImplementation[] {
		return [...this.items].filter(child => !child.processed);
	}

	get prepared() {
		let prepared = true;
		this.items.forEach(child => (prepared = prepared && (child.processed || child.destroyed)));
		return prepared;
	}

	/**
	 * Called when the children have changed or when a child has changed
	 * @param child= {object} When the reevaluation is required by a change in a child, useful when debugging
	 */
	#reevaluate = (child?: DynamicProcessorImplementation) => {
		this.#checkpoint.release();
		this.prepared && log(this.#children.dp, child);
		!this.prepared && this.#checkpoint.set();

		// controller.updated means that the children state is the same as it was when the last processing was done,
		// and therefore it is not necessary to reprocess
		if (this.prepared && !this.#controller.updated) {
			this.#controller.update();
			this.#ready();
		}
	};

	/**
	 * Set the child objects to initialise when not previously initialised, and to monitor for changes
	 *
	 * @return {boolean} Has the children collection changed?
	 */
	update() {
		const registered = this.#children;
		const { required } = this.#children;

		const children: Set<DynamicProcessorImplementation> = new Set();
		registered.forEach(({ child }) => children.add(child));
		[...required.keys()].forEach(child => children.add(child));

		let changed = false;

		// Create the children not previously registered
		children.forEach(child => {
			if (this.has(child)) return;

			// mchild is a monitored child that reacts to the 'change' event
			const mchild = new Child(child, this.#reevaluate);
			this.set(child, mchild);
			changed = true;
		});

		// Destroy previously registered children that is not longer used by the processor
		this.forEach(({ child }) => {
			if (children.has(child)) return;

			this.get(child).destroy();
			this.delete(child);
			changed = true;
		});

		/**
		 * Activate the checkpoint again
		 * Happens on reevaluation (calling the prepared method of the dp) and the required children changed
		 */
		changed && !this.prepared && this.#checkpoint.set();

		return changed;
	}

	/**
	 * When the processor indicates in the _prepared method that it is not ready, even when the children are,
	 * it calls this method to report the reason.
	 * This occurs, for example, in cases where the processor detects that one of its children is not synchronized.
	 */
	hang(reason: string) {
		this.#controller.invalidate();
		this.#checkpoint.hang(reason);
	}

	initialise() {
		this.update();
		this.#reevaluate();
	}

	destroy() {
		this.forEach(mchild => mchild.destroy());
	}
}
