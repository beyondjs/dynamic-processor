/**
 * The children of a dynamic processor as a consumer observes them through the public module: registered
 * children, required children and hold reasons, and a child shared by two parents.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DynamicProcessor } from '@beyond-js/dynamic-processor/main';
import { tick, gate, Counter } from './support.mjs';

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
