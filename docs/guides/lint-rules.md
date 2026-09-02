# PublyApp Lint Rules — Reference

This guide enumerates every custom lint rule in the repo. For the framework design and roadmap context, see [#350](https://github.com/PublyApp/publyapp/issues/350).

## Custom Oxlint rules (`packages/lint-ts/`)

Each rule is exposed under the `publy/*` namespace and registered in `.oxlintrc.json`. Severity = `"error"` means enforced; `"off"` means dormant (rule ships and tests pass but produces no diagnostics).

### `publy/prefer-specific-lodash-imports`

- **Severity:** `error`
- **Source:** `packages/lint-ts/src/publy/prefer-specific-lodash-imports.ts`
- **Spec:** `packages/lint-ts/src/publy/prefer-specific-lodash-imports.test.ts`
- **AGENTS.md:** "Import specific helpers such as `lodash/map`, `lodash/trim`, `lodash/isEqual`, and `lodash/capitalize` instead of the full `lodash` package."
- **Autofix:** yes (value-only named imports → specific subpath imports; `.mjs`-aware)
- **Shipped in:** #463
- **Enforced in:** #463

### `publy/no-console-in-source`

- **Severity:** `error`
- **Source:** `packages/lint-ts/src/publy/no-console-in-source.ts`
- **Spec:** `packages/lint-ts/src/publy/no-console-in-source.test.ts`
- **AGENTS.md:** "Frontend/Node: use `logger` from `@org/shared-ts/lib/logger/iso-logger` (not `console.*`)."
- **Autofix:** yes (`console.X` → `logger.X` + adds import)
- **Shadow guard:** files declaring `const console = ...` are skipped
- **Shipped in:** #506
- **Enforced in:** #511

### `publy/no-direct-dayjs-in-components`

- **Severity:** `error`
- **Source:** `packages/lint-ts/src/publy/no-direct-dayjs-in-components.ts`
- **Spec:** `packages/lint-ts/src/publy/no-direct-dayjs-in-components.test.ts`
- **AGENTS.md:** "Day.js via `format-time.ts` utilities — never import dayjs directly in components."
- **Autofix:** no
- **Allowed surface:** date/time utility modules such as `apps/front/src/utils/format-time.ts`
- **Shipped in:** #508
- **Enforced in:** #517

### `publy/no-array-reduce`

- **Severity:** `error`
- **Source:** `packages/lint-ts/src/publy/no-array-reduce.ts`
- **Spec:** `packages/lint-ts/src/publy/no-array-reduce.test.ts`
- **AGENTS.md:** "No `Array.reduce()` — use `find`, `filter+map`, `for...of`, or `Object.groupBy`."
- **Autofix:** no
- **Note:** flags both `.reduce(...)` and `.reduceRight(...)` on any receiver, including optional-chaining (`arr?.reduce(...)`) and computed string-literal access (`arr['reduce'](...)`); `unicorn/no-array-reduce` already covers the base case — this rule adds `reduceRight`, bracket-access coverage, and the repo-specific guidance message.
- **Shipped in:** #650
- **Enforced in:** #650 (0 offenders at ship time → enforced immediately)

### `publy/no-manual-response-message-translation`

- **Severity:** `error`
- **Source:** `packages/lint-ts/src/publy/no-manual-response-message-translation.ts`
- **Spec:** `packages/lint-ts/src/publy/no-manual-response-message-translation.test.ts`
- **AGENTS.md:** "Frontend local mutation handlers must derive user-facing error text through `getFailureMessage(toApiFailure(error), ...)`; never translate `response-message` keys manually at the call site."
- **Autofix:** no
- **Shipped in:** #507
- **Enforced in:** #519

### `publy/prefer-query-display`

- **Severity:** `"error"`
- **Source:** `packages/lint-ts/src/publy/prefer-query-display.ts`
- **Spec:** `packages/lint-ts/src/publy/prefer-query-display.test.ts`
- **AGENTS.md:** "Query state rendering uses the shared `QueryDisplay` component rather than a hand-rolled loading/error/empty/data ladder." (normative via `docs/guides/front/conventions.md#query-state-rendering`)
- **Autofix:** no
- **Detection:** flags a component `.tsx` file (relative to `apps/front/src/`) that binds a `use*Query` result — whole binding (`const q = useQuery()`), destructured (`const { isError } = useQuery()`), renamed destructured (`const { isPending: loading } = useQuery()`), rest element (`const { data, ...rest } = useQuery()`), whole-binding alias (`const r = useQuery(); const q = r;`), or destructuring from an already tracked binding — and then reads a query flag (`isPending` / `isLoading` / `isError` / `isSuccess` / `status` / `error`) inside a conditional render (ternary / `&&` / `||` / `if` / early return / `for`/`while` guard). A JSX-returning callback sitting directly in a JSX attribute value or child expression (`<Controller render={(…) => …}>`, `children={() => …}`) is render context and is scanned too; event handlers (`onClick`, `onSubmit`), effect/memo callbacks, and computed prop values (`disabled={q.isPending}`, delegating `isPending={q.isPending}`) are not.
- **Exclusions:** prefix-exact `components/query-display` and `lib/query/`, exactly `routes/__root.tsx`, `routes/authed/layout.tsx`, `routes/accept-invitation.tsx`, and exactly the three DataTable screens `components/table/data-table.tsx`, `components/table/floating-selection-bar.tsx`, `components/table/row-actions.tsx`. Since #1323 there is no directory-wide DataTable exemption — new files under `components/table/` are in scope like any other component.
- **Pinned exemption boundary (#1323):** every exclusion list above is asserted EXACTLY (order included) by `packages/lint-ts/src/publy/prefer-query-display.exemption.test.ts`, together with the real root `.oxlintrc.json` shape (bare `"error"` severity, no per-rule options, no `overrides` re-scoping, no `ignorePatterns` covering a DataTable screen) and the effective boundary (the exempt paths stay silent, everything else reports). Adding an entry, removing one, or replacing a path with a glob turns the suite RED; removals are therefore deliberate, reviewed changes. The DataTable exemption SHRINKS with QueryDisplay PR 3 (DataTable delegating to `resolveTableBodyState` via the `no-match` slot): remove the entry and update the pin in the same PR.
- **Offender baseline before enforcement:** 30 files / 79 diagnostics across `apps/front/src/routes/authed/**` (`isError` 30, `error` 27, `isPending` 19, `isSuccess` 3) — all migrated to `QueryDisplay` or hoisted-local gates; zero diagnostics at enforcement time.
- **Migration idiom:** fatal-error/logout gates read hoisted plain locals (`const detailError = q.error; if (detailError !== null && shouldLogoutForFailure(detailError)) ...`) rather than raw query flags in render-flow conditionals; loading/error/data rendering goes through `QueryDisplay`. DataTable's table-body-state props keep taking locals too.
- **Shipped in:** #1259 (dormant)
- **Enforced in:** PR 2 of #1250 (severity flipped to `"error"` after the known offenders migrated).

### `publy/arrow-function-components`

- **Severity:** `error`
- **Source:** `packages/lint-ts/src/publy/arrow-function-components.ts`
- **Spec:** `packages/lint-ts/src/publy/arrow-function-components.test.ts`
- **AGENTS.md:** "Arrow function components only — never `function` declarations for components."
- **Autofix:** no
- **Detection:** flags `FunctionDeclaration` (or `FunctionExpression` inside `memo`/`forwardRef`) whose name is PascalCase and whose body contains a `return` statement returning JSX (including ternary/logical/TS-wrapped returns), a call to a known renderer (`useRender`, `createElement`, `jsx`, `jsxs`, or `React.xxx` member form), a call to a top-level local helper whose own body yields JSX through any of those routes (#1283 — the declaration shape itself is component evidence, so the renderer list is deliberately NOT treated as an exhaustive detector), a call to a function-valued member of a top-level LOCAL object literal whose own body yields JSX the same way (`kit.customRender()`; static identifier keys only, spread-containing objects are skipped) (#1293), JSX returned through a local variable initialized earlier in the SAME body (`const el = <div/>; return el;`; the initializer may carry ternary/logical/TS-wrapped JSX; reading a property off the variable, e.g. `el.type`, does not count) (#1293), JSX reaching a local ONLY through an assignment statement (`let el = null; el = <div {...p}/>; return el;`; operator `=` with a plain identifier LHS whose RHS may carry ternary/logical/TS-wrapped JSX; member-expression targets and compound operators are never locals) (#1322), or calls at least one React hook and returns only null/JSX; pure helpers and non-PascalCase functions are left un-flagged. Known boundaries: callees that cannot be resolved locally — imports and imported namespaces (`ui.renderPanel()`) — and COMPUTED member accesses (`kit[name]()`) are not followed; local-JSX resolution is statement-order based and deliberately shallow — the LAST JSX-carrying initializer/assignment wins and reassignment order is not modelled (`el = <a/>; el = null; return el;` still counts as JSX-returning)
- **Scope:** the rule never targets class members (methods, getters, static members) — it visits only `FunctionDeclaration`/`FunctionExpression`, so class bodies are untouched and method `this` binding is preserved; pinned by the negative RuleTester case "Class declaration — out of scope for this rule" in `packages/lint-ts/src/publy/arrow-function-components.test.ts`
- **Shipped in:** #653 (dormant)
- **Enforced in:** #1210 (74 baseline offenders across 73 files in `apps/front/src/**/*.tsx`); re-measured in #1283 after widening detection to local JSX-yielding delegates — 0 offenders across `apps/front/src` (config-copy method, oxlint 1.79.0); re-measured in #1293 after resolving JSX through local variables and member-expression delegates — 0 offenders across `apps/front/src` (config-copy method, oxlint 1.79.0, plugin firing verified by an injected probe file); re-measured in #1322 after following assignment-routed JSX — 0 offenders across `apps/front/src` (config-copy method, oxlint 1.79.0, plugin firing verified by an injected probe file)

### `publy/no-iife`

- **Severity:** `error`
- **Source:** `packages/lint-ts/src/publy/no-iife.ts`
- **Spec:** `packages/lint-ts/src/publy/no-iife.test.ts`
- **Rationale (issue #1303):** an IIFE hides imperative branching inside an expression; extract a named function or compute the value with preceding statements instead.
- **Autofix:** no
- **Detection:** flags a `CallExpression`/`NewExpression` whose callee is an inline function literal (`ArrowFunctionExpression`/`FunctionExpression`) after unwrapping transparent wrappers around the callee (`ParenthesizedExpression`, `TSAsExpression`, `TSSatisfiesExpression`, `TSNonNullExpression`, `TSTypeAssertion`, `TSInstantiationExpression`, `SequenceExpression` — the comma-operator form `(0, fn)()`, where the last expression is the effective callee — and since #1327 `ConditionalExpression`/`LogicalExpression`, where BOTH branches/operands are peeled as candidates). Also flags a `TaggedTemplateExpression` whose tag unwraps to a function literal (``(() => x)`t` ``). A callee reports when ANY reachable branch is a function literal (`(cond ? () => 1 : () => 2)()`, `(cond && (() => 3))()`, `(a ?? (() => 4))()`). Callbacks passed as arguments, named-function calls, callees that unwrap to identifiers or to conditional/logical trees with NO function-literal branch, and identifier tags (``css`…` ``) are not flagged.
- **Ported from:** the DigitalPrevention `no-iife` rule.
- **Shipped in / Enforced in:** #1303 (22 baseline offenders across 12 files extracted in the same PR → 0 at enforcement).
- **Re-measured in:** #1327 after peeling conditional/logical callees — 0 offenders across `apps/front/src`, `packages/**`, `apps/front/scripts` (config-copy method, oxlint 1.79.0, plugin firing verified by an injected probe file).

### `publy/route-query-preload`

- **Severity:** `"warn"` (deliberately not `error` — see "Enforced in" below)
- **Source:** `packages/lint-ts/src/publy/route-query-preload.ts`
- **Spec:** `packages/lint-ts/src/publy/route-query-preload.test.ts`
- **Rationale (issue #1589, follow-up of #487):** a route file that calls a TanStack Query hook must declare `staticData.preload` in the same file. The mandatory contract test (`preload-contract.test.tsx`, plan §4 of `docs/records/2026-08-26-plan-preload-routes.md`) walks the REAL generated route tree and fails on any orphan preload key — but it can only see routes that already declare preload. This rule is the cheap first gate for the OTHER half: a query-consuming route that never declares `staticData.preload` is invisible to the contract test by construction.
- **Autofix:** no
- **Detection:** flags a file under `apps/front/src/routes/` (`.ts`/`.tsx`, tests/specs excluded) that calls a route query hook (`useQuery` exactly, or `/^use[A-Z].*\wQuery$/` — `useStaffTenantDetailsQuery`, `useSuspenseQuery`, `useInfiniteQuery`; deliberately not `useQueryClient` / `usePreloadQueries`) and does NOT contain a `preload` property nested inside a `staticData` object literal. One diagnostic per file, named with a concrete hook. Aliases are followed wherever a static reader can: named imports (`import { useQuery as uq }`), variable assignments (`const uq = useQuery`), destructuring (`const { useQuery: uq } = ...`), require chains (`const uq = require(...).useQuery`), alias chains resolved to a fixpoint at `Program:exit`, and namespace member calls from query modules (`RQ.useQuery(...)` — the diagnostic names the full member text, not just the property). When a route file binds a name from a query module (`@tanstack/react-query` or a path containing `lib/query/`) in a way the rule cannot resolve to a canonical hook name (default import, whole-module `require`) and then CALLS it, the rule reports a dedicated `unresolvedHookCall` diagnostic — an undecidable entry fails loudly, never silently (a motivated escape comment silences it).
- **Escape comments:** oxlint's native `oxlint-disable` directives, which `check-oxlint-disables.ts` requires to name the rule and carry a reviewable reason. The documented escapes are #487's secondary / interaction-triggered query classes (drawer, tab, preview data that must NOT be route-preloaded).
- **Exclusions:** exactly `routes/__root.tsx`, `routes/authed/layout.tsx`, `routes/accept-invitation.tsx` (auth/routing surfaces where the preload hook mounts in the app shell instead — mirrors `prefer-query-display`'s allowlist), test/spec files, and anything outside `routes/`.
- **Offender baseline before enforcement (2026-08-30, measure collée dans le PR #1589):** 51 route files / 51 diagnostics across `apps/front/src/routes/**` (one diagnostic per file). Zero `staticData.preload` declarations exist on the tree — the preload mechanism (plan T1–T7) has not landed yet; this number is the migration backlog it measures.
- **Shipped in:** #1589 (warning level; invisible to `pnpm lint --quiet` until the mechanism lands).


## Anti-slop rules (`packages/lint-ts/src/anti-slop/`, vendored from dmmulroy/anti-slop)

The 15 `anti-slop/*` rules are installed **neutral** (all `off`) and released as a **ladder**: one rule per PR, switched straight to `error` with every violation in the repo fixed in that same PR — never a `warn` stage, never a baseline of tolerated hits. The measured baseline per rule lives on issue #1160; pick the next rung from it. A PR that enables a rule must show `pnpm lint` green repo-wide at its tip.

### Enabled rules

| `anti-slop/no-conditional-empty-object-spread` | `error` | 30 (fixed) | #1170 (rung 1) |
| `anti-slop/no-object-parameters` | `error` | 0 | rung 2 |
| `anti-slop/no-reflect-apply` | `error` | 0 | rung 2 |
| `anti-slop/no-reflect-get` | `error` | 0 | rung 2 |
| `anti-slop/no-unknown-type-aliases` | `error` | 0 | rung 2 |
| `anti-slop/no-widen-then-assert` | `error` | 0 | rung 2 |
| `anti-slop/no-shape-in-symbol-names` | `error` | 69 (fixed) | rung 3 |
| `anti-slop/no-unknown-returns` | `error` | 73 (fixed) | rung 4 |
| `anti-slop/no-chained-type-assertions` | `error` | 126 (fixed) | rung 5 |

### Candidate next rung: `publy/no-never-any-casts` (#1337)

Rungs 4+5 cover only CHAINED assertions; #1337 showed single, non-chained
casts to the evidence-discarding keywords slipping through. The vendored
anti-slop set has no keyword-ban rule (`no-chained-type-assertions` owns the
chain shape only), so a small `publy` rule was sketched:
[`packages/lint-ts/src/publy/no-never-any-casts.ts`](../../packages/lint-ts/src/publy/no-never-any-casts.ts).
It flags single assertions to `never`/`any` (`x as never`, `x as any`,
angle-bracket forms, parenthesized keyword annotations), one report per chain
link landing on a banned keyword. Since [#1346](https://github.com/PublyApp/publyapp/issues/1346)
it ALSO flags the keyword annotations under the `satisfies` operator
(`x satisfies never`, `x satisfies any`, `TSSatisfiesExpression`) — paired
RED/GREEN proof in its spec, including the adversarial case that defeats a
matcher hunting the literal word `never` instead of the `TSNeverKeyword` node
(`type NeverAlias = never; x satisfies NeverAlias` stays GREEN). It shipped
**dormant** (`"off"`) through the fix slices and is now **enforced at
`error`** (see the rung record below).

**Measured baseline (2026-08-25, oxlint 1.79.0, re-measured at the
wt-1346 tip AFTER the #1346 `satisfies` extension):** report-mode scan over
the whole repo (config-copy of `.oxlintrc.json` with only this rule flipped
to `warn`; JSON output aggregated per package). Command + measured result:

```sh
python3 -c 'import json; c = json.load(open(".oxlintrc.json")); c["rules"]["publy/no-never-any-casts"] = "warn"; json.dump(c, open(".oxlintrc.tmp-1346.json", "w"), indent=1)'
pnpm exec oxlint -c .oxlintrc.tmp-1346.json -f json . \
  | python3 -c 'import sys, json, collections; n = [e for e in json.load(sys.stdin)["diagnostics"] if "no-never-any-casts" in e["code"]]; print(len(n)); print(collections.Counter("/".join(e["filename"].split("/")[:2]) for e in n))'
rm .oxlintrc.tmp-1346.json
```

→ prints `177` and `Counter({'apps/front': 154, 'packages/shared-ts': 15,
'packages/lint-ts': 8})` (scan data kept out of the tree).

| Package               | Diagnostics |
| --------------------- | ----------- |
| `apps/front`          | 154         |
| `packages/shared-ts`  | 15          |
| `packages/lint-ts`    | 8           |
| `packages/scripts-ts` | 0           |
| `apps/api`            | 0           |
| **Total**             | **177**     |

All 177 hits are `as never`; **zero** `as any` casts exist in linted source
(every word-boundary `as any` site lives in the generated
`apps/front/src/routeTree.gen.ts`, excluded via `ignorePatterns`, and
explicit `any` annotations are already governed by
`typescript/no-explicit-any`). The #1346 `satisfies` extension adds ZERO new
offenders: a regex scan for `satisfies\s+(never|any)` over linted source
returns 10 matching lines, all inside the rule's own spec and implementation
(fixture/comment text), none in shipped code. Counts reconcile against
literal `\bas never\b` greps: 222 matching lines repo-wide (`git grep -w`)
= 177 real casts + 45 comment/doc mention lines (largest: a superseded
superpowers plan at 25, this rule's own spec and implementation at 10).
The 177 casts sit in 49 files — 29 test/spec files and 20 source files;
heaviest:
`staff-tenant-profiles.test.ts` 26, `staff-tenant-users.test.ts` 21,
`staff-tenant-invitations.test.ts` 14, `InterZod.ts` 8,
`query-display.test.tsx` 6, `drafts.tsx` 6. The `packages/lint-ts` 8 are
genuine lib sites (`run-oxlint.test.ts` 6, `run-oxlint.ts` 1,
`no-package-src-import.ts` 1), not spec fixtures.

**Enable-at-error ladder plan (#1346):** fix in slices — one slice per PR,
each keeping the rule `off` and shrinking the warn-scan total above; the
final PR flips `.oxlintrc.json` to `"error"` once the scan reports 0 and
proves the guard red on a reintroduced single `x satisfies never` cast
(then removes it). Measured slice sizes at the same tip:

| Slice | Scope | Sites | Owner |
| ----- | ----- | ----- | ----- |
| A | `apps/front/src/lib/query/**` (validator-stub tests: staff-tenant-profiles 26, staff-tenant-users 21, staff-tenant-invitations 14, …) | 70 | front lane |
| B | `apps/front/src/**` remaining test/spec files | 64 | front lane |
| C | `apps/front/src/**` non-test sources (heaviest: `drafts.tsx` 6) | 20 | front lane |
| D | `packages/shared-ts/src/**` (heaviest: `InterZod.ts` 8) | 15 | shared lane |
| E | `packages/lint-ts/src/**` (`run-oxlint.test.ts` 6, `run-oxlint.ts` 1, `no-package-src-import.ts` 1) | 8 | lint-ts lane |
| | **Total** | **177** | |

Slice owners were the dispatching captain's lane assignments at execution
time (see `~/ai-orchestration-playbook/PLAYBOOK.md`); a slice may be split
further if one PR grows past review comfort. At the error rung BOTH
assertion spellings are banned — `as never`/`as any` AND
`satisfies never`/`satisfies any` — because of the #1346 coverage.

**Rung executed (2026-08-25, #1346):** all five slices landed; the
enable-at-error PR flipped the rule to `"error"` with the same warn-scan
command reporting **0** diagnostics across all five scopes at its tip. Paired
RED proof performed there: a single planted `const x = {} as never;` in
`apps/front/src` turned `oxlint` exit non-zero naming
`publy/no-never-any-casts`, then was reverted. The severity cannot be
silently lowered: `publy/no-never-any-casts` is pinned in `PUBLY_RULES` by
[`packages/lint-ts/src/publy/lint-scoping.test.ts`](../../packages/lint-ts/src/publy/lint-scoping.test.ts)
alongside the other enforced `publy/*` rules.

## Guard test suites (`apps/front/src`, not lint rules)

These enforce repo invariants as vitest suites rather than linter diagnostics, but belong in this
reference because a reviewer looking for "what enforces X" ends up here. Each entry names its
detection surface and its pinned boundaries; the normative home for front guards is
[`docs/guides/front/conventions.md`](front/conventions.md).

### real-`<Trans>` render guard

- **Enforced:** vitest suite, pinned into CI by `check-ci-gate-structure`
- **Source:** `apps/front/src/lib/i18n/trans-render.guard.test.tsx`
- **Guide:** [`docs/guides/front/conventions.md`](front/conventions.md) ("<Trans> render guard")
- **What it catches:** every JSX `<Trans>` element under `apps/front/src` must resolve to a
  pinned spec that renders through its real route component and the real i18n init — a new call
  site without a spec turns red naming `file:line`; dropped `components={{ strong: … }}` maps,
  copy drift, and parser regressions flip dedicated pins.
- **Detection:** AST walk (ts-morph vendored compiler) matching JSX tags against every local name
  bound to react-i18next's `Trans` (plain, aliased, default-import spelled `Trans`, namespace
  member tags), excluding the suite itself (`*.test.*` / `*.spec.*` / `*.stories.*`), `*.d.ts`,
  and `e2e/`. A spread-only `<Trans {...props} />` IS discovered (#1333 — tag match first,
  attributes second): it lands unpinned with `i18nKey: null` exactly like any uncovered site.
- **Pinned boundaries (#1333):** spreads on non-`Trans` elements contribute zero sites; a
  `Trans` re-exported through a local module is NOT resolved (the one true residual blind spot,
  does not exist in src today — both facts pinned by standing tests so any change must update the
  disclosure deliberately).

## Roslyn analyzers (`packages/lint-cs/`)

Each rule has an ID, descriptor in `DiagnosticCatalog.cs`, and is referenced in `.editorconfig`. `isEnabledByDefault: false` ships dormant; `.editorconfig` flips to `warning` for enforcement (`TreatWarningsAsErrors=true` makes warning a build error).

### `PUBLY0001` — null-forgiving operator `!`

- **Severity in `.editorconfig`:** `warning` (enforced)
- **Source:** `packages/lint-cs/NullForgivingOperatorAnalyzer.cs`
- **Spec:** `packages/lint-cs/NullForgivingOperatorAnalyzer.Spec.cs`
- **AGENTS.md:** "Never use the null-forgiving operator (`!`) in production code — always handle null explicitly with guard clauses or safe accessors like `GetRequiredId()`."
- **Shipped in:** #464
- **Enforced in:** #495

### `PUBLY0002` — `?? throw`

- **Severity in `.editorconfig`:** `warning` (enforced)
- **Source:** `packages/lint-cs/CoalesceThrowAnalyzer.cs`
- **Spec:** `packages/lint-cs/CoalesceThrowAnalyzer.Spec.cs`
- **AGENTS.md:** "Never use `?? throw` — use traditional `if` guard clauses for null-then-throw patterns."
- **Shipped in:** #505
- **Enforced in:** #513

### `PUBLY0003` — `ToLower()` / `ToLowerInvariant()` for comparison/dispatch

- **Severity in `.editorconfig`:** `warning` (enforced)
- **Source:** `packages/lint-cs/ToLowerForComparisonAnalyzer.cs`
- **Spec:** `packages/lint-cs/ToLowerForComparisonAnalyzer.Spec.cs`
- **AGENTS.md:** "Never use `ToLower()` / `ToLowerInvariant()` as a comparison or dispatch strategy; use `StringComparison.OrdinalIgnoreCase`, `StringComparer.OrdinalIgnoreCase`, or explicit case-insensitive parsers/dictionaries instead."
- **Shipped in:** #503
- **Enforced in:** #515

### `PUBLY0004` — `Dto` suffix on handler contract types

- **Severity in `.editorconfig`:** `warning` (enforced)
- **Source:** `packages/lint-cs/DtoSuffixHandlerContractAnalyzer.cs`
- **Spec:** `packages/lint-cs/DtoSuffixHandlerContractAnalyzer.Spec.cs`
- **AGENTS.md:** "Handler HTTP wire-contract types (the `Body`/`Query`/`Result`/`Response`/`Item` siblings) must not carry a `Dto` suffix."
- **Shipped in:** #596
- **Enforced in:** #600

### `PUBLY0005` — inline FluentValidation chains on `JsonElement` getters

- **Severity in `.editorconfig`:** `warning` (enforced)
- **Source:** `packages/lint-cs/InlineFluentValidationChainAnalyzer.cs`
- **Spec:** `packages/lint-cs/InlineFluentValidationChainAnalyzer.Spec.cs`
- **AGENTS.md:** "Validators: use `JsonElementRules.*` extension methods (never inline validation chains)."
- **Strategy:** HYBRID — recurring shapes extracted to `JsonElementRules.*` shared helpers or module `Validation/` helpers; bespoke array/object validators folded into `.Custom` blocks (not flagged by the analyzer).
- **Shipped in:** #601
- **Enforced in:** #601

### `PUBLY0006` — uncached request DTO getter calls

- **Severity in `.editorconfig`:** `warning` (enforced)
- **Source:** `packages/lint-cs/UncachedBodyGetterAnalyzer.cs`
- **Spec:** `packages/lint-cs/UncachedBodyGetterAnalyzer.Spec.cs`
- **AGENTS.md:** "In handlers, cache body DTO getter results in locals when they are used 2+ times or return parsing-sensitive values like `PatchField<T>`, trimmed strings, parsed timestamps, or parsed enums."
- **Shipped in:** #591
- **Enforced in:** #602

### `PUBLY0007` — staff handlers must call `*ForStaff*` service variants

- **Severity in `.editorconfig`:** `warning` (enforced)
- **Source:** `packages/lint-cs/StaffHandlerServiceVariantAnalyzer.cs`
- **Spec:** `packages/lint-cs/StaffHandlerServiceVariantAnalyzer.Spec.cs`
- **AGENTS.md:** "Staff handlers MUST use `*ForStaff*` service method variants (e.g., `GetTenantByIdForStaffAsync`) — base methods filter suspended entities."
- **Shipped in:** #598
- **Enforced in:** #603

### `PUBLY0008` — pattern-matching null checks (`is null` / `is not null`)

- **Severity in `.editorconfig`:** `warning` (enforced)
- **Source:** `packages/lint-cs/EqualityNullCheckAnalyzer.cs`
- **Spec:** `packages/lint-cs/EqualityNullCheckAnalyzer.Spec.cs`
- **AGENTS.md:** "Pattern matching for null checks (`is null` / `is not null`, never `== null`)."
- **Note:** skips expression-tree contexts (method-syntax `Expression<…>` lambdas and `IQueryable` query-comprehension clauses) where `is null` is a CS8122 compile error.
- **Shipped in:** #599
- **Enforced in:** #604

### `PUBLY0009` — Avoid TypedResults.Forbid()

- **Severity in `.editorconfig`:** `warning` (enforced)
- **Source:** `packages/lint-cs/TypedResultsForbidAnalyzer.cs`
- **Spec:** `packages/lint-cs/TypedResultsForbidAnalyzer.Spec.cs`
- **AGENTS.md:** "All errors use `TypedProblems.*` (RFC 7807), never `TypedResults.Forbid()`."
- **Strategy:** syntactic name-based match on the `TypedResults` receiver + `Forbid` member (bare `TypedResults.Forbid()` and fully-qualified `Microsoft.AspNetCore.Http.TypedResults.Forbid()`); reported at the `Forbid` name; generated code skipped. 0-offender regression guard ships enforced.
- **Shipped in:** #649
- **Enforced in:** #649

### `PUBLY0010` — never log session-token values

- **Severity in `.editorconfig`:** `warning` (enforced)
- **Source:** `packages/lint-cs/SessionTokenLoggingAnalyzer.cs`
- **Spec:** `packages/lint-cs/SessionTokenLoggingAnalyzer.Spec.cs`
- **AGENTS.md:** "Never log secrets: do not log `X-Session-Token` (or any session token value) in any log level."
- **Strategy:** CONSERVATIVE security regression guard (0 offenders, ships enforced). Fires only on a logging call (`Log*`/`BeginScope` on an `*logger*`-shaped receiver) whose arguments reference the `SessionToken` identifier/member vocabulary or the literal `X-Session-Token` header name. Does NOT fire on generic terms like `token`, `Authorization`, or `csrf`.
- **Exemptions:**
  - **Anonymous-object property names:** the `NameEquals` label in `new { HasSessionToken = expr }` is a syntactic label, not a value expression — it is skipped. Only the value side is examined.
  - **Null-presence checks:** an occurrence of a session-token identifier or member used solely as the operand of a null check (`M is null`, `M is not null`, `M == null`, `M != null`, `null == M`, `null != M`) yields a `bool`, not the token value, and is exempt. The exemption is per-occurrence: a ternary like `sessionToken is not null ? sessionToken : "none"` is still flagged because the `sessionToken` in the whenTrue branch flows the value to the logger.

### `PUBLY0011` — mapped endpoints require an explicit rate-limit disposition

- **Severity in `.editorconfig`:** `warning` (enforced)
- **Source:** `packages/lint-cs/EndpointRateLimitAnalyzer.cs`
- **Spec:** `packages/lint-cs/EndpointRateLimitAnalyzer.Spec.cs`
- **AGENTS.md:** "Every mapped endpoint must declare or inherit a named rate-limit policy, carry the explicit global-only marker, or carry an opt-out marker with a non-empty reason."
- **Strategy:** inspects Minimal API mapping calls and their fluent registration chain or local route-group initializer. An unprotected mapping is reported; `.RequireRateLimiting(...)` with a registered constant policy, the approved anonymous-auth policy helpers, `.WithGlobalRateLimitOnly()`, and `.WithRateLimitOptOut("reason")` satisfy the rule. Unknown or misspelled policy names are rejected.
- **Runtime companion:** `EndpointRateLimitMetadataGuard.Spec.cs` builds the real route map and proves group-level policy metadata reaches every endpoint.
- **Shipped in:** #952
- **Enforced in:** #952

## How to add a new rule

See the Phase-2 PRs (#463 for the JS scaffold pattern, #464 for the Roslyn scaffold pattern). The short version:

First, a custom rule must pass the hard bespoke-guard admission policy in
[`test-conventions.md`](test-conventions.md#bespoke-guard-admission-hard-rule). Without that proof,
do not scaffold the rule.

1. Pick an ID — `publy/<kebab-name>` for JS or `PUBLY00XX` for .NET.
2. Mirror an existing rule's structure file-for-file.
3. Write a co-located spec (oxlint test file or `*.Spec.cs`).
4. Register in `packages/lint-ts/src/index.ts` + `.oxlintrc.json` (JS) or
   `packages/lint-cs/DiagnosticCatalog.cs` + `DiagnosticIds.cs` +
   `AnalyzerReleases.Unshipped.md` (.NET).
5. Fix all current offenders and enable the rule in the same PR. Do not ship a new rule dormant and
   create an enforcement follow-up.

If the cleanup is too broad to land safely with the rule, stop. Land the independently justified
code cleanup first, then propose the guard only after the tree is clean.
