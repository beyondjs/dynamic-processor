import type { WriteStream } from 'fs';
import * as fs from 'fs';
import { join } from 'path';
import * as colors from 'colors';

const { createWriteStream } = fs;
const { access, unlink, mkdir } = fs.promises;

let incremental = 0;

export default new (class {
	#ready = false;
	#stream!: WriteStream;
	#error = false;

	#store!: string;
	get store() {
		return this.#store;
	}

	#onerror = (error: Error | undefined) => {
		if (!error) return;

		this.#error = true;
		console.error('Error found writing dynamic processors logs'.red);
	};

	async #initialise(): Promise<void> {
		const name = `dp-${process.pid}-${incremental++}.log`;
		const dirname = join(process.cwd(), '.beyond/dps');
		const store = (this.#store = join(dirname, name));

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

		this.#unsaved.forEach(message => this.#stream.write(message, this.#onerror));
		this.#unsaved.length = 0;
		this.#ready = true;
	}

	constructor() {
		this.#initialise().catch(exc => console.log(exc.stack));
	}

	#unsaved: string[] = [];

	append(message: string) {
		if (!this.#ready) {
			this.#unsaved.push(message);
			return;
		}

		!this.#error && this.#stream.write(`${message}\n`, this.#onerror);
	}
})();
