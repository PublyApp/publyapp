# z-index scale guard

Normative. Defends the invariant that every z-index utility in `apps/front/src` routes through the
`--publy-z-*` scale declared in `src/styles/app.css`. The guard is
`apps/front/scripts/guards/check-zindex-guard.mts`; its fixture suite is
`apps/front/scripts/guards/check-zindex-guard.test.mts`. The fixture suite's live-tree check runs during
`pnpm --filter front test` (part of `just ci-front`) — exactly one full production scan and one full
production build per run. The standalone `pnpm --filter front check:zindex` CLI runs the same guard
on demand but is wired into no gate on its own.

## The invariant

Every z-index utility (a Tailwind `z-*` class) in `apps/front/src` must route through the scale:

```
:root {
  --publy-z-raised: 10;          /* small affordances inside a surface */
  --publy-z-shell-topbar: 20;    /* the app-shell topbar */
  --publy-z-selection-bar: 40;   /* bulk-selection floating bar */
  --publy-z-overlay: 70;         /* modal/drawer backdrops */
  --publy-z-drawer-surface: 80;  /* drawer + dialog surfaces */
  --publy-z-menu: 100;           /* dropdowns, tooltips, pickers */
  --publy-z-select: 110;         /* select popups */
  --publy-z-toast: 120;          /* toasts */
}
```

Allowed spellings:

- `z-(--publy-z-…)` and `z-[var(--publy-z-…)]` / `z-[--publy-z-…]`, with variants and `!`
  (e.g. `md:z-(--publy-z-menu)`, `!z-(--publy-z-raised)`, `z-(--publy-z-raised)!` — both
  `!`-placement spellings are accepted, and the compiled gate normalises the emitted
  `!important`). Every referenced token must be declared in the canonical `:root` scale above;
  matching the `--publy-z-` namespace alone is not sufficient.
- Arbitrary-property shims whose value is a pure scale reference: `[z-index:var(--publy-z-…)]`.
  Their `var(--publy-z-…)` reference must also name a declared canonical token.
- `z-auto` and the other non-numeric CSS-wide keywords (`inherit`, `initial`, `unset`, `revert`,
  `revert-layer`) — these cannot participate in stacking, so no tier is needed. CSS keywords and
  function names are ASCII-case-insensitive, so arbitrary forms such as `z-[AUTO]`, `z-[InHeRiT]`,
  and `z-[VAR(--publy-z-raised)]` are equivalent and are also allowed; custom-property names remain
  case-sensitive.
- `z-index: var(--publy-z-…)` in inline `style` objects and `@apply`.

