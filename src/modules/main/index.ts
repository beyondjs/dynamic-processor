import { DynamicProcessorImplementation } from './dp';

// A generic Constructor type to represent any class constructor
type Constructor<T = object> = new (...args: any[]) => T;

// A default base class in case no Base is provided
class EmptyBase {}

// Instance surface of the dynamic processor implementation.
// Using the instance type means you do not need to update overloads
// when you add new public members to DynamicProcessorImplementation.
type DPInstance = InstanceType<typeof DynamicProcessorImplementation>;

/**
 * DynamicProcessor is a mixin factory.
 *
 * Overloads keep constructor params and instance type when a Base is provided,
 * and expose the dynamic processor surface in both cases.
 * See overloads.md for why these overloads are required.
 */
export /*bundle*/ const DynamicProcessor: {
	// With Base: preserve Base ctor and add DP instance surface
	<TBase extends Constructor>(Base: TBase): new (...args: ConstructorParameters<TBase>) => InstanceType<TBase> &
		DPInstance;

	// Without Base: just the DP instance surface
	(): new () => DPInstance;
} = ((Base?: Constructor) => {
	const ActualBase = Base ?? EmptyBase;

	// Use a Symbol to store the implementation instance.
	// This lets us forward from prototype wrappers without using private fields.
	const slot = Symbol('dp');

	class DynamicProcessorMixin extends (ActualBase as Constructor) {
		[slot]: DPInstance;

		_invalidate!: () => void;

		constructor(...args: any[]) {
			super(...args);
			this[slot] = new DynamicProcessorImplementation();

			// _invalidate is assigned here (instead of being a prototype method) so it can be used
			// as a standalone function without losing its context, e.g.:
			// const fn = dp._invalidate; fn();
			this._invalidate = () => this[slot]._invalidate();

			/**
			 * Hooks: Redirect selected members on the internal DP instance to the outer object,
			 * so when DynamicProcessorImplementation calls them (e.g., this.dp or this._process),
			 * it actually executes the overrides defined in the outer subclass.
			 */

			// Hook getters so internal calls like `this.dp` and `this.id` reach outer overrides.
			Object.defineProperty(this[slot], 'dp', {
				configurable: true,
				get: () => (this as any).dp
			});

			Object.defineProperty(this[slot], 'id', {
				configurable: true,
				get: () => (this as any).id
			});

			// Hook polymorphic methods so internal calls delegate to the outer instance.
			(this[slot] as any)._begin = (...a: any[]) => (this as any)._begin?.(...a);
			(this[slot] as any)._prepared = (require: any) => (this as any)._prepared?.(require);
			(this[slot] as any)._process = (req: any) => (this as any)._process?.(req);
			(this[slot] as any)._notify = (...a: any[]) => (this as any)._notify?.(...a);
		}
	}

	// Forward all public members from DynamicProcessorImplementation.prototype
	// to DynamicProcessorMixin.prototype by defining wrappers.
	//
	// Notes
	// 1. We skip "constructor".
	// 2. Accessors are forwarded by calling their getter or setter with "this[slot]".
	// 3. Methods are forwarded by applying on "this[slot]".
	// 4. Private fields (with "#") are not on the prototype, so nothing to do.
	const proto = DynamicProcessorImplementation.prototype;
	for (const name of Object.getOwnPropertyNames(proto)) {
		if (name === 'constructor') continue;

		// Do not override if already defined on the mixin prototype.
		if (DynamicProcessorMixin.prototype.hasOwnProperty(name)) continue;

		// Get the property descriptor from the implementation prototype.
		const desc = Object.getOwnPropertyDescriptor(proto, name)!;

		// We cannot mix accessor keys (get/set) with data descriptor keys (value/writable) in the same property descriptor.
		// Doing so will throw: "Invalid property descriptor. Cannot both specify accessors and a value or writable attribute".
		if (desc.get || desc.set) {
			// Accessor descriptor: only define get/set
			Object.defineProperty(DynamicProcessorMixin.prototype, name, {
				configurable: true,
				enumerable: desc.enumerable,
				get: desc.get
					? function (this: any) {
							return desc.get!.call(this[slot]);
					  }
					: undefined,
				set: desc.set
					? function (this: any, v: any) {
							return desc.set!.call(this[slot], v);
					  }
					: undefined
			});
		} else {
			// Data descriptor: only define value/writable
			Object.defineProperty(DynamicProcessorMixin.prototype, name, {
				configurable: true,
				enumerable: desc.enumerable,
				writable: desc.writable,
				value:
					typeof desc.value === 'function'
						? function (this: any, ...args: any[]) {
								return desc.value!.apply(this[slot], args);
						  }
						: desc.value
			});
		}
	}

	// Cast is needed because the implementation body cannot express both overloads directly.
	return DynamicProcessorMixin as any;
}) as any;
