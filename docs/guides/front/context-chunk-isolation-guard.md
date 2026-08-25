# Context chunk isolation guard

The front build gate that stops one React context from being minted twice in the client bundle.
See issue #1011 for the bug class: when a module (typically a TanStack route file) survives in more
than one client chunk, each copy that executes `createContext(...)` produces its own context
object, and a provider in one chunk no longer matches a consumer in another.

## How it works

- `apps/front/tools/vite/check-context-chunk-isolation.mts` is a Vite plugin
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
  Nested patterns (`const { inner: { probe: Ctx } } = makeNested()`) are discovered the same
  way.
- A context minted into an unbound position — an `export default`, an object property value, an
  array element, or a spread of a context record (`{ ...makeContexts(null) }`) — is inventoried
  under the literal name `<anonymous context>`, whether it is minted directly or through a
  factory, and each minting call inside a conditional holder expression is tracked at its own
  span. A *named* conditional declaration
  (`export const Ctx = cond ? createContext(null) : createContext(null)`) is one inventory
  entry whose recorded spans cover both branches — the branch calls never spawn phantom
  anonymous entries.
- The discovered contexts are checked against the checked-in inventory
  (`apps/front/scripts/context-chunk-isolation.inventory.mjs`). Any mismatch fails the build.
- At `generateBundle` it reads the source map the build itself emitted for every client chunk.
  For each inventory context the source scan records the **argument-list extent of every minting
  call** (the open paren through the close paren, not the whole call). A rendered copy of the
  source module is attributed a mint only when a single map segment ties a generated call to a
  recorded mint span in that exact module copy. The verdict is per context and per copy: it fails
  the build when minting copies land in more than one chunk — or when a single chunk contains two
  minting copies.

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

The guard deliberately throws instead of passing when it cannot attribute rendered mints:

- **Rendered attribution is source-map keyed, and the guard requests the map.** The plugin
  configures the client build to emit `hidden` source maps (no `sourceMappingURL` comment) when
  the user did not configure any, reads them at `generateBundle`, and strips the map assets from
  the output before they can ship. When the guard forces the maps it also pins the map asset
  naming to `[name].map`, so its own map for a chunk sits at the exact key `chunk.name + '.map'`
  holding the bundler's serialization of that chunk's map object — the two identity facts the
  guard recorded when it forced the map. The guard deletes an asset only when its bytes are
  exactly that serialization (`JSON.stringify(chunk.map)`), an equality pinned by the real-build
  suite against the bundler's writer. Any other bytes — a strict subset of fields such as a
  `sourcesContent`-stripped map, an extra field, a reordered or reformatted key, any differing
  value — are not the guard's map and survive untouched. The
  source scan records the argument-list extent of every minting call; a rendered copy of the
  module is attributed a mint when the bundler's own map places an emitted token **strictly
  inside** one of those extents in that exact module copy (the map's resolved source id must
  equal the copy's module id, so sibling copies in the same chunk stay distinct, and only the
  argument-list extent counts — an emitted callee identifier or a callee *reference* that maps
  back into the callee text is outside the extent and is never accepted as an emitted call). The
  bundler cannot rewrite this identity, because the bundler is the producer of the map: a call
  that did not originate at a recorded mint span can never map back to it, no matter what names
  the bundler assigned — callee names, binding names, alias elimination, import renaming and
  chunk merging are all invisible to a position comparison.
- **A map the guard cannot trust fails closed.** A chunk's map is trusted only when it is a
  structurally valid version-3 map (version, mappings string, sources array, well-formed VLQ)
  whose decoded segments are in bounds; malformed input fails the build with a named diagnostic
  instead of a wrong verdict or a hang, and a one-field (generated-only) VLQ segment never
  contributes an original position — it is not a decoding shortcut to inherit the previous
  segment's origin for it, that would let a coarse map forge precision it does not have. The mint
  question is "did *this* copy, at *this* generated call, mint *this* context". It is answered in
  exactly one place, by the emitted-call analysis: the chunk's generated code is parsed once per
  chunk for its call-argument extents by a token-aware scanner that never mistakes an
  `if`/`for`/`function` paren or a class/object method parameter list for a call and always
  catches optional calls, and a copy is MINTING when a **single segment** ties a generated call
  to one of the context's recorded spans — the same segment inside an emitted call and inside the
  mint span. A copy is verifiably NON-MINTING only when every mint call its map ties to belongs
  to some *other* context's span in the same module (so this context's mint cannot be the one the
  copy executes, and a multi-context module split across copies stays green). Anything else — the
  copy ties to no span at all, or the map is unverifiable — is unverifiable, not "attributable
  and non-minting": the guard cannot tell a copy that genuinely does not mint from a copy whose
  map is forged to hide the mint it does execute, so it throws `cannot classify … the build
  emits no source map for a client chunk delivering its source, or a delivered copy's map does
  not resolve precise original positions for it`. The guard never inspects the copy's rendered
  text for a mint name: a minifier renames the mint call to `m(null)`, so a name-based verdict
  would declare a genuinely minting copy "provably non-minting" — the round-25 bypass — and a
  string that merely contains the mint's name is inert. A single delivered copy with no
  attributed mint stays green — with only one copy there is nothing to duplicate.