Anything else is a violation: `z-10`, `z-50`, `z-[60]`, `-z-10`, `!z-50`, `z-[var(--publy-z-menu,50)]`
(a scale reference with a raw fallback is still a raw value when the token is unset), a raw
arbitrary-property shim such as `[z-index:5]` (it ships `z-index: 5` and is reported both at source
and in the compiled CSS), any dynamic assembly (`z-${…}` across a template substitution), any local
redefinition of a reserved `--publy-z-*` token, and a native JSX `<link rel="stylesheet">` or static
link-descriptor object whose `rel` and `href` resolve to literals or module-scope string constants.
The descriptor rule covers framework head APIs that render a link later through `<HeadContent>`, and
it is gated on **proven reachability to a route creator**, not on object shape (round-23 I2): a
standalone object literal that merely has `rel`/`href` keys — or a `head:`-shaped object no route
consumes — establishes nothing about `<HeadContent>`, a links API, or the DOM, so it is neither a
violation nor declared a safe descriptor. The literal rules police a descriptor only when its
containing config object provably reaches a TanStack route creator call — `createRootRoute`,
`createRoute`, or their `WithContext` forms, including the `createRootRouteWithContext<...>()({...})`
chain the app's own root route uses — directly or through a module-scope const alias, and the head
function is followed when supplied by identifier (`head: routeHead` is a normal, genuine route path,
not an exotic one), block-bodied or expression-bodied, so the routeHead spelling is policed exactly
like the inline one. An
overflowing `href` on a JSX `<link>` whose `rel` is provably free of the `stylesheet` token
(`<link rel="icon">`) is inert and stays green; the overflow rule fires only when the link could
actually load a stylesheet.
The same "declarative payload that never becomes an emitted asset" logic covers a native JSX
`<style>` element whose children are static text (the declaration walk runs over the payload, so a
raw `z-index:` inside it reds), including deterministic `String.raw`
tagged-template payloads, and CSS files imported with `?inline` (their authored file is
walked directly, so they cannot smuggle a raw declaration past the emitted gate). The `<style>` rule
covers both JSX spellings — the element and the self-closing `<style … />` — including the
`dangerouslySetInnerHTML` payload on either, and a payload the declaration walk cannot parse is
reported as a named `z-index-unparseable-static-css` diagnostic rather than crashing the guard.
The `?inline`/`?raw` provenance uses Vite's own CSS-language set (`isCSSRequest`), so `.pcss`,
`.postcss` and every other language Vite treats as CSS are covered as they ship. For `?raw` on a
non-CSS extension, the guard does **not** decide from the file's bytes and does **not** re-test the
specifier text: raw/inline classification is decided in exactly one function (`classifyModuleKind`),
which reads what the build itself produced — the module's own transform result (a `?raw` module is
rewritten by Vite's `vite:asset` load hook into the exact `export default "<bytes>"` shape, plain
CSS becomes an empty module, `?inline`/`?raw` CSS becomes the inlined export-default shape), the
module info Vite recorded (the `vite:asset` marker carried by `?url` modules, which export a URL
rather than raw text), and the ids this guard's post-order `load` hook observed (exactly the
modules `vite:asset` did not claim — separating the raw-export shape `vite:asset` produced from the
same shape an ordinary module wrote). The file part is Vite's own `cleanUrl` semantics — strip from
the first `?` or `#` — so a legal specifier containing another query separator (`./x.txt?v=1?raw`)
is raw because Vite transformed it as raw, never because a hand-written parser said so. The fixture
suite asserts this behaviourally rather than by scanning the guard's source for query-parsing
spellings (a source-regex stand-in can be out-spelled, and it cannot tell a query parse that
*classifies* from a query extraction that *reconstructs a module ID for a per-ID membership
lookup*): both ID shapes of one file (`?raw`, `?url`, `?v=1?raw`, `?v=2?raw`) feed the real
classification path and classify exactly as Vite observes them, and the script pass resolves a
specifier to its full module ID (path + query) and consults the build's per-ID record — a `?url` ID
for a file the build also recorded as `?raw` is a distinct Vite module and provably not raw text.
The `?v=2?raw` per-ID shape is pinned because it is the exact spelling a hand-written re-classifier
would remap (round-21 I3); a behavioral pin is finite — it proves the pinned shapes, and a
divergence in an unexercised spelling that changes a Vite-observable answer must be added to the
fixture suite, not claimed impossible by a source-regex stand-in.
The script pass asks the recorded build
provenance: an import binding exists only when its resolved file is in the recorded `?raw` set,
never by re-classifying the specifier text. The script pass records every
binding a static import can introduce — the default clause, the namespace clause, `{ default as x }`
(the same default under another spelling), and mixed spellings such as `import d, * as ns` — so a
raw module's bytes are walked only when such a binding reaches a style-capable sink: a `<style>`
element's children or a `dangerouslySetInnerHTML` payload (walked as CSS on a `<style>` host, as
HTML elsewhere). A named element that is not `default` is undefined on a raw module and ships
nothing; it is recorded by name, not silently omitted, the record is directly assertable in the
fixture suite, and the walk resolves it to nothing. The
binding
is followed through module-scope `const` aliases (including alias chains, to a cycle-guarded
fixpoint) and through the statically transparent expression family — object-member reads through
const object literals (`<style>{obj.css}</style>` ships the member's bytes, nested at any depth),
both branches of a conditional, `String(...)`, template-literal substitutions, and element-access
spellings with a **provably complete** key — and the namespace spelling resolves through `.default`;
`~/`, Vite root-absolute
(`/src/…`) and relative specifiers all resolve against the project root. The same imported bytes
consumed by a text node (`<pre>`, `<p>`) are displayed text, not a stylesheet, and stay green; a
style-sink payload the declaration walk cannot parse is a named diagnostic that fails the guard,
never a silent pass. A style-sink specifier the resolver cannot map to a recorded raw module is a
named `z-index-unresolved-raw-import` diagnostic (CSS-language `?raw` modules are recorded as inline
CSS and walked by the inline gate instead, so they are never misreported as unresolved). A style-sink
expression the resolver family cannot evaluate that still contains a recorded raw binding — a call
(`fn(rawCss)`), a binary (`rawCss + 'x'`), a member of a call result — is a named
`z-index-unresolved-raw-expression` diagnostic: the raw bytes may ship as CSS the guard cannot read,
and the guard fails loud by name rather than treating the miss as "nothing there". An element-access
key the family cannot prove complete (`styles['cs' + suffix]`) resolves **no** member — the guard
never reads a member the code may not read — and when a recorded raw binding is reachable under
that key the same named diagnostic fires. The same bytes
displayed through a text node are still just displayed text.
The `<style>` payload walk evaluates the same transparent family for **static strings**: a
conditional whose branches are static literals, `String('…')`, an object-member read, a template
whose substitutions are static, a deterministic `String.raw` tagged template, or a `+` of two
static operands is a static payload at any depth,
and every string it can provably be is walked; static text beside a runtime child still ships, so
it is walked individually (a `+` whose other operand is runtime still ships its static operand —
as a provable *substring*, which the payload walk scans but which never doubles as a member
identity), and a purely runtime payload stays in the declared runtime bucket.

For `String.raw`, the evaluator recognizes only an unshadowed direct `String.raw`,
`globalThis.String.raw`, `window.String.raw`, or `self.String.raw` tag, plus a simple
module-scope `const` alias chain to one of those spellings. Other tag aliases and tagged-template
functions stay in the runtime bucket. Raw template segments are evaluated from their source
`rawText`, while static substitutions are evaluated normally.

A payload whose enumerated work — total candidate characters, i.e. candidate count multiplied by
candidate length — exceeds the work budget cannot be enumerated at all. The budget is a resource
ceiling (the candidates are CSS payload strings bounded in length by the source expression,
checked *before* the next candidate is allocated, so the guard never over-allocates past the
ceiling), not a statement about how many candidates a payload may legitimately have: 131,072 short
candidates — a round-19 reproduction that the previous count cap of 100,000 wrongly rejected —
enumerate comfortably, because each candidate is short. The 20,000,000-character ceiling is
measured, not arbitrary (round-21 I4): the guard walks every enumerated candidate through a PostCSS
parse (~3µs/candidate), so a payload at the budget is ~2 seconds of this guard's work, and one past
it costs many seconds and tens of megabytes for a single static payload — more than the rest of the
run combined. Beyond the budget the payload is
unresolvable, and it is a named `z-index-static-candidate-overflow` diagnostic rather than a hang
or a silent green, and overflow propagates through the whole expression-family — an
overflowing branch nested in a conditional, template substitution, `+` operand, member read, or
const alias keeps the whole enclosing payload loud by name. The propagation is enforced, not
audited: every `staticString()` consumption must name all three outcomes — a resolved value,
UNRESOLVED overflow, and provably-not-static — and a guard-structure test mechanically enumerates
every call site in the guard script, so a future consumer that drops overflow or coerces it onto
the benign default fails the suite (round-23 B1; round 21 shipped exactly such a dropped consumer
after a hand-written "every call site" audit). At each CSS sink the unresolvable candidate space
is reported by name instead of being treated as an ordinary unknown that resolves to a compliant
default: the JSX `<link>` rel/href reader, link-descriptor reader, `CSS.registerProperty()` name,
scale-token-write key, `<style>` payload, and the computed member/receiver keys of the script
pass. "Member read" includes an **element-access key whose
candidate space overflows** (`<style>{styles[key]}</style>` where `key` is a 20-choice static
template): the key is provably static text the guard cannot enumerate, so the member identity is
UNRESOLVED and the enclosing payload stays loud by name — an unenumerable computed key is a
different outcome from a provably runtime one, which alone resolves no member and stays in the
declared runtime bucket. The distinction is deliberate: "too many possibilities" is not "nothing
to check". An overflowing computed key on a CSSOM receiver is the same unresolvable member
question — the member may be `style`, so the call stays loud instead of reading as an ordinary
unknown (round-23 B1).
New tiers belong in the global `:root` scale; otherwise a local `--publy-z-raised: 999` could make an
apparently scale-routed declaration compute to an arbitrary value. Stylesheets belong in the Vite
import graph so the emitted gate can inspect them; data, remote, and local literal stylesheet links
are all opaque and rejected.

## Mechanism

The guard builds on the installed Tailwind extractor (`@tailwindcss/oxide`'s `Scanner`), because it
reports exactly the candidates the production compiler recognises — re-implementing class extraction
from a TypeScript AST is what failed twice before (#987). The scanner's sources are derived from
`@import 'tailwindcss' source('../')` in `app.css` via `@tailwindcss/node`'s `compile()`, exactly the
way `@tailwindcss/vite` builds them, so the scanned file set is the production file set.

Five components:

1. **Candidate scan.** Every extractor candidate that is a raw z-index utility is reported unless it
   sits in a position that can never become a delivered class. Comments are stripped first (string-
   aware, position-preserving), then these positions are suppressed: literal/template-literal types,
   non-`className`/`class` JSX attributes, comparison operands, and every quoted string in CSS. Every
   other occurrence — including a plain variable initializer in one module that is consumed as a
   class in another — is a delivery position and is reported. Arbitrary-property shims
   (`[z-index:5]`) are classified here too: the property name is canonicalised (CSS property names
   are ASCII-case-insensitive and may carry escapes, so `[Z-INDEX:5]` is the same shim), and only a
   pure scale reference or a non-stacking keyword value is allowed.
2. **`@apply` scan.** The extractor drops the token that ends an `@apply` directive right before `;`
   (`@apply block z-50;` yields no `z-50` candidate), so directive text is scanned directly.
3. **Substitution-boundary scan.** `z-${level}` has no candidate at extractor time; a class-delivery
   template literal whose static parts carry a z-index fragment across a `${…}` boundary is reported.
4. **Emitted-CSS gate.** The guard runs the real Vite production build through
   Vite's multi-environment builder API — both the client **and** the SSR
   bundle, exactly as `vite build` ships — into a unique guard-owned
   temporary output directory, recursively parses every CSS asset from that
   exact invocation with PostCSS, and removes the directory afterward. The
   inline `outDir` override wins over a configured Vite `build.outDir`, so a
   changed config cannot redirect the build while leaving the guard on stale
   `dist` assets. Every residual `@import` fails closed because its contents
   are opaque to the declaration walk; resolved local relative imports are
   already inlined and stay clean. Every
   `z-index:` declaration that does not resolve through `var(--publy-z-…)` is reported. The parser
   canonicalises property names
   (`Z-INDEX: 50` and
   `z-\69ndex: 50` are the same declaration), decodes and normalises an optional trailing
   `!important` identifier (including escaped forms such as `!\69mportant`), and attributes each
   declaration to its complete outer-rule and at-rule ancestry. That is what lets the
   one raw exception bind to its exact `@layer components` + selector context, while CSS comments,
   nested rules, and braces inside custom-property values retain their real grammar. This proves what
   actually ships, including CSS imported through the JavaScript component graph rather than through
   `app.css`. This is the exact failure that killed the previous attempt, whose own fixture literals
   reached the shipped stylesheet. It is the reason fixtures live in `packages/scripts-ts/`, outside any path the
   scanner watches.
5. **Scale-definition integrity.** A Vite post-order transform hook records project CSS and script
   modules reached by the real build — from **both** the client and the SSR environment, so an
   SSR-only module
    (`src/server.ts` and friends) is exactly as build-reachable as a client module — and the authored
    pass extends the CSS set through local relative CSS
    `@import`s. It does not scan unimported samples or fixtures merely because they have a relevant
    extension; importing one puts it in the build graph and therefore back in scope. A
    `--publy-z-*` declaration is accepted only
   when it originates in a top-level `:root` in `src/styles/app.css`, and a repeated tier is rejected.
   Splitting the canonical scale into a second reachable stylesheet remains forbidden. This source
   pass preserves provenance that a bundled asset cannot. Separately, the emitted pass recognises
   Tailwind's exact generated
   `@layer theme { :root, :host { … } }` form, rejects changed selector/ancestor shapes, and enforces
   uniqueness across all emitted assets. An emitted tier must also belong to the canonical token set
   parsed from the top-level `:root` in `app.css`; a dependency cannot introduce a new reserved token
   merely by using Tailwind's accepted generated selector. Both CSS passes also reject every
   `@property --publy-z-*` registration: registration with `inherits: false` can replace the
   canonical inherited tier with its `initial-value` on descendants without declaring the token. In
   build-reachable project scripts, direct `CSS.registerProperty()` calls with a static reserved
   `name` are rejected for the same reason, including the explicit browser-global forms
   `globalThis.CSS`, `window.CSS`, and `self.CSS`. Lexically shadowed identifiers are not confused
   with those browser globals; transparent parentheses and static bracket/property access spellings
   are equivalent. Other at-rule parameters may reference a custom property, or reuse
   the same spelling in an unrelated namespace such as a keyframe name, but cannot register or replace
   its computed value.
   Tailwind's generated selector shape is intentionally exact and fails closed if an upgrade changes
   it; the guard and this policy must then be reviewed together.
   Local CSS declarations are reported even when the consuming `z-index` uses `var(...)`. In every
   build-reachable project script recorded by Vite—including a project module outside Tailwind's
   source root—the script AST pass also reports literal `--publy-z-*` object properties and
   `setProperty()` calls, plus direct keys resolved through an unshadowed module-scope `const` bound
   to a string literal. A `setProperty` call is recognised from its **receiver identity**, not its
   spelling (round-23 I1), and identity is a three-way fact: **proven CSSOM** (a `.style` member of a
   value the source types as a DOM element, or a value typed `CSSStyleDeclaration`) reports; **proven
   not CSSOM** (a plain object literal, a class instance, or an unbound destructured method — a bare
   Web-IDL call raises `TypeError: Illegal invocation` in the browser and writes nothing) stays
   silent; and **UNRESOLVED** — a parameter without a DOM/CSSOM annotation, an import, a global —
   fails loud by name (`z-index-cssom-write-unresolved` for a benign key, the reserved-token finding
   for a `--publy-z-*` key), because absence of proof is not proof of absence. All spellings reduce
   to the same question — dot, bracket, an aliased receiver (`const s = element.style;
   s.setProperty(...)`), a bound method alias (`element.style.setProperty.bind(element.style)` — the
   eventual write's receiver is the bind's `thisArg`, and Chromium measures the real write), or a
   destructured method — while a method merely *named* `setProperty` on an unrelated object, or
   `.style` on a provably plain object literal or class instance (an ordinary data property, never
   the CSSOM accessor), reds nothing. A method-name candidate space
   the guard cannot enumerate is a named `z-index-static-candidate-overflow` diagnostic because the
   write cannot be ruled out. Unimported script samples are not runtime code and stay green. The same pass
   rejects native JSX stylesheet links and static link-descriptor objects when the `rel` token list
   and `href` are static, including `.jsx`, `.tsx`, `.mts`, and `.cts` modules and values wrapped in
   transparent TypeScript syntax such as `as const`, `satisfies`, non-null, or parentheses. Static
   identifier resolution respects lexical shadowing. The latter closes framework head APIs as well
   as direct JSX while leaving the existing
    `{ rel: 'stylesheet', href: appCss }` Vite-asset descriptor valid because `href` is an imported
    build asset, not a literal. The same pass runs the declaration walk over the static payload of a
    native JSX `<style>` element in either spelling — element or self-closing — including the
    `dangerouslySetInnerHTML` payload, because such CSS
    ships as SSR HTML or client JS rather than an emitted asset, and CSS files imported with the
     `?inline`/`?raw` query forms are walked on the authored file for the same reason — their text
     leaves the build as JS, never as an asset the emitted gate can see. The provenance classifies
     every module through the single `classifyModuleKind` function from what the build itself
     produced — the post-order transform result (a `?raw` module arrives as the exact
     `export default "<bytes>"` shape `vite:asset`'s load wrote, plain CSS as an empty module,
     `?inline`/`?raw` CSS as the inlined export-default shape), the `vite:asset` marker Vite records
     on `?url` modules, and the ids this guard's post-order `load` hook observed (exactly the
     modules `vite:asset` did not claim) — across Vite's own CSS-language set and, for `?raw`,
     every module the build transforms regardless of extension. The fixture suite asserts this
     behaviourally — both ID shapes feed the real classification path and classify exactly as Vite
     observes them, and the per-ID script-pass answer is pinned — and the script pass
     never re-classifies a specifier: an import binding exists only when the build's recorded set
     contains the specifier's resolved file, and with per-ID provenance it contains the specifier's
     *full module ID* (path + query), so a `?url` ID for a file the build also recorded as `?raw` is
     a distinct module and provably not raw text. A raw payload is walked only when the import binding reaches
     a style-capable sink (a `<style>` element's children or a `dangerouslySetInnerHTML` payload, the
     binding tracked unshadowed from its import declaration through module-scope `const` alias chains,
     the transparent expression family — object-member reads through const object literals,
     conditionals (both branches), `String(...)`, deterministic `String.raw` tagged templates,
     element access with a provably complete key — and
     template-literal substitutions, including the `import * as raw … ?raw`
     namespace spelling through `.default` and the `{ default as x }` spelling as the same default
     binding), and a style-sink payload the declaration walk cannot
     parse (template syntax, an HTML comment, an unclosed block — any PostCSS failure, with no
     reason string consulted) is a named diagnostic, never a
     crash and never a silent pass. The same raw bytes displayed through a text node are escaped
     text, not a stylesheet, and are not walked. A style-sink expression the family cannot evaluate
     that still contains a recorded raw binding — including an element-access key the family cannot
    prove complete, which resolves no member — is a named `z-index-unresolved-raw-expression`
    diagnostic. A `<style>` element's
    `dangerouslySetInnerHTML` attribute suppresses children inspection in both the static walk and
    the raw-sink walk — React ignores children whenever the attribute is present, so only the
    payload itself can ship. This prevents an inline style
   from shadowing a legitimate tier after
   the emitted gate has accepted its reference, and prevents declarative CSS payloads from bypassing
   that gate as JavaScript bundle text. Build provenance identifies the
   reachable authored files but does not map a minified emitted declaration back to one exact source
   declaration. The guard therefore retains both authored and emitted scale-integrity diagnostics;
   it never suppresses a shipped defect merely because another file contains identical declaration
   text.

## Out of scope — stated, not silent

A guard that silently does not cover something invites the belief that it does. These are declared
gaps, each with its current evidence:

- **Raw `z-index:` declarations in `app.css`.** Not Tailwind utilities. The single existing one is
  the sticky `.publy-data-table thead` header (`z-index: 5`), allowlisted in
  `KNOWN_RAW_Z_INDEX_DECLARATIONS` in the script — but the allowance is **bound to the complete
  ancestor chain (`@layer components`), exact selector list, and expected occurrence count**, not to
  the value `5`. Wrapping the selector in an outer rule, `@media`, or `@supports`, moving it to another
  layer, putting `z-index: 5` on any other selector (including a `.z-5` rule generated by
  `@source inline("z-5")` and the `[z-index:5]` shim), or duplicating the bound rule reds the guard. The
  rationale: `.publy-table-card`'s
  `overflow: hidden` clips but does **not** establish a stacking context, so the header's `z-index: 5`
  competes in the page-level stacking context — which is why the value must sit below every scale tier
  (`--publy-z-raised` is 10). The header needs _some_ z-index because the sticky cells are earlier in
  DOM order than the body rows they scroll over; the value just needs to be above those rows and below
   every tier. Inventing a scale tier for a single internal rule would widen the scale for no
   architectural gain. If a *dependency* ever ships a raw `z-index` that reds the emitted gate, the
   violation message names `KNOWN_RAW_Z_INDEX_DECLARATIONS` in the script — the only remediation is a
   review that ends in either moving the declaration onto the scale or (rarely) an explicit, bound
   allowlist entry with a reason. Never delete the guard to silence a dependency.
- **Inline `style={{ zIndex }}` objects.** `toaster.tsx` already uses `var(--publy-z-toast)`;
  `initials-avatar.tsx` stacks overlapping avatars with `visible.length - index`, which has no scale
  meaning. Component 1 ignores these because inline styles are not extractor candidates, and
  component 4 cannot see inline styles either. It is deliberately left open — see below.
- **z-index assembled at runtime from values that never appear literally in `src`** (e.g. from an
  API response). No static guard can see this.
- **Stylesheets injected or selected at runtime.** A literal CSS rule passed to
  `CSSStyleSheet.replaceSync()`, `insertRule()`, assigned to a `<style>` element's `textContent`, or
  produced by an equivalent CSSOM path is shipped as JavaScript rather than as an emitted CSS asset.
  A stylesheet `<link>` whose `rel` or `href` is assembled at runtime has the same boundary; literal
  native JSX links, static descriptor objects, and static JSX `<style>` payloads are rejected. The
  guard does not reinterpret
  arbitrary script strings or perform interprocedural runtime-value tracing. The remaining dynamic
  routes are not considered
  safe—they are explicitly policed by the code standard—but closing them requires a separate
  CSSOM/data-flow mechanism. The common declarative literal route does not need that mechanism and is
  therefore closed here rather than silently grouped with runtime injection.
- **A `<style>` element whose children assemble the CSS across a template substitution with
  runtime data.** `<style>{`z-index: ${MAX}`}</style>` where `MAX` is a module-scope constant is
  read (the payload family evaluates every substitution that is static, and a conditional, a
  `String(...)`, a deterministic `String.raw` tagged template, an object-member read, or a `+` of
  two static operands is equally transparent);
  a substitution supplied by runtime data — a parameter, a call, a state value — is the same
  boundary as the runtime-injection bullet: the raw value is supplied by data flow, not by a
  literal the guard sees. It is declared rather than silently grouped.
- **Static files under `public/`.** They are copied verbatim by the shipped build but are not part of
  the guard's emitted or authored sets. A `public/evil.css` would ship unread — however, every way to
  reference it from shipped code (a static `<link rel="stylesheet" href="/evil.css">`, a link written
  by `src/server.ts`, a residual CSS `@import`) trips an existing rule, so the file itself is not a
  working green bypass. Declared for completeness, not because a live route exists.
- **Helper-mediated reserved-token writes and registrations.** The script pass follows direct
  module-scope string constants and a static object-literal spread whose source is a module-scope
  `const` bound to an object literal — through any alias chain, to a cycle-guarded fixpoint — is
  transparent to it: `{...{rel: 'stylesheet'}}`, `{...constObj}` and
  `{...{dangerouslySetInnerHTML: {__html: …}}}` resolve exactly like the
  non-spread spelling, and a spread const cycle terminates as opaque instead of hanging — but it
  does not perform interprocedural data flow. A helper whose
  `setProperty(name, value)` key or `CSS.registerProperty({ name })` value arrives through a
  parameter, or a payload produced by a helper or unscanned import, remains outside the static
  boundary. Every JSX attribute reader — `dangerouslySetInnerHTML` payloads, `<link>` `rel`/`href`,
  duplicate attributes — goes through one source-ordered walker, so the readers cannot disagree
  about spreads. Spreads are never silent: an unresolvable spread (a parameter, import, call, or alias
  chain ending anywhere other than a module-scope const object literal) that sits after a static
  fact it could carry or override is a named `z-index-unresolved-spread-shadow` diagnostic, and in
  a position the guard can **prove** style-capable — a `<style>` element's attribute list, a
  `dangerouslySetInnerHTML` payload object, a `<link>` element carrying a static `rel`/`href` fact,
  a `CSS.registerProperty()` argument — the same named
  diagnostic fires even when the opaque spread is the **only** source: the payload may be anything
  and cannot be dismissed as unrelated runtime data. An opaque spread in an ordinary object literal
  (a link-descriptor candidate with no facts to shadow) or on a non-style element (`<div
  {...props}>`) is not provably a style position, so it stays in the runtime bucket exactly like an
  unresolvable payload expression. Source-order last-write-wins
  is still mirrored: a later spread may carry any property, so it shadows static facts established
  before it, and a later explicit member or static literal spread re-establishes them. Assigning a
complete style string through `cssText`, `setAttribute('style', ...)`, or raw HTML at **runtime**
   has the same data-flow boundary; a **static literal** `dangerouslySetInnerHTML` payload is closed
   instead — the script pass scans its `<style>`/`<link rel="stylesheet">` fragments exactly like the
   JSX routes, and a `<style>` element with no closing tag is walked too, because browser fragment
   parsing closes an open raw-text style element at EOF and applies its declarations (an
   unterminated `<style>` is never silently treated as compliant). Literal object properties in
   scanned source remain red even when that object is later
   spread.
- **A class assembled by `+` string concatenation (`'z-' + 5`).** It produces no extractor candidate,
  so on its own it ships no rule and paints at `auto` — it is dead text. It becomes load-bearing only
  **in combination with** a route that generates a rule for that class (`@source inline("z-5")`,
  `@utility z-5`, a raw app.css rule, a `z-5` literal elsewhere). Any such route emits `z-index: 5`
  into the compiled CSS, and the compiled gate reports exactly that rule — because the allowlist is
  selector-bound, the generated rule is **not** exempted. So the combination is red, not a green
  bypass: a `+`-concatenated class can ship a working raw z-index only when a rule ships, and shipping
  that rule is itself a violation.

### The deliberately green raw z-index routes

Inline `style={{ zIndex: … }}` is invisible to the extractor (component 1) and to the emitted
stylesheet (component 4); runtime stylesheet injection is likewise absent from emitted CSS. Covering
them would require AST-level style-object and CSSOM-flow scanners, different mechanisms from this
guard. They are left open and policed by the code standard: every runtime z-index must reference the
scale (the current inline consumers already do).

One deliberate interaction to understand: an innocent-looking string that _literally contains_ a
z-index utility (a `data-*` attribute value, a type literal, a test comment) still makes the
extractor emit that utility into the built stylesheet when it sits under `src/`, because the
production scanner is blind to context. This is the precise scope of issue #987's "no false positive
on the innocent case" acceptance (round-21 I5): it is scoped to **component 1**, the source pass,
which stays green on all of the innocent constructs in the fixture suite. Component 4 therefore turns
red on such a literal — the fixture suite proves this end to end through the production scanner, and
also proves the emitted rule is **not** silently exempted by the allowlist (it is reported, not
swallowed). That red is a true positive — the shipped CSS is polluted — not a false positive on the
source construct; the shipped stylesheet is worse for it even though no class is ever themed by that
source position. If you need such a literal under `src/`, break the
utility token so the scanner cannot see it (e.g. `z-[60]` → `z-\\[60\\]`, or spell it "a numeric
stacking value"). The cleanest place for fixtures is `packages/scripts-ts/`, which the scanner never watches.
