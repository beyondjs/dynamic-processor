/**
 * Resource lifetime: what a processor leaves behind after it is destroyed, and what importing the module
 * costs a process that never logs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { DynamicProcessor } from '@beyond-js/dynamic-processor/main';
import { tick, until } from './support.mjs';


class Leaf extends DynamicProcessor() {
	get dp() {
		return 'test.leaf';
	}
}

class Parent extends DynamicProcessor() {
	get dp() {
		return 'test.parent';
	}
	constructor(child) {
		super();
		this.setup(new Map([['child', { child }]]));
	}
}

/** The loader registrations of this process, without the options Node's runner gives a test file */
const loader = process.execArgv.flatMap((arg, index, all) => (arg === '--import' ? [arg, all[index + 1]] : arg.startsWith('--import=') ? [arg] : []));

test('importing the module creates no log directory until something is logged', t => {
	// A fresh process in a fresh working directory, resolving its installed packages from this one
	const cwd = mkdtempSync(join(tmpdir(), 'beyond-dp-import-'));
	t.after(() => rmSync(cwd, { recursive: true, force: true }));
	symlinkSync(join(process.cwd(), 'node_modules'), join(cwd, 'node_modules'));
	const script = `
		import { DynamicProcessor } from '@beyond-js/dynamic-processor/main';
		class Quiet extends DynamicProcessor() { get dp() { return 'quiet'; } }
		await new Quiet().ready;
	`;
	const result = spawnSync(process.execPath, [...loader, '--input-type=module', '-e', script], { cwd, encoding: 'utf8' });
	assert.equal(result.status, 0, result.stderr);
	assert.equal(existsSync(join(cwd, '.beyond', 'dps')), false, 'a process that never logs creates no log directory');
});

test('repeated creation and destruction leaves no timers and no subscriptions behind', async () => {
	const timers = () => process.getActiveResourcesInfo().filter(kind => kind === 'Timeout').length;
	const before = timers();

	for (let round = 0; round < 500; round++) {
		const child = new Leaf();
		const parent = new Parent(child);
		await parent.ready;
		parent.destroy();
		assert.equal(child.listenerCount('change'), 0);
		child.destroy();
	}
	await tick();
	assert.equal(timers(), before, 'no checkpoint timer survives the destroyed processors');
});

test('a processor held waiting arms one checkpoint timer, and destroying it releases the timer', async () => {
	class Never extends DynamicProcessor() {
		get dp() {
			return 'test.never';
		}
		_process() {
			return new Promise(() => {});
		}
	}
	const child = new Never();
	const parent = new Parent(child);
	parent.ready.catch(() => {});
	const checkpoint = parent.children.monitor.checkpoint;
	await until(() => checkpoint.pending);
	assert.equal(checkpoint.pending, true, 'the waiting parent armed its checkpoint');
	assert.equal(process.getActiveResourcesInfo().includes('Timeout'), false, 'the checkpoint timer does not keep the process alive');
	parent.destroy();
	child.destroy();
	assert.equal(checkpoint.pending, false, 'the timer was released with the parent');
});
