Closes #1202

## What

Move all source code in `packages/shared-ts/` under `src/` with the package exports mapped to `./src/*.ts`.

## Changes

- **Move commit**: `lib/`, `utils/`, `validations/`, `types/`, `@types/`, `scripts/` → `src/`
- **Config commit**: exports, postinstall, vitest, tsconfig, Dockerfile, csproj, lint-ts rules, docs

## Proof: consumer imports unchanged

| Check | Result |
|-------|--------|
| `git grep -c '@org/shared-ts/src'` | 0 matches |
| `pnpm --filter front typecheck` | ✅ green |
| `pnpm --filter shared-ts test` | ✅ 82/82 |
| `pnpm --filter lint-ts test` | ✅ green |
| `pnpm --filter front build` | ✅ green |
| `pnpm lint` | ✅ green |
| `node scripts/check-ci-drift.mjs` | ✅ green |

## Pre-existing (not introduced by this change)

| Check | Note |
|-------|------|
| `pnpm format` | `search-cancel-css-policy.test.mjs` format issue exists on `develop` |
| `just knip` | Duplicate export notices in `constants.ts`, `auth.validations.ts` — pre-existing |
| `pnpm --filter front test` | 1 flaky timeout in `drawer-form.test.tsx` (scanner test) — pre-existing |

## Grep checklist

Every `git grep` hit for `packages/shared-ts/` (excluding `pnpm-lock.yaml`, `docs/archive`, `node_modules`) was either updated or justified:

| File | Status |
|------|--------|
| `apps/api/Dockerfile` | ✅ updated |
| `apps/api/PublyApp.Api.csproj` | ✅ updated |
| `apps/api/Modules/Invitations/Handlers/Staff/BulkRevokeStaffInvitations.cs` | ✅ updated |
| `apps/front/tsconfig.json` | ✅ updated |
| `apps/front/src/lib/i18n.backend.ts` | ✅ updated |
| `apps/front/scripts/search-cancel-css-policy.test.mjs` | ✅ updated |
| `packages/lint-ts/src/rules/no-console-in-source.js` | ✅ updated |
| `packages/lint-ts/src/rules/no-console-in-source.test.js` | ✅ updated |
| `AGENTS.md` (structure comment) | ✅ updated |
| `DESIGN.md` | ✅ updated |
| `docs/guides/architecture-details.md` | ✅ updated |
| `docs/guides/bulk-action-ux-conventions.md` | ✅ updated |
| `docs/guides/common-workflows.md` | ✅ updated |
| `docs/guides/project-conventions.md` | ✅ updated |
| `apps/front/e2e/*.ts` | ✅ unchanged — `@org/shared-ts/lib/...` imports work via exports map |
| `apps/front/src/**/*.ts(x)` | ✅ unchanged — `@org/shared-ts/lib/...` imports work via exports map |
| `.github/workflows/*.yml` | ✅ unchanged — glob patterns still match `packages/shared-ts/**` |
| `docs/audits/*.md` | ✅ justified — archived records, not live rules |
| `docs/superpowers/reviews/*.md` | ✅ justified — archived records, not live rules |

---

*Generated with [jcode](https://github.com/1jehuang/jcode) — model: mimo-v2.5 max*