- **Unattributed presence fails closed.** When a source file owns an inventory entry and
  **two or more copies** of its module are delivered (each module–chunk pair is a copy)
  while no rendered copy is attributed a mint, the guard cannot tell whether the context is
  minted once (safe) or in every copy (the bug class), so it throws. The count is of
  delivered copies, not of the chunks they landed in: advanced chunk grouping can put two
  copies of a module in one chunk, and that is the same duplicate-mint hazard as two
  chunks. A single delivered copy with no attributed mint stays green — with only one copy
  there is nothing to duplicate.
- **A chunk without a source map makes attribution incomplete and fails closed.** If the build
  emits no map for a chunk that delivers a context source (a user configuration that disables
  source maps), every copy that chunk carries is uncheckable and may mint, so past one
  delivered copy the guard throws. A single copy still stays green.
- An unrecognized query-module family derived from a context source file (new TanStack sibling
  transforms must be added to the curated allowlist first).
- The `hidden` map convention is pinned by the regression suite against real Vite/Rolldown
  builds; a future bundler change that shifts the emitted map coordinates fails the real-build
  regressions loudly instead of silently mis-attributing.

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
- A context minted inside a function body or return position (`loader: () => factory()`,
  `function build() { return factory(); }`) is invisible to the source scan — no inventory
  entry is demanded, so nothing is checked. A factory call in an argument position is
  discovered when its result is bound or held (the enclosing binding or holder is typed),
  and when the result is discarded nothing can consume the duplicate, so neither form is a
  real coverage gap. Comma-chain, IIFE-wrapped, conditional-branch and logical-operand holder
  values (`{ p: (0, factory()) }`, `{ p: (() => factory())() }`,
  `{ p: cond ? factory() : factory() }`) are discovered and inventoried at each minting
  call's own source span, so the rendered attribution does not depend on any wrapper shape.
- A factory returning a *record* of contexts, bound to a plain identifier
  (`const contexts = makeContexts()`), is invisible as a binding, but a record factory whose
  result is held in a holder position — `{ probe: makeContexts() }` or `{ ...makeContexts() }` —
  is tracked at the factory call's own span, because every delivered copy of the holder
  executes the factory and mints every context in the record.
- The rendered attribution reads the map the build emits, so it depends on the build emitting
  one: the plugin forces `hidden` client source maps and strips them from the output, but a
  configuration that disables source maps after the fact — or a transform whose map collapses a
  copy's positions onto a single anchor — takes the fail-closed branch (see above) rather than a
  silent pass.
- A copy is only verifiably non-minting when its map ties every mint call it emits to some
  other context's span in the same module. A copy whose map ties to no recorded span at all —
  including TanStack's own `component: lazyRouteComponent(…)` split shim, which genuinely does
  not execute the mint — is indistinguishable from a forged map hiding a real mint, so a module
  delivered in more than one copy with such a copy fails closed. A context that is used only by
  the split component of its own route therefore takes the fail-closed branch; earlier rounds
  blessed that shape green by checking the copy's rendered text for the mint's source name, a
  premise that breaks the moment a minifier renames the call.
- A context that is tree-shaken out of a particular build configuration (for example one behind
  a feature flag that the e2e image disables) fails the build with `is not present in a client
  chunk`. No current context is flag-gated; if one ever is, the e2e/release build asymmetry
  must be resolved before the gate will pass both.
- The guard runs once per client build. The isolated TypeScript scan takes roughly 2–4 seconds
  on a development machine (measured median ~1.9 s on the reference machine, 1.8–1.9 s across
  six runs; earlier rounds measured 3–6 s under load before the factory-value walk was removed).
  Whole-build A/B comparisons are useless because machine noise swamps the delta. It is not
  free; the scan is the cost of type-based discovery.
