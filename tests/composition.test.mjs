/**
 * The mixin: what an outer object composed with DynamicProcessor(Base) exposes, and whether the members a
 * subclass reads and writes are the same state the implementation uses.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DynamicProcessor, DynamicProcessorImplementation } from '@beyond-js/dynamic-processor/main';

class Named {
	#name;
	get name() {
		return this.#name;
	}
	constructor(name) {
		this.#name = name;
	}
	describe() {
		return `named ${this.#name}`;
	}
}

test('a base constructor keeps its arguments and its members', async () => {
	class Processor extends DynamicProcessor(Named) {
		get dp() {
			return 'test.named';
		}
	}
	const processor = new Processor('example');
	assert.equal(processor.name, 'example');
	assert.equal(processor.describe(), 'named example');
	await processor.ready;
	assert.equal(processor.processed, true);
	assert.equal(processor instanceof Named, true);
	assert.equal(processor instanceof DynamicProcessorImplementation, false, 'the outer object composes the implementation');
	processor.destroy();
});

test('a Map base composes: FinderCollection-style collections keep Map members and the lifecycle', async () => {
	class Collection extends DynamicProcessor(Map) {
		get dp() {
			return 'test.collection';
		}
		_process() {
			this.set('one', 1);
		}
	}
	const collection = new Collection();
	await collection.ready;
	assert.equal(collection.get('one'), 1);
	assert.equal(collection.size, 1);
	collection.destroy();
});

test('the emitter of the outer object is the emitter its subscribers registered on', () => {
	class Announcing extends DynamicProcessor() {
		get dp() {
			return 'test.announcing';
		}
		announce(event, value) {
			return this._events.emit(event, value);
		}
	}
	const announcing = new Announcing();
	const heard = [];
	announcing.on('own', value => heard.push(value));
	assert.equal(announcing.announce('own', 'delivered'), true);
	assert.deepEqual(heard, ['delivered']);
	assert.equal(announcing.listenerCount('own'), 1);
	announcing.off('own', heard.push);
	announcing.destroy();
});

test('setMaxListeners and removeAllListeners reach the implementation from the outer object', () => {
	class Processor extends DynamicProcessor() {
		get dp() {
			return 'test.listeners';
		}
	}
	const processor = new Processor();
	assert.equal(typeof processor.setMaxListeners, 'function', 'setMaxListeners is forwarded');
	processor.setMaxListeners(7);
	assert.equal(processor._events.getMaxListeners(), 7);
	processor.on('change', () => {});
	processor.removeAllListeners();
	assert.equal(processor.listenerCount('change'), 0);
	processor.destroy();
});

test('notifyOnFirst set on the outer object, as a field or by assignment, is honoured by the implementation', async () => {
	class Field extends DynamicProcessor() {
		get dp() {
			return 'test.notify.field';
		}
		notifyOnFirst = true;
		notified = 0;
		_notify() {
			this.notified++;
		}
	}
	const field = new Field();
	await field.ready;
	assert.equal(field.notified, 1, 'a class field on the subclass is read by the implementation');
	field.destroy();

	class Assigned extends DynamicProcessor() {
		get dp() {
			return 'test.notify.assigned';
		}
		notified = 0;
		_notify() {
			this.notified++;
		}
	}
	const assigned = new Assigned();
	assigned.notifyOnFirst = true;
	await assigned.ready;
	assert.equal(assigned.notified, 1, 'an assignment on the outer object is read by the implementation');
	assigned.destroy();

	const plain = new Assigned();
	await plain.ready;
	assert.equal(plain.notified, 0, 'the default remains false');
	plain.destroy();
});

test('_invalidate survives being detached from its object, and the change payload is the outer object', async () => {
	class Processor extends DynamicProcessor() {
		get dp() {
			return 'test.detached';
		}
		runs = 0;
		_process() {
			this.runs++;
		}
	}
	const processor = new Processor();
	await processor.ready;
	const invalidate = processor._invalidate;
	const payloads = [];
	processor.on('change', payload => payloads.push(payload));
	invalidate();
	await processor.ready;
	assert.equal(processor.runs, 2);
	assert.equal(payloads.length, 1);
	assert.equal(payloads[0], processor, 'the argument of change is the object a subscriber registered on');
	processor.destroy();
});

test('lifecycle hooks of the outer subclass are the ones the implementation calls, in order', async () => {
	const order = [];
	class Hooked extends DynamicProcessor() {
		get dp() {
			return 'test.hooked';
		}
		async _begin() {
			order.push('begin');
		}
		_prepared() {
			order.push('prepared');
		}
		_process() {
			order.push('process');
		}
		_notify() {
			order.push('notify');
		}
	}
	const hooked = new Hooked();
	await hooked.ready;
	hooked._invalidate();
	await hooked.ready;
	assert.deepEqual(order, ['begin', 'prepared', 'process', 'prepared', 'process', 'notify']);
	hooked.destroy();
});

test('a child must expose the lifecycle members the monitor uses, and setup rejects other shapes', () => {
	class Parent extends DynamicProcessor() {
		get dp() {
			return 'test.parent';
		}
	}
	const parent = new Parent();
	assert.throws(() => parent.setup(new Map([['bad', { child: {} }]])), /not a dynamic processor/);
	assert.throws(() => parent.setup(new Map([['bad', undefined]])), /undefined/);
	assert.throws(() => parent.setup({}), /Invalid parameters/);
	parent.destroy();
});
