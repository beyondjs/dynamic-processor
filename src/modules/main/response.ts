import type { IProcessResponse } from './dp';
import logs from './logs';

/**
 * What a processing response means: a boolean, null or undefined sets both flags, an object sets each one,
 * and a flag that is not given defaults to true
 */
export function flags(pr: IProcessResponse): { changed: boolean; notify: boolean } {
	const given = pr && typeof pr === 'object' ? pr : { notify: pr, changed: pr };
	return {
		notify: given.notify === void 0 ? true : !!given.notify,
		changed: given.changed === void 0 ? true : !!given.changed
	};
}

/**
 * Records a processing that took longer than two seconds
 */
export function slow(dp: string, started: number) {
	const ms = Date.now() - started;
	ms > 2000 && logs.append(`"${dp}" took ${ms} ms. to process`);
}
