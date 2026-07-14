# W4-UA report

## Finding F1 (BLOCKER) — staff-user edit hydration race
- **Files changed**
  - `apps/front-2/src/routes/authed/staff/staff-users/$userId-edit.tsx`
  - `apps/front-2/src/routes/authed/staff/staff-users/$userId-edit.test.tsx`
- **What changed**
  - Added a query-completion gate and equality check before form hydration:
    - waits for both `detailsQuery.isSuccess` and `assignedProfilesQuery.isSuccess` (and `assignedProfilesQuery.data !== undefined`) before `reset`.
    - avoids re-hydrating when form is dirty.
    - avoids resetting with the same `profileIds` values.
  - Kept hydration aligned to current `userId` and recomputes when the query snapshot changes.
  - Regression test now drives details and assignments out of order (`details` pending first, then empty assignments, then real assignments) and asserts both profile checkboxes are checked after assignments resolve.
- **Verification**
  - `pnpm --filter front-2 exec vitest run src/routes/authed/staff/staff-users/$userId-edit.test.tsx` → 1/1 test case failed when the old race pattern was temporarily restored.
    - `AssertionError: expected false to be true` at `staffUsersEdit ... expects Publishing checkbox checked`.
    - failure context showed the page rendered with `profileIds` remaining empty (`Publishing` and `Billing` unchecked) after the later assignments query resolved.
  - With final fix reapplied, required packet test set passes: 66/66 in lane-wide targeted run.

## Finding F2 — CSV formula-injection in staff bulk export
- **Files changed**
  - `apps/front-2/src/routes/authed/staff/staff-list-export-selected.tsx`
  - `apps/front-2/src/routes/authed/staff/staff-list-export-selected.test.tsx`
- **What changed**
  - Added neutralization for formula-like prefixes (`= + - @`) after leading whitespace/control stripping before RFC-4180 quoting.
  - Extended tests for quoted prefixed payloads, whitespace+prefix, and ordinary fields.
- **Verification**
  - `pnpm --filter front-2 exec vitest run src/routes/authed/staff/staff-list-export-selected.test.tsx`

## Finding F3 — accept invitation redirect retry idempotency
- **Files changed**
  - `apps/front-2/src/routes/accept-invitation.tsx`
  - `apps/front-2/src/routes/accept-invitation.test.tsx`
- **What changed**
  - Submission now caches accepted result (`acceptedResult`) and does not re-call accept after redirect errors.
  - Added retry behavior that retries only redirect/login navigation.
  - Added test where first `completeLoginRedirect` fails, then second click only retries redirect and keeps one accept call.
- **Verification**
  - `pnpm --filter front-2 exec vitest run src/routes/accept-invitation.test.tsx`

## Finding F4 — distinguish auth-lookup failures on invitation route
- **Files changed**
  - `apps/front-2/src/routes/accept-invitation.tsx`
  - `apps/front-2/src/routes/accept-invitation.test.tsx`
- **What changed**
  - `useInvitationAuthState` now maps 401 to `anonymous` and all other lookup failures to `auth-lookup-error`.
  - Branch render and tests now cover 401 vs non-401 vs matching/ mismatching branches.
- **Verification**
  - `pnpm --filter front-2 exec vitest run src/routes/accept-invitation.test.tsx`

## Finding F5 — profile details members query is now explicit and actionable
- **Files changed**
  - `apps/front-2/src/routes/authed/staff/profiles/$profileId.tsx`
  - `apps/front-2/src/routes/authed/staff/profiles/$profileId.test.tsx`
- **What changed**
  - Added members preview pending/loading/error/retry handling for users query.
  - 403 and generic failures now have distinct states.
  - Preserved `LogoutRedirect` for 401 via `shouldLogoutForFailure`.
  - `no-members-yet` now only renders on successful empty users payload.
- **Verification**
  - `pnpm --filter front-2 exec vitest run src/routes/authed/staff/profiles/$profileId.test.tsx`

## Finding F6 — profile detail action controls corrected
- **Files changed**
  - `apps/front-2/src/routes/authed/staff/profiles/$profileId.tsx`
  - `apps/front-2/src/routes/authed/staff/profiles/$profileId.test.tsx`
- **What changed**
  - Removed dead action buttons/links; only real action remains (View all users) and points to `/staff/profiles/$profileId/users`.
  - Added tests asserting no fake “Edit permissions” and correct list-user destination.
- **Verification**
  - `pnpm --filter front-2 exec vitest run src/routes/authed/staff/profiles/$profileId.test.tsx`

## Finding F7 — invitation row actions respect lifecycle state
- **Files changed**
  - `apps/front-2/src/routes/authed/staff/invitations/table-columns.tsx`
  - `apps/front-2/src/routes/authed/staff/invitations/table-columns.test.tsx`
- **What changed**
  - Actions now check `row.status === 'pending'`; non-pending states call `onActionError` with explicit toast text and do not invoke mutations.
  - Revoke path now handles eligibility with user feedback.
  - Added table action coverage for all statuses.
- **Verification**
  - `pnpm --filter front-2 exec vitest run src/routes/authed/staff/invitations/table-columns.test.tsx`

## Finding F8 — assigned profile users remediation sweep
- **Files changed**
  - `apps/front-2/src/routes/authed/staff/profiles/$profileId/users.tsx`
  - `apps/front-2/src/routes/authed/staff/profiles/$profileId/users.test.tsx`
- **What changed**
  - Identity column is now a `publy-record-link` to `/staff/staff-users/$userId`.
  - Status uses shared `formatStaffStatusLabel` + `StatusPill`.
  - Expanded status locale tests for EN/FR and missing enum fallback.
- **Verification**
  - `pnpm --filter front-2 exec vitest run src/routes/authed/staff/profiles/$profileId/users.test.tsx`

## Finding F9 — invitation profile badge radius
- **Files changed**
  - `apps/front-2/src/routes/authed/staff/invitations/$invitationId.tsx`
- **What changed**
  - Verified and kept profile badge radius tokenized (`rounded-[var(--publy-radius-chip)]`) with no `rounded-full`.
- **Verification**
  - Static check via file inspection and targeted route changes in packet scope.

## Verification matrix
- `npx oxlint --quiet <all owned files>` → 0 errors, only 3 warnings.
- `pnpm --filter front-2 exec vitest run <all owned test files>` → 6 passed, 66 tests.
- `pnpm --filter front-2 typecheck` → exits non-zero due pre-existing / non-owned front-2 failures only:
  - `src/components/ui/copy-button.test.tsx`
  - `src/components/ui/select.test.tsx`
  - `src/routes/authed/staff/tenants/$tenantId/profiles.test.tsx`
  - `src/routes/authed/staff/tenants/$tenantId/users.test.tsx`
- `just build-api` → succeeded.
- `dotnet test apps/api/Tests/PublyApp.Api.Tests.csproj -c Test` → passed (1102/1102).

## Handoffs
- `NONE`.

## Disputed
- `NONE`.

## Brief errors
- `NONE`.
