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
  declaration whose type resolves to React's `Context<…>`. It keys off the **type of the declared
  binding**, not the callee: a context minted through a helper such as `createStrictContext` in
  another module is still discovered, because the binding's type is still `Context<…>`.
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
- A context that is not directly bound to a variable (for example `export default
  createContext(null)`) is inventoried under the literal name `<anonymous context>`.
- A mention of the `createContext` function itself without a call (for example
  `const makeContext = React.createContext;`) is inventoried under
  `<React.createContext factory value>`; those entries are exempt from the chunk-presence
  requirement.

## Fail-closed corners

The guard deliberately throws instead of passing when it cannot classify rendered code:

- A rendered context binding whose initializer callee it cannot recognize (for example a
  factory call after bundler transforms) — including when the bundler deconflicted the binding
  name with a `$1` suffix (`ProbeContext$1`).
- An unrecognized query-module family derived from a context source file (new TanStack sibling
  transforms must be added to the curated allowlist first).
- Rendered code it cannot parse or inspect.

## Known limitations

- A context binding typed `any` or `unknown`, or a `let` binding assigned after declaration, is
  invisible to the type-based scan. Type your contexts as their real type.
- A context that is tree-shaken out of a particular build configuration (for example one behind
  a feature flag that the e2e image disables) fails the build with `is not present in a client
  chunk`. No current context is flag-gated; if one ever is, the e2e/release build asymmetry must
  be resolved before the gate will pass both.
- The guard runs once per client build and adds roughly ten to thirty seconds of build time
  (measured 8–30 s for the TypeScript program scan, machine-dependent). It is not free; the
  scan is the cost of type-based discovery.
