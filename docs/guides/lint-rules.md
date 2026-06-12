# PublyApp Lint Rules — Reference

This guide enumerates every custom lint rule in the repo. For the framework design and roadmap context, see [#350](https://github.com/radandevist/publyapp/issues/350).

## Custom Oxlint rules (`packages/lint-ts/`)

Each rule is exposed under the `publy/*` namespace and registered in `.oxlintrc.json`. Severity = `"error"` means enforced; `"off"` means dormant (rule ships and tests pass but produces no diagnostics).

### `publy/prefer-specific-lodash-imports`

- **Severity:** `error`
- **Source:** `packages/lint-ts/src/rules/prefer-specific-lodash-imports.js`
- **Spec:** `packages/lint-ts/src/rules/prefer-specific-lodash-imports.test.js`
- **AGENTS.md:** "Import specific helpers such as `lodash/map`, `lodash/trim`, `lodash/isEqual`, and `lodash/capitalize` instead of the full `lodash` package."
- **Autofix:** yes (value-only named imports → specific subpath imports; `.mjs`-aware)
- **Shipped in:** #463
- **Enforced in:** #463

### `publy/no-console-in-source`

- **Severity:** `error`
- **Source:** `packages/lint-ts/src/rules/no-console-in-source.js`
- **Spec:** `packages/lint-ts/src/rules/no-console-in-source.test.js`
- **AGENTS.md:** "Frontend/Node: use `logger` from `@org/shared-ts/lib/logger/iso-logger` (not `console.*`)."
- **Autofix:** yes (`console.X` → `logger.X` + adds import)
- **Shadow guard:** files declaring `const console = ...` are skipped
- **Shipped in:** #506
- **Enforced in:** #511

### `publy/no-raw-mui-textfield-register`

- **Severity:** `error`
- **Source:** `packages/lint-ts/src/rules/no-raw-mui-textfield-register.js`
- **Spec:** `packages/lint-ts/src/rules/no-raw-mui-textfield-register.test.js`
- **AGENTS.md:** "React Hook Form + Zod for form validation — always use `Form`/`Field.*` wrappers from `@/front/components/hook-form`, never raw MUI `TextField` with `register()`."
- **Autofix:** no
- **Shipped in:** #504
- **Enforced in:** #521

### `publy/no-direct-dayjs-in-components`

- **Severity:** `error`
- **Source:** `packages/lint-ts/src/rules/no-direct-dayjs-in-components.js`
- **Spec:** `packages/lint-ts/src/rules/no-direct-dayjs-in-components.test.js`
- **AGENTS.md:** "Day.js via `format-time.ts` utilities — never import dayjs directly in components."
- **Autofix:** no
- **Allowed surface:** date/time utility modules such as `apps/front/src/utils/format-time.ts`
- **Shipped in:** #508
- **Enforced in:** #517

### `publy/no-native-html-in-mui-surfaces`

- **Severity:** `error`
- **Source:** `packages/lint-ts/src/rules/no-native-html-in-mui-surfaces.js`
- **Spec:** `packages/lint-ts/src/rules/no-native-html-in-mui-surfaces.test.js`
- **AGENTS.md:** "MUI v6 only — never native HTML elements (`<div>` → `<Box>`, `<h1>` → `<Typography variant=\"h1\">`)."
- **Autofix:** no
- **Scope notes:** product surfaces only; marketing surfaces and inline SVG are intentionally excluded
- **Shipped in:** #509
- **Enforced in:** #523

### `publy/no-raw-img-in-product-surfaces`

- **Severity:** `error`
- **Source:** `packages/lint-ts/src/rules/no-raw-img-in-product-surfaces.js`
- **Spec:** `packages/lint-ts/src/rules/no-raw-img-in-product-surfaces.test.js`
- **AGENTS.md:** "Content imagery (photos, avatars, hero illustrations) must use the `<Image>` primitive ... with a `ratio` prop — never raw `<img>` or `<Box component=\"img\">`."
- **Autofix:** no
- **Scope notes:** product surfaces only; marketing surfaces, brand wordmark/logo paths, inline SVG, and explicit full-bleed background comment opt-outs are intentionally excluded
- **Shipped in:** #526
- **Enforced in:** #526

### `publy/no-array-reduce`

- **Severity:** `error`
- **Source:** `packages/lint-ts/src/rules/no-array-reduce.js`
- **Spec:** `packages/lint-ts/src/rules/no-array-reduce.test.js`
- **AGENTS.md:** "No `Array.reduce()` — use `find`, `filter+map`, `for...of`, or `Object.groupBy`."
- **Autofix:** no
- **Note:** flags both `.reduce(...)` and `.reduceRight(...)` on any receiver, including optional-chaining (`arr?.reduce(...)`) and computed string-literal access (`arr['reduce'](...)`); `unicorn/no-array-reduce` already covers the base case — this rule adds `reduceRight`, bracket-access coverage, and the repo-specific guidance message.
- **Shipped in:** #650
- **Enforced in:** #650 (0 offenders at ship time → enforced immediately)

### `publy/no-manual-response-message-translation`

- **Severity:** `error`
- **Source:** `packages/lint-ts/src/rules/no-manual-response-message-translation.js`
- **Spec:** `packages/lint-ts/src/rules/no-manual-response-message-translation.test.js`
- **AGENTS.md:** "Frontend local mutation handlers must derive user-facing error text through `getFailureMessage(toApiFailure(error), ...)`; never translate `response-message` keys manually at the call site."
- **Autofix:** no
- **Shipped in:** #507
- **Enforced in:** #519

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

### `PUBLY0010` — never log session-token values

- **Severity in `.editorconfig`:** `warning` (enforced)
- **Source:** `packages/lint-cs/SessionTokenLoggingAnalyzer.cs`
- **Spec:** `packages/lint-cs/SessionTokenLoggingAnalyzer.Spec.cs`
- **AGENTS.md:** "Never log secrets: do not log `X-Session-Token` (or any session token value) in any log level."
- **Strategy:** CONSERVATIVE security regression guard (0 offenders, ships enforced). Fires only on a logging call (`Log*`/`BeginScope` on an `*logger*`-shaped receiver) whose arguments reference the `SessionToken` identifier/member vocabulary or the literal `X-Session-Token` header name. Does NOT fire on generic terms like `token`, `Authorization`, or `csrf`.
- **Exemptions:**
  - **Anonymous-object property names:** the `NameEquals` label in `new { HasSessionToken = expr }` is a syntactic label, not a value expression — it is skipped. Only the value side is examined.
  - **Null-presence checks:** an occurrence of a session-token identifier or member used solely as the operand of a null check (`M is null`, `M is not null`, `M == null`, `M != null`, `null == M`, `null != M`) yields a `bool`, not the token value, and is exempt. The exemption is per-occurrence: a ternary like `sessionToken is not null ? sessionToken : "none"` is still flagged because the `sessionToken` in the whenTrue branch flows the value to the logger.

## How to add a new rule

See the Phase-2 PRs (#463 for the JS scaffold pattern, #464 for the Roslyn scaffold pattern). The short version:

1. Pick an ID — `publy/<kebab-name>` for JS or `PUBLY00XX` for .NET.
2. Mirror an existing rule's structure file-for-file.
3. Write a co-located spec (oxlint test file or `*.Spec.cs`).
4. Register in `packages/lint-ts/src/index.js` + `.oxlintrc.json` (JS) or `packages/lint-cs/DiagnosticCatalog.cs` + `DiagnosticIds.cs` + `AnalyzerReleases.Unshipped.md` (.NET).
5. Ship **dormant** (`"off"` / `isEnabledByDefault: false`).
6. Open a follow-up enforcement PR that refactors all existing offenders and flips the rule on.
