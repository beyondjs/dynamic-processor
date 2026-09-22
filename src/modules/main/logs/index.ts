import type { WriteStream } from 'fs';
import * as fs from 'fs';
import { join } from 'path';
import * as colors from 'colors';

const { createWriteStream } = fs;
const { access, unlink, mkdir } = fs.promises;

/**
 * The log of the dynamic processors of this process: slow processing, listener overflow, failures and the
 * checkpoints of processors that wait longer than expected.
 *
 * The file, `.beyond/dps/dp-<pid>-<time>.log` under the working directory of the process, is created the
 * first time something is appended and never at import: a process that never logs creates no directory
 * and holds no descriptor. Messages appended while the file is being opened are kept and written then.
 */
export class Logs {
	#ready = false;
	#opening = false;
	#stream: WriteStream | undefined;
	#error = false;

	#store: string | undefined;
	get store() {
		this.#store = this.#store ?? join(process.cwd(), '.beyond/dps', `dp-${process.pid}-${Date.now()}.log`);
		return this.#store;
	}

	#onerror = (error: Error | undefined) => {
		if (!error) return;

		this.#error = true;
		console.error('Error found writing dynamic processors logs'.red);
	};

	async #open(): Promise<void> {
		const store = this.store;
		const dirname = join(store, '..');

		let exists;
		try {
			await access(store);
			exists = true;
		} catch (exc) {
			exists = false;
		}

		exists ? await unlink(store) : await mkdir(dirname, { recursive: true });

		this.#stream = createWriteStream(store);
		this.#stream.write('Dynamic processors logs:\n\n', this.#onerror);

		this.#unsaved.forEach(message => this.#stream.write(`${message}\n`, this.#onerror));
		this.#unsaved.length = 0;
		this.#ready = true;
	}

	#unsaved: string[] = [];

	append(message: string) {
		if (!this.#ready) {
			this.#unsaved.push(message);
			if (!this.#opening) {
				this.#opening = true;
				this.#open().catch(exc => {
					this.#error = true;
					console.error(`Dynamic processors logs cannot be opened: ${exc.message}`);
				});
			}
			return;
		}

		!this.#error && this.#stream.write(`${message}\n`, this.#onerror);
	}

	/**
	 * Closes the file. A later append opens it again.
	 */
	close() {
		this.#stream?.end();
		this.#stream = void 0;
		this.#ready = false;
		this.#opening = false;
	}
}

export default new Logs();
