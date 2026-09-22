import type { DynamicProcessorImplementation, Listener } from './dp';
import { EventEmitter } from 'events';
import { registry } from './registry';
import logs from './logs';

/**
 * The subscriptions of a dynamic processor: one Node emitter, owned by the implementation and reached from
 * the outer object of a mixin through the `_events` accessor of the prototype.
 *
 * Subscribing reports an emitter that reached its maximum, naming the processors that require this one, so
 * that a processor that is required by too many others is found in the log instead of in a Node warning.
 */
export class Subscriptions {
	#dp: DynamicProcessorImplementation;

	#emitter = new EventEmitter();
	get emitter() {
		return this.#emitter;
	}

	constructor(dp: DynamicProcessorImplementation) {
		this.#dp = dp;
	}

	on(event: string, listener: Listener) {
		const count = this.#emitter.listenerCount(event);
		const max = this.#emitter.getMaxListeners();
		max === count && this.#overflow(max);
		return this.#emitter.on(event, listener);
	}

	off(event: string, listener: Listener) {
		return this.#emitter.off(event, listener);
	}

	#overflow(max: number) {
		const dp = this.#dp;
		const message = `Max. listeners (${max}) achieved on dp "${dp.dp}" - with id: "${dp.id}"`;
		logs.append(message);
		console.log(`${message}.\nCheck the logs: ${logs.store}\n`);

		let consumers = '';
		let count = 0;
		registry.forEach(consumer => {
			const { items: requiring } = consumer.children.monitor;
			if (!requiring.has(dp) && !requiring.has(dp.self)) return;
			consumers += `\t* [${++count}] - dp "${consumer.dp}" - with id: "${consumer.id}"\n`;
		});
		logs.append(consumers);
	}
}
