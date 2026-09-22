import type { Children } from '..';
import * as colors from 'colors';
import logs from '../../logs';

/**
 * The checkpoint of a processor that is waiting: when the children it needs, or its own preparation, keep it
 * from processing longer than expected, the reason is written to the log of the dynamic processors, naming
 * what it waits for and what has failed.
 */
export default class {
	#children: Children;
	#timer: NodeJS.Timeout | undefined;
	#delay: number;
	#logs;

	/**
	 * The reason why the _prepared method is blocking the processing of the dp
	 * @type Undefined | string
	 */
	#onhold: string | undefined;

	constructor(children: Children, delay?: number) {
		this.#children = children;
		this.#delay = delay ? delay : 5000;

		// The logger is the default export of its module. Requiring the module and calling `append` on its
		// namespace threw from the timer of this checkpoint, ending the process whenever a processor was slow.
		this.#logs = logs;
	}

	/**
	 * Whether the checkpoint is armed, which is the case while the processor waits
	 */
	get pending() {
		return !!this.#timer;
	}

	/**
	 * What the processor is waiting for, as the checkpoint would log it: the reason it is held, and each
	 * pending child with its state, including the failure of a child that failed
	 */
	get report(): string {
		const children = this.#children;
		const { dp } = children;

		let id = dp.id ? `: ${dp.id}` : '';
		id = `${dp.dp}${id}`;

		const lines = [`Dynamic processor "${id}" is taking more than expected.` + (dp.initialising ? ' Processor is still initialising.' : '')];
		this.#onhold && lines.push(`\tBlocked by the following reason: ${this.#onhold}`);

		const { pending } = children;
		pending.length && lines.push('\tWaiting for:');
		pending.forEach(child => {
			const state = (() => {
				if (child.error) return `failed: ${child.error.message}`;
				if (!child.initialised) return 'not initialised';
				return child.processed ? 'already processed' : 'not processed';
			})();
			lines.push(`\t\t* ${child.dp}${child.id ? `: ${child.id}` : ''}: ${state}`);
		});
		return lines.join('\n');
	}

	#checkpoint = () => {
		this.#timer = void 0;
		const report = this.report;
		this.#logs.append(`${report.split('\n')[0].red}\n${report.split('\n').slice(1).join('\n')}\n`);
	};

	#arm() {
		this.#timer && clearTimeout(this.#timer);
		this.#timer = setTimeout(this.#checkpoint, this.#delay);

		// A waiting processor must not keep a process alive on its own
		this.#timer.unref?.();
	}

	hang(reason?: string) {
		this.#onhold = reason ? reason : 'not specified';
		this.#arm();
	}

	set() {
		this.#arm();
	}

	release() {
		this.#timer && clearTimeout(this.#timer);
		this.#timer = this.#onhold = void 0;
	}
}
