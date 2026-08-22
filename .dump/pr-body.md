## Summary

Rewrites `@org/lint-ts` from JavaScript to TypeScript with real types (no `any`, no `@ts-expect-error`), and migrates the test suite from `node:test` to **vitest** (4.1.9, matching shared-ts).

Closes #1201

## What changed

- **git mv** all `src/**/*.js` → `.ts` (rules, index, path-scopes)
- **TypeScript types** for every rule file: `Context` and `Visitor` from `@oxlint/plugins`, typed helper functions, typed `Fixer`/`Fix` for autofix rules. No `any`, no `@ts-expect-error`.
- **tsconfig.json** extending `packages/_tsconfig/tsconfig.base.json` with `allowImportingTsExtensions`
- **vitest 4.1.9** for all tests (same version as shared-ts), `vitest.config.ts`
- **`.ts` imports** in all source and test files (oxlint Node ESM loader resolves `.ts`)
- **Wire-up**: `.oxlintrc.json` jsPlugins → `.ts`, `package.json` main/exports → `.ts`, root format globs include `ts`, `docs/guides/lint-rules.md` paths updated

## Based on

Based on `origin/chore/1172-lint-ts-dead-old-front-paths` (PR #1194 not merged at time of work). The 1172 dead-old-front-paths changes are merged into this branch.

## Paired proof — plugin still fires

| Rule | Severity | Fires? | vitest |
|------|----------|--------|--------|
| `publy/no-array-reduce` | error | ✅ | ✅ 32 |
| `publy/no-console-in-source` | error | ✅ | ✅ 29 |
| `publy/no-direct-dayjs-in-components` | error | ✅ | ✅ 29 |
| `publy/no-manual-response-message-translation` | error | ✅ | ✅ 16 |
| `publy/prefer-specific-lodash-imports` | error | ✅ | ✅ 51 |
| `publy/arrow-function-components` | off | ⚠️ dormant | ✅ 177 |
| `publy/no-op` | off | ⚠️ dormant | ✅ 8 |
| Path scoping matrix | — | — | ✅ 15 |

**320/320 tests pass.**

## Gates

- [x] `pnpm --filter lint-ts test` — 320/320 pass
- [x] `pnpm --filter lint-ts typecheck` — green
- [x] `pnpm lint` — green (oxlint loads .ts plugin, all publy/* rules active)
- [x] `pnpm format` — green
- [x] `pnpm --filter front typecheck` — green
- [x] `node scripts/check-ci-drift.mjs` — green

## Unverified items

- CI `gh pr checks` — will run after push

## Model attribution

mimo-v2.5 max via jcode
