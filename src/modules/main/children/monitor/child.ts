import type { DynamicProcessorInstance } from '../..';

type ReevaluateType = (child?: DynamicProcessorInstance) => void;

export default class {
	#child: DynamicProcessorInstance;
	get child() {
		return this.#child;
	}

	#reevaluate: ReevaluateType;
	#onchange = () => this.#reevaluate(this.#child);

	constructor(child: DynamicProcessorInstance, reevaluate: ReevaluateType) {
		this.#child = child;
		this.#reevaluate = reevaluate;

		child.ready; // By calling the ready property, it will launch the initialisation (if not already)
		child.on('change', this.#onchange);
	}

	destroy() {
		this.#child.off('change', this.#onchange);
	}
}
