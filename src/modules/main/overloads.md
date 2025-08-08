# DynamicProcessor mixin and why overloads are required

This note explains what the DynamicProcessor mixin does, why it uses TypeScript overloads, and how those overloads
preserve good type inference when the Base class is optional.

If you are comfortable with classes in TypeScript but have not worked much with mixins or overloads, this guide is for
you.

## What is this mixin

DynamicProcessor is a mixin factory. You call it with an optional Base class, and it returns a new class that extends
that base and adds a contract requiring a dp getter.

## Examples

```ts
// With a Base class class MyBase { constructor(public name: string) {} } const MyProcessor = DynamicProcessor(MyBase);
// MyProcessor should accept the same constructor parameters as MyBase

// Without a Base class const MyProcessorNoBase = DynamicProcessor(); // MyProcessorNoBase has a parameterless constructor
```

The goal is to keep the original constructor parameters and instance type from Base when you pass one, while still
supporting the no Base case with a simple default.

## The problem when Base is optional

Inside the factory it is natural to write

```ts
const ActualBase = Base ?? EmptyBase;
```

This reads as “use EmptyBase when no Base is provided.” The issue is that ActualBase now has a union type

```ts
TBase | typeof EmptyBase;
```

When you later extends ActualBase, the compiler can no longer infer the correct constructor parameters nor the precise
instance type for the branch where a real Base was provided. From TypeScript’s perspective it only sees a union of two
unrelated constructors. That breaks the nice inference you want when calling DynamicProcessor(MyBase) and trying to pass
through MyBase’s constructor arguments.

In short

1. Base is optional
2. Base ?? EmptyBase produces a union
3. Extending a union hides the specific constructor shape TypeScript needs to preserve

## The solution: overloads

We solve this by giving the factory two overload signatures 1. A signature for the call that provides a Base This
version returns a constructor whose parameters match ConstructorParameters<TBase> and whose instance is
InstanceType<TBase> plus the dp member. 2. A signature for the call without a Base This version returns a simple
parameterless constructor with only the dp member.

With overloads, the compiler chooses the correct signature at each call site. That way it knows exactly which
constructor shape to expect and preserves it.

Overloads used

```ts
export const DynamicProcessor: {
	// With Base provided
	<TBase extends Constructor>(Base: TBase): new (...args: ConstructorParameters<TBase>) => InstanceType<TBase> & {
		readonly dp: string;
	};

	// Without Base
	(): new () => { readonly dp: string };
} = ((Base?: Constructor) => {
	const ActualBase = Base ?? EmptyBase;

	return class extends (ActualBase as Constructor) {
		get dp(): string {
			// Must be overridden by subclasses
			throw new Error('Getter .dp must be implemented by the subclass');
		}
	};
}) as any;
```

### Key idea

The implementation keeps using Base ?? EmptyBase for runtime behavior, but the overloads in the type declaration give
the checker a precise view of what the function returns in each scenario. That avoids the union problem and preserves
constructor and instance types when a Base is passed.

### Before and after

Before, without overloads

```ts
const DP = (Base?: Constructor) => {
	const ActualBase = Base ?? EmptyBase;
	return class extends ActualBase {};
};

class A {
	constructor(public id: number) {}
}

const M = DP(A);
new M(123); // often not type checked properly, may degrade to any
```

After, with overloads

```ts
const M = DynamicProcessor(A);
new M(123); // ok, constructor parameters preserved
new M('x'); // type error, as desired
```

## About the dp getter

In TypeScript’s type system, the type of a getter is indistinguishable from a read only property. There is no way to
force “must be a getter” at the type level. To ensure a real getter is implemented, we keep a default get dp() in the
mixin that throws. Subclasses must override it or they will fail at runtime. This achieves the intended requirement
despite the type system limitation.

Takeaways 1. Optional Base plus Base ?? EmptyBase creates a union that hides the constructor and instance types you want
to preserve 2. Overloads give the compiler two separate views. One for the call that supplies a Base and one for the
call that does not 3. The runtime keeps using the nullish coalescing pattern, while the type layer remains precise and
ergonomic for both use cases

That is why these overloads are required.
