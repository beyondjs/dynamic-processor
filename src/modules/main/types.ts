import type { DynamicProcessorImplementation } from './dp';

/**
 * The request of one processing attempt, given to `_process`; `cancelled(request)` tells whether it is still
 * the current one
 */
export /*bundle*/ interface IRequest {
	is: 'dynamic-processor';
	value: number;
}

/**
 * What `_process` answers: a boolean, null or nothing sets both `changed` and `notify`, an object sets each
 * one, and a flag that is not given is true
 */
export /*bundle*/ type IProcessResponse = void | boolean | null | { notify?: boolean; changed?: boolean };

/**
 * A subscriber of an event of a dynamic processor
 */
export /*bundle*/ type Listener = (...args: any[]) => any;

/**
 * The function `_prepared` receives: it requires another processor and answers whether it is processed
 */
export /*bundle*/ type RequireType = (dp: DynamicProcessorImplementation, id?: string) => boolean;
