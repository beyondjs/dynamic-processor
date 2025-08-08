import type { DynamicProcessorImplementation } from '../../dp';

type ReevaluateType = (child?: DynamicProcessorImplementation) => void;

export default class {
	#child: DynamicProcessorImplementation;
	get child(): DynamicProcessorImplementation {
		return this.#child;
	}

	#reevaluate: ReevaluateType;
	#onchange = () => this.#reevaluate(this.#child);

	constructor(child: DynamicProcessorImplementation, reevaluate: ReevaluateType) {
		this.#child = child;
		this.#reevaluate = reevaluate;

		child.ready; // By calling the ready property, it will launch the initialisation (if not already)
		child.on('change', this.#onchange);
	}

	destroy() {
		this.#child.off('change', this.#onchange);
	}
}
