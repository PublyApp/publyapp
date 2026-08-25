# #820 — Selection-mode bulk management actions (design)

Date: 2026-08-25 · Lane: wt-820 · Status: approved design for this lane's slice

## Problem

The four round-7 staff surfaces named in the issue offer only **Export** in
row-selection mode; the bulk management actions the API already supports were
dropped during the front-2 migration.

## Inventory (verified 2026-08-25)

Surfaces with row selection (`useRowSelection` + selection toolbar):

| Surface | Toolbar today | Bulk API contract |
|---|---|---|
| `staff/staff-users.tsx` | Export only (`StaffListExportSelectedAction`) | **Exists**: `POST /staff/users/bulk-suspend` / `bulk-reactivate` / `bulk-delete` (`Modules/Users/Handlers/Staff/Bulk*StaffUsers.cs`, permission-gated, kiota client exposes `client.staff.users.bulk{Suspend,Reactivate,Delete}`) |
| `staff/profiles.tsx` | Export only | Exists: `POST /staff/profiles/bulk-delete` |
| `staff/invitations/index.tsx` | Export only | Exists: `POST /staff/invitations/bulk-revoke` |
| `staff/profiles/$profileId/users.tsx` | **No selection mode at all** | No bulk endpoint exists |

All other selection surfaces (tenants, tenant users, tenant profiles,
tenant-user organizations) already ship their bulk actions
(`TenantBulkActions`, `ProfileBulkActions`, …) — they are the reference
implementation and match `docs/guides/bulk-action-ux-conventions.md`.

**No backend extension is required** for this slice: every endpoint the first
surface needs already exists with handler specs, `.WithPermission()` gating,
openapi.json entries and a regenerated kiota client. The issue is purely that
front never wired them into the selection toolbar.

## Slice decision (bounded per lane rules)

Ship end-to-end: **shared staff-users surface** (`staff/staff-users.tsx`) —
the first surface named in the issue. Follow-up issues (opened from the PR):
profiles bulk-delete wiring, invitations bulk-revoke wiring, and the
profile-users surface (needs both selection mode and a new bulk-unassign
endpoint → backend-first work).

## Design

### State / components

- New route-local component
  `routes/authed/staff/staff-users/_list-bulk-actions.tsx`:
  `StaffUsersListBulkActions({ rows, selection, onSessionExpired })`,
  rendered as a second child of the page's existing `FloatingSelectionBar`
  next to the export button. It follows `TenantBulkActions`
  (`staff/tenants.tsx`) exactly:
  - A "More actions" dropdown trigger gated ONLY on
    `selectedCount > BULK_ACTION_MAX_COUNT` (disabled + i18n tooltip).
  - Menu items Suspend / Reactivate / Delete render unconditionally;
    the click handler enforces eligibility and raises the per-action
    ineligible toast instead of hiding/disabling items.
  - Destructive actions require `ConfirmDialog` before firing.
  - Split try/catch in the mutation hook: only `mutateAsync` inside try;
    failure → `displayLocalMutationFailure(error, t('<action>-failure'))`
    (transparent cause, never a generic message); 401 → `onSessionExpired`;
    success clears selection, invalidates via `invalidateStaffUsers`, toasts
    success or partial-success with counts.

### Eligibility (mirrors server-side per-item rules)

Statuses arrive as raw backend strings (`"Active"` / `"Suspended"`); normalize
lowercase-trim like `status-labels.ts`.

- Suspend → selected ids with status `active`.
- Reactivate → selected ids with status `suspended`.
- Delete → selected ids with status `suspended`.

### Data layer

Add to `lib/query/staff-users.ts` three mutation options + hooks
(`useBulk{Suspend,Reactivate,Delete}StaffUsersMutation`) built with
`buildStaffMutationOptions`, `silentSuccess + skipGlobalErrorHandler` meta
(local toolbar owns feedback), keys nested under `STAFF_USERS_QUERY_KEY`,
body built with `createUntypedArray/String` (`{ userIds }`) exactly like the
tenants module. No client-ts edits (generated package untouched).

### i18n

Every string already exists in BOTH `common.en.json` and `common.fr.json`
(confirmations `bulk-*-staff-users-confirm`, results
`staff-user-bulk-*-success/-partial-success/-failure`, eligibility toasts
`bulk-*-disabled-*`, `more-actions`, `bulk-action-max-count-exceeded`). No new
keys → no locale edits; the i18n key-coverage gate proves resolution.

### Permissions note

The staff app has no client-side permission catalogue today (all staff
surfaces render their actions and let `WithPermission` 403s flow through the
central ApiFailure handling — see tenants.tsx precedent). Visibility therefore
mirrors the server at surface level; per-key UI gating would be a new
mechanism, out of scope here.

## Tests (TDD, paired proof)

1. RED first: `staff-users/staff-users-bulk-routing.test.tsx` — real TanStack
   router harness (`mountRealRoute` precedent from `$userId-edit.blocker.test.tsx`)
   asserting the selection toolbar exposes the bulk-management actions, not
   only export (#820's exact complaint), and driving one action through the
   real route component.
2. Component suite `staff-users/_list-bulk-actions.test.tsx`:
   unconditional menu rendering, over-cap trigger state, ineligible click →
   warning toast + no dialog, confirmed happy path (ids scoped to eligible
   rows, invalidate + clear + toast), partial-success toast, failure toast
   fallback, 401 logout path.
3. Existing suites keep guarding the rest (i18n coverage, mutation-feedback
   architecture scan, QueryDisplay rules). No e2e locally (CI runs front-e2e).

## Gates

`pnpm --filter front test`, `pnpm --filter front typecheck`, `pnpm lint`,
`pnpm format`, `just ci-drift` under `heavy.sh`; API suite not required (no
API change). Small commits; PR to `develop` with `Closes #820` + follow-ups.
