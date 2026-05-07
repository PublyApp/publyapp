# Staff Tenant User Details Page Design

## Summary

Issue: <https://github.com/radandevist/publyapp/issues/386>

Staff tenant-user details navigation currently sends users to a Staff 404 page. The
tenant-users table exposes details affordances, but there is no registered
tenant-user details route and no mapped scoped `GET` endpoint.

This is a Staff dashboard UX regression caused by an incomplete feature. The fix is
a real, full editable tenant-user details page that keeps tenant context in both
the URL and API calls.

## Classification

This remains a regression for tracking because staff can trigger a visible
details workflow that currently fails with 404.

The root implementation gap is that the full tenant-user details surface was not
completed:

- frontend details route is missing
- current details path helper omits `tenantId`
- backend scoped `GET /staff/tenants/{tenantId}/users/{userId}` is not mapped
- generated client has tenant-user `patch`, `delete`, `suspend`, and `reactivate`,
  but no tenant-user `get`

## Goals

- Staff can open a tenant user from the tenant details `Users` tab without a 404.
- The details URL includes both `tenantId` and `userId`.
- The page is a full editable tenant-user details page, not a read-only stopgap.
- The page uses tenant-user scoped API calls and permissions.
- The UI reuses the same primitives and visual structure as the existing Staff
  user details page.
- Existing table-level tenant-user actions remain consistent with the new page.

## Non-Goals

- Do not redirect tenant users to the Staff-user details page.
- Do not create a separate top-level Staff `tenant-users` module unless a future
  product decision needs a global tenant-user index.
- Do not change tenant-user invitation behavior.
- Do not add tenant-user email editing in this slice. Email is an identity-level
  operation and there is no dedicated tenant-user scoped email endpoint today.
- Do not add tenant profile assignment UI here unless a separate requirement
  defines tenant profile assignment from the user details page.

## Route Design

Use a tenant-details nested route:

```text
/staff/tenants/details/:tenantId/users/:userId
```

This URL keeps the page inside the tenant-management context and avoids the
current ambiguous path:

```text
/staff/tenant-users/details/:userId
```

The route should live under the existing staff tenants route tree because the
tenant is part of the identity of the membership being viewed. A tenant user can
belong to multiple tenants, so `userId` alone is insufficient.

The path helper should be tenant-aware:

```ts
FRONT_PATH_NAMES.staff.tenants.details(tenantId).users.details(userId)
```

The old `FRONT_PATH_NAMES.staff.tenantUsers.details(userId)` helper should not be
used for this workflow. It may be removed or left unused only if other code still
references it during migration.

## API Design

Add the missing scoped read endpoint:

```text
GET /staff/tenants/{tenantId}/users/{userId}
```

This should map the existing `Routes.Users.ForTenantAsStaff.GetById` constant and
return the same tenant-user detail DTO shape used by update/lifecycle responses,
expanded with audit timestamps needed by the page.

Expected response fields:

- `id`
- `tenantId`
- `email`
- `firstName`
- `lastName`
- `avatarUrl`
- `level`
- `status`
- `createdAt`
- `updatedAt`

The handler should follow current route-parameter rules:

- parse `tenantId` with `Guid.TryParse`
- parse `userId` with `Guid.TryParse`
- malformed IDs return `TypedProblems.BadRequest(..., ResponseKeys.MalformedId)`
- missing tenant membership returns `TypedProblems.NotFound`
- do not use route constraints

The endpoint should use route-level permission enforcement. The preferred
permission is `AppPermissions.Staff.Users.GET_FOR_TENANT`. If that permission is
not present, add it through the existing permission seed pattern and wire it into
the endpoint.

## Backend Service Design

Add a tenant-scoped read method to `IUserService`/`UserService`:

```csharp
Task<TenantUserData?> GetTenantUserByIdAsync(
	Guid tenantId,
	Guid userId,
	CancellationToken cancellationToken = default
);
```

The query must match the tenant-user membership, not just the global user:

- `User.Id == userId`
- account `TenantId == tenantId`
- account scope is tenant/project membership as appropriate for existing
  tenant-user queries
- soft-deleted users/accounts are excluded consistently with
  `FindTenantUsersAsync`
- suspended users and suspended tenant memberships remain visible, because the
  details page must support lifecycle recovery actions

The result should reuse `TenantUserData` so list, update, suspend, reactivate, and
get operations speak the same internal shape.

## Frontend Data Design

After adding the backend GET endpoint:

1. run `just build-api`
2. run `just generate-client`
3. add a hook in `apps/front/src/lib/react-query/features/staff/staff-tenant.hooks.ts`

Expected hook shape:

```ts
export const useGetTenantUser = createStaffQuery({
	queryKeyFn: (client) => client.staff.tenants.byTenantId('').users.byUserId('').get,
	fetcher: async (client, params: { tenantId: string; userId: string }) => {
		const result = await client.staff.tenants
			.byTenantId(params.tenantId)
			.users.byUserId(params.userId)
			.get();

		if (isNil(result)) {
			throw new Error('useGetTenantUser: result is nil');
		}

		return result;
	},
});
```

