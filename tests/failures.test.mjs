/**
 * Failures and recovery: a processor whose hooks throw or reject must be observable, must not strand
 * whoever awaits it, and must recover when the cause is gone.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DynamicProcessor } from '@beyond-js/dynamic-processor/main';
import { tick, gate, until, outcome, watch } from './support.mjs';

test('a _begin that rejects rejects ready with the cause, and the next ready tries again', async () => {
	class Failing extends DynamicProcessor() {
		get dp() {
			return 'test.begin';
		}
		fail = true;
		async _begin() {
			if (this.fail) throw new Error('setup failed');
		}
	}
	const failing = new Failing();
	const first = await outcome(failing.ready);
	assert.equal(first.state, 'rejected', 'ready must not stay pending after _begin failed');
	assert.match(first.error.message, /test\.begin/, 'the rejection names the processor');
	assert.equal(first.error.cause?.message, 'setup failed', 'the original cause is preserved');
	assert.equal(failing.error?.cause?.message, 'setup failed', 'the failure is readable on the object');
	assert.equal(failing.initialising, false);
	assert.equal(failing.initialised, false);

	failing.fail = false;
	const second = await outcome(failing.ready);
	assert.equal(second.state, 'fulfilled', 'a later ready is a new attempt');
	assert.equal(failing.processed, true);
	assert.equal(failing.error, undefined, 'a successful attempt clears the failure');
	failing.destroy();
});

test('a missing dp identity rejects ready instead of leaving it pending', async () => {
	class Anonymous extends DynamicProcessor() {}
	const anonymous = new Anonymous();
	const result = await outcome(anonymous.ready);
	assert.equal(result.state, 'rejected');
	assert.match(String(result.error.cause?.message ?? result.error.message), /dp/);
});

test('a _process that throws or rejects rejects ready, resets processing, and recovers on invalidation', async () => {
	class Failing extends DynamicProcessor() {
		get dp() {
			return 'test.process';
		}
		mode = 'throw';
		runs = 0;
		_process() {
			this.runs++;
			if (this.mode === 'throw') throw new Error('sync failure');
			if (this.mode === 'reject') return Promise.reject(new Error('async failure'));
			return true;
		}
	}
	const failing = new Failing();
	const thrown = await outcome(failing.ready);
	assert.equal(thrown.state, 'rejected');
	assert.equal(thrown.error.cause?.message, 'sync failure');
	assert.equal(failing.processing, false, 'processing is not left true after a failure');
	assert.equal(failing.processed, false);

	failing.mode = 'reject';
	failing._invalidate();
	const rejected = await outcome(failing.ready);
	assert.equal(rejected.state, 'rejected');
	assert.equal(rejected.error.cause?.message, 'async failure');

	failing.mode = 'ok';
	failing._invalidate();
	const recovered = await outcome(failing.ready);
	assert.equal(recovered.state, 'fulfilled');
	assert.equal(failing.processed, true);
	assert.equal(failing.error, undefined);
	assert.equal(failing.runs, 3);
	failing.destroy();
});

test('an unobserved failure does not end the process: nobody awaits ready and the rejection is handled', async () => {
	class Failing extends DynamicProcessor() {
		get dp() {
			return 'test.unobserved';
		}
		_process() {
			throw new Error('nobody is waiting');
		}
	}
	const failing = new Failing();
	let unhandled;
	const capture = reason => (unhandled = reason);
	process.once('unhandledRejection', capture);
	failing.ready.catch(() => {}); // the test observes it; the object must not depend on that
	failing.initialise();
	await outcome(failing.ready);
	await tick(); // unhandled rejections are reported after the turn in which the promise rejected
	process.removeListener('unhandledRejection', capture);
	assert.equal(unhandled, undefined, 'the readiness rejection was not unhandled');
	assert.equal(failing.error?.cause?.message, 'nobody is waiting');
	failing.destroy();
});

test('a change subscriber that throws does not break the completion bookkeeping', async () => {
	class Processor extends DynamicProcessor() {
		get dp() {
			return 'test.subscriber';
		}
		notified = 0;
		_notify() {
			this.notified++;
		}
	}
	const processor = new Processor();
	const heard = [];
	processor.on('change', () => {
		heard.push('first');
		throw new Error('a subscriber that throws');
	});
	processor.on('change', () => heard.push('second'));
	await processor.ready;
	assert.equal(processor.processed, true);
	assert.equal(processor.first, false, 'the first-completion flag was cleared although a subscriber threw');
	assert.deepEqual(heard, ['first'], 'Node emitters stop at the throwing subscriber; the throw is reported, not hidden');

	processor._invalidate();
	await processor.ready;
	assert.equal(processor.notified, 1, '_notify still ran on the second completion');
	processor.destroy();
});

test('a _notify that throws or rejects is reported and leaves the processor processed', async () => {
	class Processor extends DynamicProcessor() {
		get dp() {
			return 'test.notify';
		}
		mode = 'throw';
		_notify() {
			if (this.mode === 'throw') throw new Error('notify threw');
			return Promise.reject(new Error('notify rejected'));
		}
	}
	const processor = new Processor();
	await processor.ready;
	processor._invalidate();
	await processor.ready;
	assert.equal(processor.processed, true);
	processor.mode = 'reject';
	let unhandled;
	const capture = reason => (unhandled = reason);
	process.once('unhandledRejection', capture);
	processor._invalidate();
	await processor.ready;
	await tick();
	process.removeListener('unhandledRejection', capture);
	assert.equal(unhandled, undefined, 'an asynchronous _notify failure is observed, not unhandled');
	assert.equal(processor.processed, true);
	processor.destroy();
});

test('a failed child holds its parent, and the parent names it in its checkpoint report', async () => {
	class Child extends DynamicProcessor() {
		get dp() {
			return 'test.failed-child';
		}
		_process() {
			throw new Error('the child cannot process');
		}
	}
	class Parent extends DynamicProcessor() {
		get dp() {
			return 'test.parent';
		}
		child = new Child();
		_prepared(require) {
			return require(this.child, 'child');
		}
	}
	const parent = new Parent();
	const ready = watch(parent.ready);
	const child = await outcome(parent.child.ready);
	assert.equal(child.state, 'rejected', 'the child failed');
	await tick();
	assert.equal(ready.settled, false, 'a parent whose required child failed keeps waiting');
	assert.equal(parent.processed, false);
	const report = parent.children.monitor.checkpoint.report;
	assert.match(report, /test\.failed-child/, 'the report names the child');
	assert.match(report, /the child cannot process/, 'and the cause of its failure');
	parent.destroy();
	parent.child.destroy();
});

test('destroy settles a pending ready, releases the checkpoint and the child subscriptions', async () => {
	class Child extends DynamicProcessor() {
		get dp() {
			return 'test.child';
		}
		_process() {
			return new Promise(() => {}); // never completes
		}
	}
	class Parent extends DynamicProcessor() {
		get dp() {
			return 'test.parent';
		}
		child = new Child();
		_prepared(require) {
			return require(this.child, 'child');
		}
	}
	const parent = new Parent();
	const ready = parent.ready;
	await until(() => parent.children.monitor.checkpoint.pending);
	assert.equal(parent.children.monitor.checkpoint.pending, true, 'the checkpoint is armed while waiting');

	parent.destroy();
	const result = await outcome(ready);
	assert.equal(result.state, 'fulfilled', 'an awaiter of a destroyed processor is released');
	assert.equal(parent.destroyed, true);
	assert.equal(parent.children.monitor.checkpoint.pending, false, 'the checkpoint timer was released');
	assert.equal(parent.child.listenerCount('change'), 0, 'the subscription to the child was released');
	assert.throws(() => parent.destroy(), /already destroyed/);
	parent.child.destroy();
});

test('destruction during _begin does not start the children', async () => {
	let started = false;
	const release = gate();
	const begun = gate();
	class Slow extends DynamicProcessor() {
		get dp() {
			return 'test.slow-begin';
		}
		async _begin() {
			await release.promise;
			begun.open();
		}
		_process() {
			started = true;
		}
	}
	const slow = new Slow();
	const ready = slow.ready;
	slow.destroy();
	assert.equal((await outcome(ready)).state, 'fulfilled', 'destroying releases the awaiter');

	release.open();
	await begun.promise;
	await tick();
	assert.equal(started, false, 'a destroyed processor does not process');
	assert.equal(slow.initialised, false);
});
