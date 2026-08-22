Closes #1168

Owner request (2026-08-22): open an e2e chantier like Digital Preventions (#1168).

## What changed

1. **Coverage guide** (docs/guides/e2e-coverage.md) — five decidable criteria for does this change need an e2e test.
2. **Tags** (docs/guides/e2e-tags.md) — closed domain vocabulary. Every top-level test.describe carries @domain and @ticket.
3. **Tag runner** — pnpm --filter front test:e2e:tag wraps playwright test --grep.
4. **Guard** (e2e/__tests__/tag-guard.ts + e2e-tag-guard.test.ts) — hand-written scanner (string/template/regex-aware), positional range nesting detection, closed vocabulary enforcement.

## R2 fixes

| Item | Fix |
|---|---|
| MAJOR: closed vocabulary | Any @tag not in KNOWN_DOMAINS, @untracked, or @digits fails the guard |
| MAJOR: nested describes | Positional ranges find every test.describe at any column |
| MEDIUM: @untracked reason | Inline reason comments in auth-redirect-guard + cold-boot-stability |
| MEDIUM: @806 attribution | All 18 @806 specs verified via git log --follow to 2714a4c2a (#806) |

## Spec inventory

| Spec | Domain(s) | Ticket(s) |
|---|---|---|
| auth-error.spec.ts | @auth @security | @713 |
| auth-redirect-guard.spec.ts | @auth | @untracked |
| auth-screens.spec.ts | @auth | @806 |
| breadcrumb-entity-name-truncation.spec.ts | @shell | @973 |
| cold-boot-stability.spec.ts | @auth | @untracked |
| csp.spec.ts | @public | @713 |
| design-chrome-fixes.spec.ts | @design | @806 |
| design-handoff-foundation.spec.ts | @design | @806 |
| design-handoff-staff-profiles.spec.ts | @design @staff-profiles | @806 |
| drawer-description-contrast.spec.ts | @design | @1043 |
| drawer-form-scroll-geometry.spec.ts | @design | @990 |
| field-validation.spec.ts | @design | @721 |
| form-action-bar-clearance.spec.ts | @design | @806 |
| gray-ui-screenshot-capture.spec.ts | @design @shell | @untracked |
| i18n-namespaces.spec.ts | @i18n | @909 |
| i18n.spec.ts | @i18n | @713 |
| locale-switch.spec.ts | @i18n | @806 |
| log-leak.spec.ts | @security | @733 |
| logout.spec.ts | @auth | @806 |
| parity-happy-path.spec.ts | @staff-dashboard | @723 |
| profile-icon-picker-pin-contrast.spec.ts | @design @staff-profiles | @992 |
| profile-icon-picker-pin-geometry.spec.ts | @design @staff-profiles | @992 |
| request-counter.spec.ts | @security | @806 |
| row-actions-centering.spec.ts | @shell | @806 |
| search-input-native-cancel-suppression.spec.ts | @shell | @975 |
| seo.spec.ts | @public | @713 |
| shell.spec.ts | @shell | @713 |
| smoke.spec.ts | @public | @733 |
| ssr-auth-shell.spec.ts | @security | @997 |
| staff-invitations.spec.ts | @staff-invitations | @742 |
| staff-profiles.spec.ts | @staff-profiles | @744 |
| staff-tenant-create.spec.ts | @staff-tenants | @806 |
| staff-tenant-details.spec.ts | @staff-tenants | @806 |
| staff-tenant-edit.spec.ts | @staff-tenants | @806 |
| staff-tenants.spec.ts | @staff-tenants | @806 |
| staff-user-details.spec.ts | @staff-users | @806 |
| table-scroll-ownership.spec.ts | @shell | @806 |
| table.spec.ts | @shell @staff-users | @720 |
| tab-refocus-stability.spec.ts | @auth | @806 |
| tab-sync.spec.ts | @auth | @806 |
| tenant-portal-picker.spec.ts | @staff-tenants | @806 |
| toast-contrast.spec.ts | @design | @1078 |

## R3 fixes

| Item | Fix |
|---|---|
| False negative: describe modifiers | Scanner now recognises `test.describe.serial/parallel/only/skip/fixme` and chained forms (`.serial.only`) — any describe missing tags is caught |
| False negative: function callbacks | Scanner now recognises `function () {}` callbacks, not only `() => {}` |
| Fail loud on unknown shapes | Any describe call whose callback shape is not an arrow or function expression produces an explicit error (never silently ignored) |
| Over-claim: AST/compiler API | Replaced "AST-based (TypeScript compiler API)" with truth: hand-written tokenizer, string/template/regex/comment-aware with positional nesting |
| Doc wording: top-level rule | e2e-tags.md now states explicitly: every sequential top-level describe needs tags; nested describes inherit and need none |
| Paired proof | `.dump/proof-r3.md` — red/green evidence (old scanner 7/7 fail → new scanner 7/7 pass + 42 existing pass) |

## R4 fixes

| Item | Fix |
|---|---|
| Silent false negative: error never asserted | `e2e-tag-guard.test.ts` now fails if ANY record from `analyzeFile` carries `error` — not only on missing tags on top-level describes |
| DescribeInfo.describePos | Added `describePos?: number` to the exported `DescribeInfo` interface so error records carry position for diagnostics |
| Error message: position | Error message now includes `at position ${describePos}` for precise location reporting |
| Paired proof | `.dump/proof-r4.md` — throwaway unsupported shape added to smoke.spec.ts: GREEN before fix (42/42 pass), RED after (1 fail with explicit message), throwaway removed |
