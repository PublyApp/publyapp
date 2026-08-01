# z-index scale guard

Normative. Defends the invariant that every z-index utility in `apps/front/src` routes through the
`--publy-z-*` scale declared in `src/styles/app.css`. The guard is
`apps/front/scripts/check-zindex-guard.mjs`; its fixture suite is
`apps/front/scripts/check-zindex-guard.test.mjs`. The guard runs during `pnpm --filter front test`
(inside the fixture suite's live-tree check — exactly one full scan per run) and via the standalone
`pnpm --filter front check:zindex` CLI, and is therefore wired into `just ci-front`.

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
  `!important`).
- Arbitrary-property shims whose value is a pure scale reference: `[z-index:var(--publy-z-…)]`.
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
The descriptor rule covers framework head APIs that render a link later through `<HeadContent>`.
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
4. **Emitted-CSS gate.** The guard runs the real Vite production build into a unique guard-owned
   temporary output directory, recursively parses every CSS asset from that exact invocation with
   PostCSS, and removes the directory afterward. The inline `outDir` override wins over a configured
   Vite `build.outDir`, so a changed config cannot redirect the build while leaving the guard on stale
   `dist` assets. Every residual `@import` fails closed because its contents are opaque to the
   declaration walk; resolved local relative imports are already inlined and stay clean. Every
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
   reached the shipped stylesheet. It is the reason fixtures live in `scripts/`, outside any path the
   scanner watches.
5. **Scale-definition integrity.** A Vite pre-transform hook records project CSS and script modules
   reached by the real build, and the authored pass extends the CSS set through local relative CSS
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
   to a string literal. Unimported script samples are not runtime code and stay green. The same pass
   rejects native JSX stylesheet links and static link-descriptor objects when the `rel` token list
   and `href` are static, including `.jsx`, `.tsx`, `.mts`, and `.cts` modules and values wrapped in
   transparent TypeScript syntax such as `as const`, `satisfies`, non-null, or parentheses. Static
   identifier resolution respects lexical shadowing. The latter closes framework head APIs as well
   as direct JSX while leaving the existing
   `{ rel: 'stylesheet', href: appCss }` Vite-asset descriptor valid because `href` is an imported
   build asset, not a literal. This prevents an inline style from shadowing a legitimate tier after
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
  architectural gain.
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
  native JSX links and static descriptor objects are rejected. The guard does not reinterpret
  arbitrary script strings or perform interprocedural runtime-value tracing. The remaining dynamic
  routes are not considered
  safe—they are explicitly policed by the code standard—but closing them requires a separate
  CSSOM/data-flow mechanism. The common declarative literal route does not need that mechanism and is
  therefore closed here rather than silently grouped with runtime injection.
- **Helper-mediated reserved-token writes, registrations, and helper/import-produced spreads.** The
  script pass follows direct module-scope string constants, but it does not perform interprocedural
  data flow. A helper whose `setProperty(name, value)` key or `CSS.registerProperty({ name })` value
  arrives through a parameter, or a spread/Object.assign payload whose token-bearing object is
  produced by a helper or unscanned import, remains outside the static boundary. Assigning a complete
  style string through `cssText`, `setAttribute('style', ...)`, or raw HTML has the same runtime-data
  boundary. Literal object properties in scanned source remain red even when that object is later
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
production scanner is blind to context. Component 4 therefore turns red on it — the fixture suite
proves this end to end through the production scanner, and also proves the emitted rule is **not**
silently exempted by the allowlist (it is reported, not swallowed). That red is a true positive — the
shipped CSS is polluted — not a false positive on the source construct; component 1 stays green on all
of the innocent constructs in the fixture suite. If you need such a literal under `src/`, break the
utility token so the scanner cannot see it (e.g. `z-[60]` → `z-\\[60\\]`, or spell it "a numeric
stacking value"). The cleanest place for fixtures is `scripts/`, which the scanner never watches.
