# Context chunk isolation guard

The front build gate that stops one React context from being minted twice in the client bundle.
See issue #1011 for the bug class: when a module (typically a TanStack route file) survives in more
than one client chunk, each copy that executes `createContext(...)` produces its own context
object, and a provider in one chunk no longer matches a consumer in another.

## How it works

- `apps/front/scripts/check-context-chunk-isolation.mjs` is a Vite plugin
  (`publy:context-chunk-isolation`) wired in `apps/front/vite.config.ts`. It runs for client
  builds only.
- At `buildStart` it loads the real `apps/front/tsconfig.json` TypeScript program and finds every
  declaration whose type is assignable to React's `Context<…>` — the declared type's own symbol,
  a type alias of it, or an interface whose heritage chain reaches `Context<…>` (a branded
  subtype such as `interface StrictContext<T> extends Context<T>`). It keys off the **type of the
  declared binding**, not the callee: a context minted through a helper such as
  `createStrictContext` in another module is still discovered even when the helper declares a
  branded return type, because the binding's type resolves through its heritage chain to
  `Context<…>`. A heritage reference that does not resolve is not treated as reaching
  `Context<…>` — an unresolvable base types as `any`, and `any` is not evidence of a context.
- A binding is tracked only when its initializer contains a call. `const Ctx = createContext(null)`
  and `const Ctx = createStrictContext(null)` are tracked; `const Ctx = RealContext` is an alias
  of a context that is tracked in the file that minted it, so the alias file demands nothing.
- The same call gate applies to destructured bindings: `const { probe: Ctx } =
makeContexts()` is a mint in the consuming file and is inventoried under `Ctx`; a destructure
  whose initializer has no call (`const { RealContext } = holder`) is an alias and is not.
- A context minted into an unbound position — an `export default`, an object property value, or
  an array element — is inventoried under the literal name `<anonymous context>`, whether it is
  minted directly or through a factory.
- The discovered contexts are checked against the checked-in inventory
  (`apps/front/scripts/context-chunk-isolation.inventory.mjs`). Any mismatch fails the build.
- At `generateBundle` it inspects the rendered client chunks. For every inventory context it
  decides, per rendered copy of the source module, whether that copy actually mints the context
  (as opposed to merely referencing it), and fails the build when minting copies land in more
  than one chunk — or when a single chunk contains two minting copies.

## The inventory is a hand-maintained, build-blocking list

`contextChunkIsolationInventory` in `apps/front/scripts/context-chunk-isolation.inventory.mjs`
lists every React context that ships in the client bundle:

```js
export const contextChunkIsolationInventory = [
	{ name: 'AuthBrandContext', sourceFile: 'src/lib/auth-brand-context.tsx' },
];
```

- `name` is the source binding name of the context (for example `AuthBrandContext`), and
  `sourceFile` is its path relative to `apps/front`.
- Adding, renaming, moving, or deleting a React context **breaks `pnpm --filter front build`**
  until this file is updated. The error message tells you which context is missing from which
  side; edit the inventory to match.
- A context that is not directly bound to a variable — an `export default`, an object property
  value, or an array element — is inventoried under the literal name `<anonymous context>`.

## Fail-closed corners

The guard deliberately throws instead of passing when it cannot classify rendered code:

- A rendered context binding whose initializer callee it cannot recognize (for example a
  factory call after bundler transforms) — including when the bundler deconflicted the binding
  name with a `$1` suffix (`ProbeContext$1`), and when the binding is a destructuring pattern
  (`const { probe: ProbeContext } = makeContexts(null)`).
- A rendered factory call in a holder position (object property value, array element, export
  default) that survives with an unrecognized callee in a file owning an `<anonymous context>`
  entry — but only when the callee is one the source scan attributed to that file's holder
  mint. Holder-position calls whose callee was not attributed (TanStack's own
  `component: lazyRouteComponent(…)` split shim, for example) are calls whose value is not
  known to be a context, and are not counted as mints.
- An unrecognized query-module family derived from a context source file (new TanStack sibling
  transforms must be added to the curated allowlist first).
- Rendered code it cannot parse or inspect.

## What the scan deliberately does not track

The type-based scan only discovers **minting shapes**: a binding or holder position whose
initializer contains a call, whose value's type resolves to `Context<…>`. A value that merely
references an existing context never mints, so no inventory entry is demanded for it. This
includes:

- `const Ctx = RealContext;` (a local alias of an imported context)
- `const { RealContext } = holder;` (destructuring a context out of a holder that does not call)
- `const Ctx = list[0];` (an indexed context value)
- `for (const Ctx of list)` (iterating context values)
- `export const AliasOfRealContext = RealContext;` (a module-level alias)
- `static Ctx = RealContext;` (a class field aliasing a context)

The context itself is tracked in the file that minted it, so these shapes add no coverage gap;
they only skip an entry that would be inert in the chunk analysis. Earlier rounds of this guard
discovered them and demanded inventory entries in consumer files — that false-red surface is
closed by design.

## Known limitations

- A context binding typed `any` or `unknown`, or a `let` binding assigned after declaration, is
  invisible to the type-based scan. Type your contexts as their real type.
- A context whose declared type is a fully structural annotation (an object type shaped like
  `Context<…>` but not naming it or extending it) is invisible to the type scan; a direct
  `createContext` initializer is still caught by the callee fallback.
- A context minted into a comma-chain holder value (`{ p: (0, factory()) }`) or minted inside a
  function body or return position (`loader: () => factory()`) is invisible to both the type
  scan and the rendered analysis. A factory call in an argument position is discovered when its
  result is bound or held (the enclosing binding or holder is typed), and when the result is
  discarded nothing can consume the duplicate, so neither form is a real coverage gap.
- A context that is tree-shaken out of a particular build configuration (for example one behind
  a feature flag that the e2e image disables) fails the build with `is not present in a client
chunk`. No current context is flag-gated; if one ever is, the e2e/release build asymmetry must
  be resolved before the gate will pass both.
- The guard runs once per client build. The isolated TypeScript scan takes roughly 2–4 seconds
  on a development machine (measured median ~1.9 s on the reference machine, 1.8–1.9 s across
  six runs; earlier rounds measured 3–6 s under load before the factory-value walk was removed).
  Whole-build A/B comparisons are useless because machine noise swamps the delta. It is not
  free; the scan is the cost of type-based discovery.
