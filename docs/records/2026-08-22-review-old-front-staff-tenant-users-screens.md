Status: Archived
Original location: docs/old-front/screens/staff-tenant-users.md
Archive reason: Retired apps/old-front on 2026-08-22; reference preserved before deletion (tag old-front-final).
Superseded by: none

# Staff tenant-users global pages (old-front)

> Source: `apps/old-front/src/routes/authed/staff/tenant-users/**` + `packages/shared-ts/validations/tenant-user.validations.ts`. Two detail tabs (general + organizations) under staff scope.

## Routes

| Path | File | Notes |
|---|---|---|
| /staff/tenant-users | (no list route — global list is not in old-front; access is via other surfaces) | Tenant-users list is **not** a standalone routed page in old-front (unlike staff-users/tenants). The global surface is the detail only. |
| /staff/tenant-users/details/:userId | _redirects/tenant-user-details-index-redirect-page.tsx | Index redirect -> general (keeps /details/:userId bookmarkable) |
| /staff/tenant-users/details/:userId/general | details/general/tenant-user-details-general-page.tsx | Identity edit form |
| /staff/tenant-users/details/:userId/organizations | details/organizations/tenant-user-details-organizations-page.tsx | Company memberships table + link drawer |
| fallback | _errors/tenant-user-details-fallback-tab-page.tsx | Unknown tab |

## Layout and data

- Layout: `tenant-user-details-layout.tsx` — fetches `useGetTenantUserById({ userId })` (clientLoader hydrates zod ns), renders `SidebarSettingsLayout` with nav items `general` and `organizations`. Handles 400 (malformed-id) -> 404, 404 -> 404, else generic error. Title from getUserFullName or email.
- Breadcrumbs: `tenant-user-details-breadcrumbs.tsx`.
- Skeleton: `tenant-user-details-page-skeleton.tsx`.

## General tab — fields / columns / actions

- Form: `tenant-user-update-form.tsx` — fields: firstName, lastName, email (identity), avatar (file|string), status chip. Company count display. Submit updates identity via staff tenant-user endpoint.
- Cache helpers: `tenant-user-companies-cache.ts` (invalidates companies query on identity change).
- Danger zone: reducer `tenantUserDangerZoneReducer` (suspend/unsuspend/delete flows — check form file for exact transitions).

## Organizations tab — columns / actions

- Table: `tenant-user-companies-table.tsx` — columns for company memberships (name, status, role, etc.). Uses cursor pagination (cursor/limit/sort via nuqs useQueryStates), selection actions for bulk unlink. Export dialog: `tenant-user-companies-export-dialog-controller.tsx`.
- Row actions: link/unlink company, export.
- Link drawer: `tenant-user-link-company-drawer.tsx` — fetches TenantAsStaffListItem options, dedup logic for fetchedOptions.
- Selection: `tenant-user-companies-selection-actions.tsx` — bulk unlink (max 100, BULK_ACTION_MAX_COUNT), permission-checked.
- Filters: search via queryStates, status/date filters where present.

## Validation — zod schemas (verbatim)

```ts
import { ACCOUNT_LEVEL_ENUM } from '@org/shared-ts/lib/constants';
import type InterZod from '@org/shared-ts/lib/zod/InterZod';

import { getFileSchemaClientSide } from './file/file-client.validations';

export const getUpdateTenantUserSchema = (z: InterZod) => {
	return z.object({
		id: z.string(),
		tenantId: z.string(),
		firstName: z.string().min(1).optional(),
		lastName: z.string().min(1).optional(),
		avatar: getFileSchemaClientSide(z).or(z.string()).optional(),
		level: z
			.enum([ACCOUNT_LEVEL_ENUM.ADMIN, ACCOUNT_LEVEL_ENUM.USER] as const)
			.optional(),
	});
};

export const getUpdateTenantUserIdentitySchema = (z: InterZod) => {
	return z.object({
		id: z.string(),
		firstName: z.string().min(1).optional(),
		lastName: z.string().min(1).optional(),
		avatar: getFileSchemaClientSide(z).or(z.string()).optional(),
	});
};

```

## API endpoints used

- GET /staff/tenant-users/{userId} — `useGetTenantUserById` (client hook: `#app/lib/react-query/features/staff/staff-tenant.hooks.ts`).
- PATCH /staff/tenant-users/{userId} — update identity (form onSubmit via react-query mutation).
- GET /staff/tenant-users/{userId}/companies — paginated companies for user (cursor/limit/sort, used by table query).
- POST /staff/tenant-users/{userId}/companies — link company (drawer mutation).
- DELETE /staff/tenant-users/{userId}/companies — bulk unlink (selection action, max 100).
- GET /staff/tenants (list) — for link drawer options (TenantAsStaffListItem).
- All client models via `@org/client-ts/src/models` (TenantUserDetailsForStaffResult, TenantUserCompanyForStaffResult, TenantUserCompanyBulkActionResult, TenantAsStaffListItem).

## i18n keys (sample from files)

- `actions`
- `active`
- `add-first-company`
- `admin`
- `cancel`
- `change-email`
- `change-role`
- `change-status`
- `clear-search`
- `companies`
- `confirm`
- `confirm-new-email`
- `confirm-reactivate-tenant-user`
- `confirm-remove-user-from-tenant-details`
- `confirm-suspend-tenant-user`
- `created-at`
- `current-email`
- `danger-zone`
- `danger-zone-tenant-user-identity-description`
- `email-address`
- `email-must-be-different`
- `emails-do-not-match`
- `error-loading-items`
- `export`
- `firstname`
- `globally-suspended`
- `globally-suspended-row-disabled`
- `item-update-success-message`
- `lastname`
- `level`
- `link-to-company`
- `max-size`
- `metadata`
- `new-email`
- `no-items-found`
- `no-matching-companies`
- `reactivate`
- `reactivate-tenant-user-description`
- `reactivate-tenant-user-identity`
- `reactivate-tenant-user-identity-confirm`
- `remove`
- `remove-user-from-tenant`
- `save-changes`
- `search-companies`
- `selection-mode-disable-controls`
- `selection-mode-disable-sorting`
- `status`
- `suspend`
- `suspend-tenant-user-description`
- `suspend-tenant-user-identity`
- `suspend-tenant-user-identity-confirm`
- `suspended`
- `tenant`
- `tenant-user`
- `tenant-user-details`
- `tenant-user-email-updated-success`
- `tenant-user-globally-reactivated-success`
- `tenant-user-globally-suspended-success`
- `tenant-user-reactivated-success`
- `tenant-user-suspended-success`
- `un-named`
- `unknown`
- `unknown-item`
- `updated-at`
- `uploads-not-supported-yet`
- `user`
- `user-level-updated-success`
- `user-removed-success`

## States

- Loading: QueryDisplay + TenantUserDetailsPageSkeleton.
- Empty: no matching companies (table empty state), clear-search.
- Error: 400 malformed-id -> View404, 404 not found -> View404, generic -> ErrorContent.
- Feature flags: none for this surface (always routed).
