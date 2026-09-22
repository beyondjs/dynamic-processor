import type { IProcessResponse } from './types';

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
