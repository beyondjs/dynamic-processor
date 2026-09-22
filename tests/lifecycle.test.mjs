/**
 * The lifecycle of a dynamic processor as a consumer observes it through the public module: readiness,
 * first processing, invalidation, the response flags and stale work.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DynamicProcessor } from '@beyond-js/dynamic-processor/main';
import { tick, gate, Counter } from './support.mjs';

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
