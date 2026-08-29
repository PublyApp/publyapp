# 2026-08-29 — review: i18n for icon visibility guard messages (#1842)

## Context

PR #1842 fixes issue #1799 (the icon visibility guard). The measurement-based
guard body in `apps/front/src/components/table/data-table-icon-visibility-guard.ts`
produces error messages with four hardcoded English strings:

1. `"icon has aria-hidden=\"true\""`
2. `"icon has computed visibility:hidden"`
3. `"icon has computed display:none"`
4. `"icon has computed opacity:0"`

These bypass the app's i18n pipeline. The `i18n-key-coverage` static-analysis
guard (`findHardcodedUiLiterals`) flags any prose literal in a `message`-property
position (the `COPY_LIKE_ATTRIBUTE_NAME_PATTERN` matches `message`). The
strings must be wrapped in `t()` calls and locale keys added to both
`en/common.json` and `fr/common.json`.

## What the guard produces

The guard is a `.ts` module (not a `.tsx` React component), so it cannot use
`useTranslation`. It imports the `i18next` singleton directly:

```ts
import i18n from 'i18next';
```

Each message site calls `i18n.t('icon-hidden-aria', { context })` — the
`context` parameter is interpolated via `{{context}}` in the locale value,
preserving the original "context: reason" shape so test regex assertions
(`/aria-hidden/`, `/visibility:hidden/`, `/display:none/`, `/opacity:0/`)
still match.

## Locale keys added

`apps/front/src/i18n/locales/en/common.json`:

```json
"icon-hidden-aria": "icon has aria-hidden=\"true\"",
"icon-hidden-visibility": "icon has computed visibility:hidden",
"icon-hidden-display": "icon has computed display:none",
"icon-hidden-opacity": "icon has computed opacity:0",
"icon-guard-context-null": "{{context}}: icon element is null"
```

`apps/front/src/i18n/locales/fr/common.json`:

```json
"icon-hidden-aria": "l'icône a aria-hidden=\"true\"",
"icon-hidden-visibility": "l'icône a visibility:hidden calculé",
"icon-hidden-display": "l'icône a display:none calculé",
"icon-hidden-opacity": "l'icône a opacity:0 calculé",
"icon-guard-context-null": "l'élément d'icône est nul"
```

## Test wiring

The guard is consumed by two vitest test files. Both already mocked
`react-i18next` with a hand-rolled `t` function returning English labels from
a `TestLabelMap`. Since the guard now imports `i18next` (the core singleton,
not `react-i18next`), both test files were updated to also `vi.mock('i18next')`:

- `apps/front/tests/proofs/1799/red-1799-icon-visibility-guard.test.tsx`
- `apps/front/src/components/table/data-table-selection-integration.test.tsx`

The mock is hoisted via `vi.hoisted()` because `vi.mock` factories are hoisted
above all imports — any reference to a variable declared after the mock would
trigger `ReferenceError: Cannot access 'X' before initialization`.

The mock `t` function is shared between the `react-i18next` and `i18next`
mocks so both return identical translations. The icon-guard keys were added
to the same `TestLabelMap` so the mock `t` returns them when the guard calls
`i18n.t(...)`.

## E2E spec (unaffected)

The real-browser e2e spec
(`apps/front/e2e/data-table-icon-visibility-guard.spec.ts`) renders the
DataTable through Vite SSR using the real `common.json` resources, so its
translations are already production-faithful. The e2e spec's inline
`assertIconVisibleToBrowser` function (which runs inside `page.evaluate`)
does not call the guard module — it re-implements the measurement logic for
a cross-check against the real browser engine. It does not need the
i18n mock.

## Verification

- **1799 proof test** (`tests/proofs/1799/red-1799-icon-visibility-guard.test.tsx`)
  against the fixed measurement-based guard: 2/5 RED (`opacity-0` and
  `aria-hidden` assertions use `.not.toThrow()` to assert the bug is present;
  the guard raises, violating that assertion); 3/5 GREEN (baseline, `invisible`,
  `hidden`). RED replay: swapping the guard back to the buggy classList
  enumeration makes all 5 pass (bug present, as the proof demands).

- **1802 proof test** (`tests/proofs/1802/red-1802-catch-accuses-wrong-command.test.ts`)
  against the fixed two-try/catch `run-preuves.mts`: 1/1 RED (the proof asserts
  the buggy single-try structure exists; the fix removed it).

- **1829 proof test** (`tests/proofs/1829/red-1829-switch-not-independently-testable.test.ts`)
  against the fixed code with `consume-verdict.mts` present: 1/1 RED (the proof
  asserts the module does not exist; the fix added it).

- **1824 consume-verdict unit tests** (`scripts/ci/consume-verdict.test.ts`):
  15/15 green — cover all five verdict branches and the OK↔ERROR swap mutation.

- `pnpm --filter front exec vitest run src/components/table/data-table-selection-integration.test.tsx` — 5/5 green.
- `pnpm --filter front exec vitest run --config vitest.design-guards.config.ts` (includes `i18n-key-coverage`) — 55/55 green; no hardcoded literals in the guard, all `t()` call keys resolve in both locale bundles.
- `npx tsc --noEmit -p tsconfig.json` — clean.
- `npx oxlint` + `npx oxfmt --check` on changed files — clean.
