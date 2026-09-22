import type { DynamicProcessorImplementation } from './dp';

/**
 * Every dynamic processor of this process that has not been destroyed. It exists for diagnostics: when a
 * processor's emitter overflows, the processors that require it are listed from here.
 */
export const registry: Set<DynamicProcessorImplementation> = new Set();
