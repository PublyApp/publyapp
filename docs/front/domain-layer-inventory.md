# Domain Layer Extraction Inventory (Frontend)

This is a working list of frontend code that likely contains “product rules” and should be considered for extraction into `apps/front/app/lib/domain/**`.

Notes:
- This is **not** a refactor plan; it’s an inventory of candidates.
- Not everything listed must move; prioritize duplication and cross-screen rules.
- Domain should return **codes/decisions**, not translated strings or UI colors.

## Invitations

- `apps/front/app/routes/authed/tenant/settings/invitations/tenant-settings-invitations-page.tsx`
  - Candidate: invitation “derived status” (pending/accepted/expired/revoked), expiry logic, allowed actions (`canResend`, `canRevoke`).
  - Proposed domain: `apps/front/app/lib/domain/shared/invitations/*`

- `apps/front/app/routes/authed/staff/invitations/details/staff-invitation-details-page.tsx`
  - Candidate: `InvitationStatus` modeling and status-to-severity mapping (`getStatusColor`).
  - Proposed domain: `apps/front/app/lib/domain/shared/invitations/*`

- `apps/front/app/routes/authed/staff/invitations/list/staff-invitations-list-page.tsx`
  - Candidate: (commented) expiry logic and status derivation.
  - Proposed domain: `apps/front/app/lib/domain/shared/invitations/*`

## Users / Members

Repeated “user status” interpretations appear in multiple places and are strong candidates for centralization:

- `apps/front/app/routes/authed/staff/staff-members/list/parts/staff-members-table.tsx`
  - Candidate: mapping `USER_STATUS_ENUM` -> semantic status category; “pending user” gating (`isUserPending`) for actions.
  - Proposed domain: `apps/front/app/lib/domain/shared/users/status/*`

- `apps/front/app/routes/authed/tenant/settings/members/tenant-settings-members-page.tsx`
  - Candidate: mapping `USER_STATUS_ENUM` -> semantic category.
  - Proposed domain: `apps/front/app/lib/domain/shared/users/status/*`

- `apps/front/app/routes/authed/staff/profiles/details/users/staff-profile-details-users-tab-page.tsx`
  - Candidate: mapping `USER_STATUS_ENUM` -> semantic category.
  - Proposed domain: `apps/front/app/lib/domain/shared/users/status/*`

- `apps/front/app/routes/authed/staff/staff-members/details/components/staff-member-update-form.tsx`
  - Candidate: status option lists / status constraints (if any emerge).
  - Proposed domain: `apps/front/app/lib/domain/shared/users/status/*`

## Tenants

- `apps/front/app/routes/authed/staff/tenants/list/parts/tenants-table.tsx`
  - Candidate: mapping `TENANT_STATUS_ENUM` -> semantic category; quota semantics around `usersCount` vs `maxUsers` (when plan rules are implemented).
  - Proposed domain: `apps/front/app/lib/domain/staff/tenants/status/*` and/or `.../limits/*`

- `apps/front/app/routes/authed/staff/tenants/details/users/parts/tenant-users-table.tsx`
  - Candidate: user status interpretation (currently uses string statuses directly).
  - Proposed domain: `apps/front/app/lib/domain/shared/users/status/*`

## Posts

- `apps/front/app/routes/authed/tenant/posts/list/posts-list-page.tsx`
  - Candidate: post status options/labels/categories (draft/scheduled/published).
  - Proposed domain: `apps/front/app/lib/domain/tenant/posts/status/*`

## Scheduling (optional)

- `apps/front/app/routes/authed/tenant/schedule/schedule-page.tsx`
  - Candidate: shared filtering/grouping logic (e.g. “posts for day”, “platform filter”) if reused across list/calendar views.
  - Keep in UI: calendar grid rendering, icon/color maps, date formatting.

## Permissions + authorization modeling

- `apps/front/app/routes/authed/staff/profiles/new/parts/new-staff-profile-form.tsx`
  - Candidate: `transformPermissionsData(...)` (DTO normalization from API shape to module/slice shape).
  - Proposed domain: `apps/front/app/lib/domain/staff/permissions/mappers/*`

- `apps/front/app/components/nav-section/**/nav-list.tsx`
- `apps/front/app/layouts/dashboard/layout.tsx`
- `apps/front/app/routes/authed/staff/profiles/details/basics/parts/staff-profile-sidebar.tsx`
  - Candidate: role-based visibility rules (`allowedRoles` + `checkPermissions` usage).
  - Proposed domain: `apps/front/app/lib/domain/shared/authz/nav-visibility/*`

## DTO -> view-model mappers (optional)

These mappers are currently local to tables; extract only if they become shared or duplicated:

- `apps/front/app/routes/authed/staff/staff-members/list/parts/staff-members-table.tsx` (`StaffMemberRowDataMapper`)
- `apps/front/app/routes/authed/staff/tenants/list/parts/tenants-table.tsx` (`TenantRowDataMapper`)
- `apps/front/app/routes/authed/staff/profiles/list/parts/staff-profiles-table.tsx` (`StaffProfileRowDataMapper`)
