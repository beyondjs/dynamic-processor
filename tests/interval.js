module.exports = DynamicProcessor =>
	class DynamicInterval extends DynamicProcessor() {
		get dp() {
			return 'dynamic-interval';
		}

		#interval;

		#timer;
		get timer() {
			return this.#timer;
		}

		constructor(interval = 2000) {
			super();
			this.#interval = setInterval(this._invalidate, interval);
		}

		_process() {
			this.#timer = Date.now();
			console.log('Processing at:', this.#timer);
		}

		destroy() {
			console.log('Destroying dynamic interval');

			clearInterval(this.#interval);
			super.destroy();
			console.log('Interval destroyed at', this.#timer);
		}
	};
