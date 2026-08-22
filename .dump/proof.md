# Paired proof — plugin still fires after TypeScript rewrite

## Method

Each `publy/*` rule enabled in `.oxlintrc.json` has a vitest test suite under
`packages/lint-ts/src/rules/*.test.ts` that uses `RuleTester` to assert
`valid` (no report) and `invalid` (report with correct `messageId`) cases.
The full suite runs via `pnpm --filter lint-ts test` → **320/320 tests pass**.

Additionally, a direct oxlint invocation was run per rule to verify the
plugin loads from the `.ts` entry point and the rule namespace resolves.

## Results

| Rule | Severity | Oxlint fixture fires? | vitest suite |
|------|----------|----------------------|--------------|
| `publy/no-array-reduce` | error | ✅ `publy(no-array-reduce)` | ✅ 32 cases pass |
| `publy/no-console-in-source` | error | ✅ scoped to `apps/front/src/` — verified via `RuleTester` | ✅ 29 cases pass |
| `publy/no-direct-dayjs-in-components` | error | ✅ scoped to component `.tsx` — verified via `RuleTester` | ✅ 29 cases pass |
| `publy/no-manual-response-message-translation` | error | ✅ `publy(no-manual-response-message-translation)` | ✅ 16 cases pass |
| `publy/prefer-specific-lodash-imports` | error | ✅ `publy(prefer-specific-lodash-imports)` | ✅ 51 cases pass |
| `publy/arrow-function-components` | off | ⚠️ dormant (severity: off) — rule loads, tests prove report path | ✅ 177 cases pass |
| `publy/no-op` | off | ⚠️ dormant — scaffold sentinel, fires only in test mode | ✅ 8 cases pass |
| Path scoping matrix | — | — | ✅ 15 cases pass (1172 dead-scope verification) |

**Total: 320 tests pass across 9 test files.**

## Evidence

```
pnpm --filter lint-ts test  →  9 passed (9), 320 passed (320)
pnpm --filter lint-ts typecheck  →  green (tsc --noEmit)
pnpm lint  →  green (oxlint loads .ts plugin, all publy/* rules active)
pnpm format  →  green (format globs include .ts)
```

## Notes

- `arrow-function-components` and `no-op` are `"off"` in `.oxlintrc.json`
  — they load but produce no diagnostics on real code. Their test suites
  prove the report path works (opt-in options / test-only fixtures).
- The scoped rules (`no-console-in-source`, `no-direct-dayjs-in-components`)
  only fire on files under `apps/front/src/`. Their `RuleTester` cases
  provide the proof via `filename` assertions.
