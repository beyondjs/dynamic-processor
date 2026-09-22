/**
 * The lifecycle of a dynamic processor as a consumer observes it through the public module: readiness,
 * first processing, invalidation, the response flags, registered and required children, and stale work.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DynamicProcessor } from '@beyond-js/dynamic-processor/main';
import { tick, gate } from './support.mjs';

class Counter extends DynamicProcessor() {
	get dp() {
		return 'test.counter';
	}
	runs = 0;
	notified = 0;
	response = void 0;
	_process() {
		this.runs++;
		return this.response;
	}
	_notify() {
		this.notified++;
	}
}

test('ready starts initialisation and resolves once the first processing completed', async () => {
	const counter = new Counter();
	assert.equal(counter.initialised, false);
	assert.equal(counter.processed, false);

	await counter.ready;
	assert.equal(counter.initialised, true);
	assert.equal(counter.processed, true);
	assert.equal(counter.runs, 1);
	assert.equal(counter.first, false, 'the first completion has passed');
	assert.equal(typeof counter.tu, 'number');
	counter.destroy();
});

test('subscribing alone starts nothing; the first completion emits change and skips _notify', async () => {
	const counter = new Counter();
	const changes = [];
	counter.on('change', () => changes.push(counter.processed));
	await tick();
	assert.equal(counter.initialised, false, 'a subscription does not start the processor');

	await counter.ready;
	assert.deepEqual(changes, [true], 'change is emitted for the first completion, after processed is set');
	assert.equal(counter.notified, 0, '_notify is skipped on the first completion by default');
	counter.destroy();
});

test('an invalidation reprocesses and announces; unchanged results announce nothing', async () => {
	const counter = new Counter();
	await counter.ready;
	let changes = 0;
	counter.on('change', () => changes++);

	counter._invalidate();
	await counter.ready;
	assert.equal(counter.runs, 2);
	assert.equal(changes, 1, 'a changed result is announced');
	assert.equal(counter.notified, 1, '_notify runs after the first completion');

	counter.response = { changed: false, notify: false };
	counter._invalidate();
	await counter.ready;
	assert.equal(counter.runs, 3);
	assert.equal(changes, 1, 'an unchanged result is not announced');
	assert.equal(counter.notified, 1, 'and does not notify');

	counter.response = false;
	counter._invalidate();
	await counter.ready;
	assert.equal(changes, 1, 'a false response means neither changed nor notify');
	counter.destroy();
});

test('a null response is treated like false rather than throwing', async () => {
	const counter = new Counter();
	counter.response = null;
	await counter.ready;
	assert.equal(counter.processed, true);
	counter.destroy();
});

test('an asynchronous _process is awaited, and a thenable that is not a native Promise is awaited too', async () => {
	class Slow extends DynamicProcessor() {
		get dp() {
			return 'test.slow';
		}
		value = 0;
		async _process() {
			await tick();
			this.value = 1;
		}
	}
	const slow = new Slow();
	await slow.ready;
	assert.equal(slow.value, 1);
	slow.destroy();

	class Thenable extends DynamicProcessor() {
		get dp() {
			return 'test.thenable';
		}
		value = 0;
		_process() {
			return { then: resolve => setImmediate(() => ((this.value = 2), resolve())) };
		}
	}
	const thenable = new Thenable();
	await thenable.ready;
	assert.equal(thenable.value, 2, 'the thenable was awaited before the completion was adopted');
	thenable.destroy();
});

test('invalidation during an asynchronous processing drops the older completion', async () => {
	class Racing extends DynamicProcessor() {
		get dp() {
			return 'test.racing';
		}
		gates = [gate(), gate()];
		entered = [gate(), gate()];
		finished = [gate(), gate()];
		attempts = 0;
		completed = [];
		async _process(request) {
			const attempt = this.attempts++;
			this.entered[attempt].open();
			await this.gates[attempt].promise;
			const cancelled = this.cancelled(request);
			if (!cancelled) this.completed.push(attempt);
			this.finished[attempt].open();
			if (cancelled) return false;
		}
	}
	const racing = new Racing();
	const first = racing.ready;
	await racing.entered[0].promise;

	racing._invalidate();
	await racing.entered[1].promise;
	racing.gates[1].open();
	await first;
	assert.deepEqual(racing.completed, [1], 'the newest attempt published its result');

	racing.gates[0].open();
	await racing.finished[0].promise;
	assert.deepEqual(racing.completed, [1], 'the older attempt, completing last, published nothing');
	assert.equal(racing.processed, true);
	racing.destroy();
});

test('a completion of an attempt that was invalidated while preparation blocked is not adopted', async () => {
	// The parent processes with a slow asynchronous body. While it runs, the child it requires is invalidated
	// and the parent with it, so the parent's re-preparation blocks on the child and allocates no request.
	// The slow body then completes: it belongs to the attempt that was invalidated and must not be published.
	class Child extends DynamicProcessor() {
		get dp() {
			return 'test.child';
		}
		release;
		_process() {
			return this.release ?? Promise.resolve();
		}
	}
	class Parent extends DynamicProcessor() {
		get dp() {
			return 'test.parent';
		}
		child;
		published = [];
		attempts = 0;
		entered = gate();
		body = gate();
		finished = gate();
		_prepared(require) {
			return require(this.child, 'child');
		}
		async _process(request) {
			const attempt = ++this.attempts;
			if (attempt === 1) {
				this.entered.open();
				await this.body.promise;
			}
			const cancelled = this.cancelled(request);
			if (!cancelled) this.published.push(attempt);
			if (attempt === 1) this.finished.open();
			if (cancelled) return false;
		}
	}

	const child = new Child();
	const parent = new Parent();
	parent.child = child;

	const ready = parent.ready;
	await parent.entered.promise;

	// The child is invalidated and blocks; the parent is invalidated and waits for it with no current request
	const blocked = gate();
	child.release = blocked.promise;
	child._invalidate();
	parent._invalidate();
	assert.equal(parent._request, undefined, 'a blocked attempt leaves no request current');

	// The first attempt of the parent completes while its preparation is blocked
	parent.body.open();
	await parent.finished.promise;
	assert.deepEqual(parent.published, [], 'the completion of the invalidated attempt was not published');
	assert.equal(parent.processed, false);

	blocked.open();
	await ready;
	assert.deepEqual(parent.published, [2], 'the attempt that followed the child is the one published');
	parent.destroy();
	child.destroy();
});

test('registered children are watched: a child change reprocesses the parent, and unregistering releases it', async () => {
	const child = new Counter();
	class Parent extends DynamicProcessor() {
		get dp() {
			return 'test.parent';
		}
		runs = 0;
		constructor() {
			super();
			this.setup(new Map([['child', { child }]]));
		}
		_process() {
			this.runs++;
		}
	}
	const parent = new Parent();
	await parent.ready;
	assert.equal(child.processed, true, 'a registered child is initialised by its parent');
	assert.equal(parent.runs, 1);
	assert.equal(child.listenerCount('change'), 1, 'the parent subscribes once to the child');

	child._invalidate();
	await child.ready;
	await tick();
	assert.equal(parent.runs, 2, 'the change of the child reprocessed the parent');

	parent.children.unregister(['child']);
	await parent.ready;
	await tick();
	assert.equal(child.listenerCount('change'), 0, 'the parent released its subscription to the removed child');
	assert.equal(child.destroyed, false, 'removing a child from a parent does not destroy it');

	parent.destroy();
	child.destroy();
});

test('required children discovered in _prepared are waited for; a string reason holds the processor', async () => {
	class Dependency extends DynamicProcessor() {
		get dp() {
			return 'test.dependency';
		}
		release = gate();
		entered = gate();
		_process() {
			this.entered.open();
			return this.release.promise;
		}
	}
	class Consumer extends DynamicProcessor() {
		get dp() {
			return 'test.consumer';
		}
		dependency;
		hold = false;
		held = gate();
		runs = 0;
		_prepared(require) {
			if (!require(this.dependency, 'dependency')) return false;
			if (!this.hold) return;
			this.held.open();
			return 'held by the test';
		}
		_process() {
			this.runs++;
		}
	}
	const dependency = new Dependency();
	const consumer = new Consumer();
	consumer.dependency = dependency;

	const ready = consumer.ready;
	await dependency.entered.promise;
	assert.equal(consumer.runs, 0, 'the consumer waits for its required dependency');
	assert.deepEqual(consumer.children.pending.map(child => child.dp), ['test.dependency']);

	dependency.release.open();
	await ready;
	assert.equal(consumer.runs, 1);

	consumer.hold = true;
	consumer._invalidate();
	await consumer.held.promise;
	await tick();
	assert.equal(consumer.processed, false, 'a string from _prepared holds the processor');
	assert.equal(consumer.runs, 1);

	consumer.hold = false;
	consumer._invalidate();
	await consumer.ready;
	assert.equal(consumer.runs, 2);

	consumer.destroy();
	dependency.destroy();
});

test('two parents sharing a child are both reprocessed once per child change', async () => {
	const child = new Counter();
	const parents = [0, 1].map(index => {
		class Parent extends DynamicProcessor() {
			get dp() {
				return `test.parent.${index}`;
			}
			runs = 0;
			_prepared(require) {
				return require(child);
			}
			_process() {
				this.runs++;
			}
		}
		return new Parent();
	});
	await Promise.all(parents.map(parent => parent.ready));
	child._invalidate();
	await child.ready;
	await tick();
	assert.deepEqual(parents.map(parent => parent.runs), [2, 2]);
	parents.forEach(parent => parent.destroy());
	child.destroy();
});
