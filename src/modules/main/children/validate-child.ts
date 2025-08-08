import type { DynamicProcessorImplementation } from '../dp';

/**
 * Validates that the given child conforms to the expected DynamicProcessor shape.
 *
 * @param child - The object to validate as a dynamic processor.
 * @param name - Optional name for contextual error messages.
 * @throws Will throw if the child is invalid or misconfigured.
 */
export default function (child: DynamicProcessorImplementation, name?: string) {
	if (name && typeof name !== 'string') throw new Error('Invalid child name specification');

	const nameText = name ? `"${name}" ` : '';

	const error = 'Invalid dynamic processor children specification.';
	if (!child) {
		throw new Error(`${error} Child property ${nameText}is undefined`);
	}
	if (typeof child.on !== 'function' || typeof child.initialise !== 'function') {
		throw new Error(`${error} Child property ${nameText}is not a dynamic processor`);
	}
	if (!child.dp) {
		throw new Error(`${error} Child ${nameText}must have the property .dp set`);
	}
}