The page should reuse existing tenant-user scoped mutations:

- `useUpdateTenantUser`
- `useSuspendTenantUser`
- `useReactivateTenantUser`
- `useRemoveTenantUser`

Cache invalidation should refresh:

- the details query for `{ tenantId, userId }`
- the tenant-users list query for `{ tenantId }`

## UI Design

The new page should use the existing Staff user details page as the reference
implementation.

Required primitives to reuse:

- `DashboardContent`
- `CustomBreadcrumbs`
- `QueryDisplay`
- `NotFoundView`
- `View400`
- `ErrorContent`
- `Form` and `Field.*` from `#app/components/hook-form`
- MUI `Card`, `Stack`, `Box`, `Typography`, `Button`, `MenuItem`
- `StatusChip`
- `ConfirmDialog`
- `Field.UploadAvatar` in disabled mode until uploads are supported
- existing date formatting utilities from `format-time.ts`

Required layout pattern:

- same `maxWidth="md"` details page width as Staff user details
- same two-column card layout
- same left summary rail with avatar, status, and metadata rows
- same right editable form card
- same danger-zone card pattern for high-impact actions
- same skeleton structure adapted for tenant-user fields

The tenant-user page should not introduce a new dashboard composition, new card
hierarchy, or a top-level marketing-like layout.

## Editable Fields

The main form should edit fields already supported by the tenant-user update API:

- last name
- first name
- tenant account level
- avatar URL payload support, while upload UI remains disabled until uploads are
  implemented

The form should send only dirty fields to preserve existing PATCH semantics.

The account level selector should use the existing shared values:

- `Admin`
- `User`

The page should display email as read-only metadata. Email editing should stay out
of this issue because the existing tenant-user API has no dedicated email route.

## Danger Zone

The danger-zone card should expose tenant-scoped high-impact actions:

- suspend tenant membership when the effective tenant-user status is active
- reactivate tenant membership when the tenant membership is suspended
- remove user from tenant

The danger-zone copy must make the scope explicit: actions apply to this tenant
membership, not necessarily the global identity.

Globally suspended users need careful handling:

- show the effective status as globally suspended
- do not offer tenant-level reactivate if the user is globally suspended
- explain that global reactivation belongs to the Staff-user/global identity flow

Remove-from-tenant should confirm and then navigate back to:

```text
/staff/tenants/details/:tenantId/users
```

## Error Handling

Missing route params:

- render `View400` with a concise bad-request message

Malformed API IDs:

- backend returns `400` with `ResponseKeys.MalformedId`
- frontend renders the not-found/bad-request UX consistent with Staff user details

Missing tenant membership:

- backend returns `404`
- frontend renders `NotFoundView`

Forbidden:

- frontend should show the centralized API error state and must not log the user
  out

Unauthorized:

- unchanged centralized behavior: only `401` means invalid/missing session and can
  trigger logout

## Table Link Updates

Update both existing tenant-users table details affordances:

- user-name link in `UserCell`
- drawer expand action in `UserDetailsDrawerAction`

Both should build the same tenant-aware URL. The row component should get
`tenantId` from route params or receive it through row/controller props; the
implementation should avoid rebuilding ambiguous user-only details URLs.

## Testing Expectations

Backend integration coverage:

- valid staff user can get a tenant user by `{tenantId, userId}`
- malformed `tenantId` returns `400`
- malformed `userId` returns `400`
- valid but missing membership returns `404`
- tenant user without staff permission receives `403`
- suspended tenant membership remains retrievable
- globally suspended identity remains retrievable with `GloballySuspended` status

Frontend verification:

- `just build-api`
- `just generate-client`
- `just tsc-front`
- click tenant user name from tenant details users table
- click drawer expand action from tenant details users table
- edit first name / last name / account level and verify dirty-field PATCH
- suspend/reactivate tenant membership from danger zone
- remove user from tenant and verify redirect back to the users tab
- verify malformed/missing IDs do not trigger logout

## Implementation Order

1. Add backend service and handler coverage for tenant-user GET.
2. Map the backend GET endpoint and regenerate the TypeScript client.
3. Add the tenant-aware frontend route helper and route file.
4. Add the `useGetTenantUser` query hook.
5. Build the tenant-user details page using Staff user details primitives.
6. Update tenant-users table links to the tenant-aware details route.
7. Run API, client generation, and frontend type verification.

## Self-Review

- No placeholder requirements remain.
- The route includes both `tenantId` and `userId`.
- The design does not reuse Staff-user scoped APIs for tenant-user data.
- The UI explicitly reuses Staff user details primitives and layout.
- The plan stays within issue 386 and does not add unrelated tenant-profile or
  email-editing behavior.
