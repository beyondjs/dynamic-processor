const { join } = require('path');

const BEE = require('@beyond-js/bee');
BEE('http://localhost:1110', { inspect: 4000 });

(async () => {
	const { DynamicProcessor } = await bimport('@beyond-js/dynamic-processor/main');
	const DynamicInterval = require('./interval')(DynamicProcessor);

	class Counter extends DynamicProcessor() {
		get dp() {
			return 'dynamic-counter';
		}

		#interval;
		get interval() {
			return this.#interval;
		}

		#counter = 0;
		get counter() {
			return this.#counter;
		}

		constructor() {
			super();
			const interval = (this.#interval = new DynamicInterval(1000));
		}

		_process() {
			super._process();
			this.#counter++;
			console.log(`Counter updated: ${this.#counter}`);
		}

		destroy() {
			super.destroy();
			console.log(`Counter destroyed at: ${this.#counter}`);
		}
	}

	const dp = new Counter();
	await dp.ready;
	console.log('Processor is ready');
	console.log('---');

	dp.on('change', () => console.log(`Event 'change' received at ${dp.counter}. Destroyed: ${dp.destroyed}`));
	setTimeout(() => {
		console.log('Destroying interval processor');
		dp.interval.destroy();
	}, 5000);

	setTimeout(() => {
		console.log('Destroying counter');
		dp.destroy();
	}, 8000);
})().catch(exc => console.error(exc.stack));
