/**
 * Helpers shared by the tests of this utility. None of them waits for a length of time: a test awaits an
 * event, a promise it controls or a state it observes, and the runner's timeout bounds the wait.
 */

/** Lets pending callbacks, promise continuations and I/O of the current turn run */
export const tick = () => new Promise(resolve => setImmediate(resolve));

/** A promise the test opens when it decides: `await gate.promise` in a hook, `gate.open()` in the test */
export function gate() {
	let open;
	const promise = new Promise(resolve => (open = resolve));
	return { promise, open };
}

/** Resolves once the condition holds, checking it on every turn of the event loop */
export async function until(condition) {
	while (!condition()) await tick();
}

/** Settles as the promise does, as a value: `{ state: 'fulfilled', value }` or `{ state: 'rejected', error }` */
export const outcome = promise =>
	promise.then(
		value => ({ state: 'fulfilled', value }),
		error => ({ state: 'rejected', error })
	);

/** Records whether a promise has settled, without handling for the caller anything else */
export function watch(promise) {
	const record = { settled: false };
	promise.then(
		() => (record.settled = true),
		() => (record.settled = true)
	);
	return record;
}
