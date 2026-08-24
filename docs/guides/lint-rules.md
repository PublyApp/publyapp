# PublyApp Lint Rules — Reference

This guide enumerates every custom lint rule in the repo. For the framework design and roadmap context, see [#350](https://github.com/radandevist/publyapp/issues/350).

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

- **Severity:** `"off"` (dormant)
- **Source:** `packages/lint-ts/src/publy/prefer-query-display.ts`
- **Spec:** `packages/lint-ts/src/publy/prefer-query-display.test.ts`
- **AGENTS.md:** "Query state rendering uses the shared `QueryDisplay` component rather than a hand-rolled loading/error/empty/data ladder." (normative via `docs/guides/front/conventions.md#query-state-rendering`)
- **Autofix:** no
- **Detection:** flags a component `.tsx` file (relative to `apps/front/src/`) that binds a `use*Query` result — whole binding (`const q = useQuery()`), destructured (`const { isError } = useQuery()`), renamed destructured (`const { isPending: loading } = useQuery()`), rest element (`const { data, ...rest } = useQuery()`), whole-binding alias (`const r = useQuery(); const q = r;`), or destructuring from an already tracked binding — and then reads a query flag (`isPending` / `isLoading` / `isError` / `isSuccess` / `status` / `error`) inside a conditional render (ternary / `&&` / `||` / `if` / early return / `for`/`while` guard). A JSX-returning callback sitting directly in a JSX attribute value or child expression (`<Controller render={(…) => …}>`, `children={() => …}`) is render context and is scanned too; event handlers (`onClick`, `onSubmit`), effect/memo callbacks, and computed prop values (`disabled={q.isPending}`, delegating `isPending={q.isPending}`) are not.
- **Exclusions:** `components/query-display`, `components/table/`, `lib/query/`, and exactly `routes/__root.tsx`, `routes/authed/layout.tsx`, `routes/accept-invitation.tsx`.
- **Offender baseline at ship time:** 30 files / 79 diagnostics across `apps/front/src/routes/authed/**` (`isError` 30, `error` 27, `isPending` 19, `isSuccess` 3). Includes `_invite-profile-select.tsx` (named in issue #1250) via the render-prop detection; every file named in issue #1250 that this rule can see is flagged except `_profile-overview-tab.tsx` (a props-carrier whose query flags originate in `$profileId.tsx`, which is flagged).
- **Verifying while dormant:** `oxlint -D publy/prefer-query-display` silently no-ops for jsPlugin rules on oxlint 1.79.0; flip severity on a copy of `.oxlintrc.json` instead (`"error"` for the rule) and run `pnpm exec oxlint --config .oxlintrc.error.json apps/front/src`.
- **Shipped in:** #1259 (dormant)
- **Enforced in:** future PR that flips severity to `"error"` after the known offenders migrate to `QueryDisplay`.

### `publy/arrow-function-components`

- **Severity:** `error`
- **Source:** `packages/lint-ts/src/publy/arrow-function-components.ts`
- **Spec:** `packages/lint-ts/src/publy/arrow-function-components.test.ts`
- **AGENTS.md:** "Arrow function components only — never `function` declarations for components."
- **Autofix:** no
- **Detection:** flags `FunctionDeclaration` (or `FunctionExpression` inside `memo`/`forwardRef`) whose name is PascalCase and whose body contains a `return` statement returning JSX (including ternary/logical/TS-wrapped returns), a call to a known renderer (`useRender`, `createElement`, `jsx`, `jsxs`, or `React.xxx` member form), a call to a top-level local helper whose own body yields JSX through any of those routes (#1283 — the declaration shape itself is component evidence, so the renderer list is deliberately NOT treated as an exhaustive detector), a call to a function-valued member of a top-level LOCAL object literal whose own body yields JSX the same way (`kit.customRender()`; static identifier keys only, spread-containing objects are skipped) (#1293), JSX returned through a local variable initialized earlier in the SAME body (`const el = <div/>; return el;`; the initializer may carry ternary/logical/TS-wrapped JSX; reading a property off the variable, e.g. `el.type`, does not count) (#1293), or calls at least one React hook and returns only null/JSX; pure helpers and non-PascalCase functions are left un-flagged. Known boundaries: callees that cannot be resolved locally — imports and imported namespaces (`ui.renderPanel()`) — and COMPUTED member accesses (`kit[name]()`) are not followed
- **Scope:** the rule never targets class members (methods, getters, static members) — it visits only `FunctionDeclaration`/`FunctionExpression`, so class bodies are untouched and method `this` binding is preserved; pinned by the negative RuleTester case "Class declaration — out of scope for this rule" in `packages/lint-ts/src/publy/arrow-function-components.test.ts`
- **Shipped in:** #653 (dormant)
- **Enforced in:** #1210 (74 baseline offenders across 73 files in `apps/front/src/**/*.tsx`); re-measured in #1283 after widening detection to local JSX-yielding delegates — 0 offenders across `apps/front/src` (config-copy method, oxlint 1.79.0); re-measured in #1293 after resolving JSX through local variables and member-expression delegates — 0 offenders across `apps/front/src` (config-copy method, oxlint 1.79.0, plugin firing verified by an injected probe file)

## Anti-slop rules (`packages/lint-ts/src/anti-slop/`, vendored from dmmulroy/anti-slop)

The 15 `anti-slop/*` rules are installed **neutral** (all `off`) and released as a **ladder**: one rule per PR, switched straight to `error` with every violation in the repo fixed in that same PR — never a `warn` stage, never a baseline of tolerated hits. The measured baseline per rule lives on issue #1160; pick the next rung from it. A PR that enables a rule must show `pnpm lint` green repo-wide at its tip.

### Enabled rules

| Rule | Severity | Baseline violations | Enabled in |
|------|----------|-------------------|------------|
| `anti-slop/no-conditional-empty-object-spread` | `error` | 30 (fixed) | #1170 (rung 1) |
| `anti-slop/no-object-parameters` | `error` | 0 | rung 2 |
| `anti-slop/no-reflect-apply` | `error` | 0 | rung 2 |
| `anti-slop/no-reflect-get` | `error` | 0 | rung 2 |
| `anti-slop/no-unknown-type-aliases` | `error` | 0 | rung 2 |
| `anti-slop/no-widen-then-assert` | `error` | 0 | rung 2 |
| `anti-slop/no-shape-in-symbol-names` | `error` | 69 (fixed) | rung 3 |

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

1. Pick an ID — `publy/<kebab-name>` for JS or `PUBLY00XX` for .NET.
2. Mirror an existing rule's structure file-for-file.
3. Write a co-located spec (oxlint test file or `*.Spec.cs`).
4. Register in `packages/lint-ts/src/index.ts` + `.oxlintrc.json` (JS) or `packages/lint-cs/DiagnosticCatalog.cs` + `DiagnosticIds.cs` + `AnalyzerReleases.Unshipped.md` (.NET).
5. Ship **dormant** (`"off"` / `isEnabledByDefault: false`).
6. Open a follow-up enforcement PR that refactors all existing offenders and flips the rule on.
