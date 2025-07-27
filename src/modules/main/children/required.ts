import type { DynamicProcessorInstance } from '..';
import type { Children } from '.';

export default /*bundle*/ class extends Map<DynamicProcessorInstance, { id: string }> {
	/**
	 * The pendings are registered when the check(dp) function is called in the _prepared method
	 * If the processor that is being requested is not processed, then it is registered as a pending dp
	 *
	 * @param child {object} The required dp
	 * @param data {{id: string}} Information provided when the check function is called
	 */
	register(child: DynamicProcessorInstance, data: { id: string }) {
		require('./validate-child')(child);
		this.set(child, data);
	}

	reset() {
		super.clear();
	}
}
