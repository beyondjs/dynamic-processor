import type { DynamicProcessorInstance } from '..';
import validateChild from './validate-child';

export default /*bundle*/ class extends Map<DynamicProcessorInstance, { id: string }> {
	/**
	 * The pendings are registered when the check(dp) function is called in the _prepared method
	 * If the processor that is being requested is not processed, then it is registered as a pending dp
	 *
	 * @param required {object} The required dp
	 * @param data {{id: string}} Information provided when the check function is called
	 */
	register(required: DynamicProcessorInstance, data: { id: string }) {
		validateChild(required);
		this.set(required, data);
	}

	reset() {
		super.clear();
	}
}
