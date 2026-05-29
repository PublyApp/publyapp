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
- **AGENTS.md:** "Frontend/Node: use `logger` from `@/shared/lib/logger/iso-logger` (not `console.*`)."
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

## How to add a new rule

See the Phase-2 PRs (#463 for the JS scaffold pattern, #464 for the Roslyn scaffold pattern). The short version:

1. Pick an ID — `publy/<kebab-name>` for JS or `PUBLY00XX` for .NET.
2. Mirror an existing rule's structure file-for-file.
3. Write a co-located spec (oxlint test file or `*.Spec.cs`).
4. Register in `packages/lint-ts/src/index.js` + `.oxlintrc.json` (JS) or `packages/lint-cs/DiagnosticCatalog.cs` + `DiagnosticIds.cs` + `AnalyzerReleases.Unshipped.md` (.NET).
5. Ship **dormant** (`"off"` / `isEnabledByDefault: false`).
6. Open a follow-up enforcement PR that refactors all existing offenders and flips the rule on.
