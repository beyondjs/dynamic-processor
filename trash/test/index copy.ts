// A generic Constructor type to represent any class constructor
type Constructor<T = object> = new (...args: any[]) => T;

// A default base class in case no Base is provided
class EmptyBase {}

/**
 * DynamicProcessor is a mixin factory.
 * If a Base is provided, it preserves the Base constructor parameters and instance type.
 * If no Base is provided, it defaults to an empty constructor.
 *
 * @param Base Constructor to extend from. Defaults to an empty base if not provided.
 */
export /*bundle*/ const DynamicProcessor: {
	// See overloads.md for an explanation of why these overloads are required

	// Overload #1 — When a Base class is provided
	<TBase extends Constructor>(Base: TBase): new (...args: ConstructorParameters<TBase>) => InstanceType<TBase>;

	// Overload #2 — When no Base class is provided
	(): new () => typeof DynamicProcessor;
} = ((Base?: Constructor) => {
	const ActualBase = Base ?? EmptyBase;

	return class DynamicProcessor extends (ActualBase as Constructor) {
		get dp(): string {
			// Must be overridden by subclasses
			throw new Error('Getter .dp must return a string');
		}
	};
}) as any;
