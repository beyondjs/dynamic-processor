import type { DynamicProcessorImplementation } from './dp';
import { identity, report } from './failure';

/**
 * Announces a completion: `change` to the subscribers, `_notify` to the object itself.
 *
 * `change` is emitted when the result changed, on the first completion and on destruction; `_notify` runs
 * when the response asks for it, and not on the first completion unless `notifyOnFirst` is set. An error
 * raised by either is the consumer's: it is reported and does not alter the state the processor recorded.
 */
export function announce(processor: DynamicProcessorImplementation, changed: boolean, notify: boolean, first: boolean) {
	const { dp, id } = identity(processor);
	const { destroyed } = processor;

	try {
		(changed || destroyed || first) && processor._events.emit('change', processor.self);
	} catch (exc) {
		report(dp, id, 'a "change" subscriber', exc);
	}

	if (destroyed || !notify || (first && !processor.notifyOnFirst)) return;
	try {
		const outcome: unknown = processor._notify();
		if (outcome instanceof Promise) outcome.catch(exc => report(dp, id, '_notify', exc));
	} catch (exc) {
		report(dp, id, '_notify', exc);
	}
}
