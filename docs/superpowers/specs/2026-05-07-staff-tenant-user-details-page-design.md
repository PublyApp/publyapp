# Staff Tenant User Details Page Design

## Summary

Issue: <https://github.com/radandevist/publyapp/issues/386>

Staff tenant-user details navigation currently sends users to a Staff 404 page. The
tenant-users table exposes details affordances, but there is no registered
tenant-user details route and no mapped scoped `GET` endpoint.

This is a Staff dashboard UX regression caused by an incomplete feature. The fix is
a real, full editable tenant-user details page.

## Review Update

The final route should be first-class in the Staff surface:

```text
/staff/tenant-users/:userId
```

This page uses `User.Id` as the route identifier, not `UserAccount.Id`. The page
represents the tenant-side identity globally, while tenant/company memberships are
shown as scoped rows on the same details page.

The details page has two sections:

- identity details: editable fields shared by every tenant/company membership
  for this user (`firstName`, `lastName`, `avatarUrl`).
- company list: all tenant memberships for the user, including tenant name/logo,
  membership `level`, effective membership `status`, and tenant-scoped actions
  such as suspend/reactivate/remove.

Tenant details remains the strongest entry point for day-to-day context. The
tenant details `Users` tab should link to `/staff/tenant-users/:userId`; the
destination then frames the user as a first-class tenant user and keeps
company-specific context in the company list.

## Classification

This remains a regression for tracking because staff can trigger a visible
details workflow that currently fails with 404.

The root implementation gap is that the full tenant-user details surface was not
completed:

- frontend details route is missing
- current tenant-user path helper points at an unregistered Staff route
- backend has tenant-scoped membership actions, but no first-class Staff
  tenant-user details contract
- generated client needs a first-class `GET/PATCH /staff/tenant-users/{userId}`
  contract for the editable details page

## Goals

- Staff can open a tenant user from the tenant details `Users` tab without a 404.
- The details URL is `/staff/tenant-users/:userId`.
- The page is a full editable tenant-user details page, not a read-only stopgap.
- The page separates global tenant-user identity fields from tenant/company
  membership fields without hiding either behind tabs.
- The UI reuses the same primitives and visual structure as the existing Staff
  user details page.
- Existing table-level tenant-user actions remain consistent with the new page.

## Non-Goals

- Do not redirect tenant users to the Staff-user details page.
- Do not add a top-level tenant-user list page in this slice.
- Do not change tenant-user invitation behavior.
- Do not add tenant-user email editing in this slice. Email is an identity-level
  operation and there is no dedicated tenant-user scoped email endpoint today.
- Do not add tenant profile assignment UI here unless a separate requirement
  defines tenant profile assignment from the user details page.

## Route Design

Use a first-class Staff tenant-user route:

```text
/staff/tenant-users/:userId
```

The route identifier is `User.Id`. `UserAccount.Id` is not used in the URL
because the page represents the tenant-side identity globally, not one specific
membership row.

The path helper should be:

```ts
FRONT_PATH_NAMES.staff.tenantUsers.details(userId)
```

Tenant details remains the entry point for tenant-local context. Its `Users` tab
links to the first-class route, and the destination page keeps each company
membership visible in an inline `Companies` table below the identity details.

## API Design

Add first-class Staff tenant-user endpoints:

```text
GET /staff/tenant-users/{userId}
PATCH /staff/tenant-users/{userId}
```

The tenant-scoped endpoints under `/staff/tenants/{tenantId}/users/{userId}`
remain in place for membership-specific actions: level changes, suspend,
reactivate, and remove.

Expected first-class response fields:

- `id`
- `email`
- `firstName`
- `lastName`
- `avatarUrl`
- `status`
- `createdAt`
- `updatedAt`
- `companies`

Each `companies` item includes:

- `tenantId`
- `tenantName`
- `tenantLogoUrl`
- `level`
- `status`
- `createdAt`
- `updatedAt`

The handler should follow current route-parameter rules:

- parse `userId` with `Guid.TryParse`
- malformed IDs return `TypedProblems.BadRequest(..., ResponseKeys.MalformedId)`
- missing tenant-side identity returns `TypedProblems.NotFound`
- do not use route constraints

The endpoints use route-level permission enforcement:

- `GET`: `AppPermissions.Staff.Users.GET_FOR_TENANT`
- `PATCH`: `AppPermissions.Staff.Users.UPDATE_FOR_TENANT`

## Backend Service Design

Add first-class tenant-user read/update methods to `IUserService`/`UserService`:

```csharp
Task<TenantUserDetailsData?> GetTenantUserDetailsAsync(
	Guid userId,
	CancellationToken cancellationToken = default
);

Task<UpdateTenantUserIdentityResult> UpdateTenantUserIdentityAsync(
	Guid userId,
	UpdateTenantUserIdentityDocument document,
	CancellationToken cancellationToken = default
);
```

The read query must match a non-deleted user with at least one non-deleted tenant
membership and return all tenant/company memberships:

- `User.Id == userId`
- account scope is `AccountScope.Tenant`
- soft-deleted users, accounts, and tenants are excluded
- suspended users and suspended memberships remain visible

The identity update method only changes shared `User` fields:

- `FirstName`
- `LastName`
- `AvatarUrl`

Company membership updates continue through the tenant-scoped update endpoint.

## Frontend Data Design

After adding the backend endpoints:

1. run `just build-api`
2. run `just generate-client`
3. add a hook in `apps/front/src/lib/react-query/features/staff/staff-tenant.hooks.ts`

Expected hook shape:

```ts
export const useGetTenantUserById = createStaffQuery({
	queryKeyFn: (client) => client.staff.tenantUsers.byUserId('').get,
	fetcher: async (client, params: { userId: string }) => {
		const result = await client.staff.tenantUsers
			.byUserId(params.userId)
			.get();

		if (isNil(result)) {
			throw new Error('useGetTenantUserById: result is nil');
		}

		return result;
	},
});
```

The page should use:

- `useUpdateTenantUserIdentity` for the identity form
- `useUpdateTenantUser` for company membership level changes
- `useSuspendTenantUser`
- `useReactivateTenantUser`
- `useRemoveTenantUser`

Cache invalidation should refresh:

- the first-class details query for `{ userId }`
- each affected tenant-users list query for `{ tenantId }`

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

- `DashboardContent` inside the normal Staff app sidebar shell
- a wider details page width that can comfortably host an MRT table
- two-column top details layout
- left card with disabled avatar upload and user status chip
- right column with the editable identity form card and a separate metadata card
- company memberships render below the details grid on the same page
- company membership actions live in the company list, not in the identity form
- same skeleton structure adapted for tenant-user fields

The tenant-user page should not introduce a new dashboard composition, new card
hierarchy, or a top-level marketing-like layout.

## Editable Fields

The identity form should edit shared identity fields:

- last name
- first name
- avatar URL payload support, while upload UI remains disabled until uploads are
  implemented

The form should send only dirty fields to preserve existing PATCH semantics.

The company list should edit membership-local levels with the existing shared
values:

- `Admin`
- `User`

The page should display email as read-only metadata. Email editing stays out of
this issue because tenant-user email has sign-in and global identity impact.

## Company List

The company list should use the existing Material React Table primitives, not
cards or tabs. Each company row should expose tenant-scoped membership actions:

- suspend tenant membership when the effective tenant-user status is active
- reactivate tenant membership when the tenant membership is suspended
- remove user from tenant
- change tenant membership level

The UI must make the scope explicit: actions apply to the selected company
membership, not necessarily the global identity.

Globally suspended users need careful handling:

- show the effective status as globally suspended
- do not offer tenant-level reactivate if the user is globally suspended
- explain that global reactivation belongs to the Staff-user/global identity flow

Remove-from-tenant should confirm and refresh the first-class details query. If
the removed company was the user's last tenant membership, the details query will
return not found.

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

Both should build the same first-class URL from the row `User.Id`:

```ts
FRONT_PATH_NAMES.staff.tenantUsers.details(id)
```

## Testing Expectations

Backend integration coverage:

- valid staff user can get a tenant user by `{userId}` with `companies`
- malformed `userId` returns `400`
- valid but missing tenant-side identity returns `404`
- tenant user without staff permission receives `403`
- staff can update shared tenant-user identity fields by `{userId}`
- company membership status/level actions still use tenant-scoped endpoints

Frontend verification:

- `just build-api`
- `just generate-client`
- `just tsc-front`
- click tenant user name from tenant details users table
- click drawer expand action from tenant details users table
- edit first name / last name and verify dirty-field PATCH
- edit account level for one company
- suspend/reactivate tenant membership from a company table row
- remove user from tenant and verify details refresh
- verify malformed/missing IDs do not trigger logout

## Implementation Order

1. Add backend service and handler coverage for first-class tenant-user GET/PATCH.
2. Map the first-class backend endpoints and regenerate the TypeScript client.
3. Add the first-class frontend route helper and route file.
4. Add the `useGetTenantUserById` and `useUpdateTenantUserIdentity` hooks.
5. Build the tenant-user details page using Staff user details primitives.
6. Render the company list as an inline MRT table below the details grid on the
   same page.
7. Update tenant-users table links to the first-class details route.
8. Run API, client generation, and frontend type verification.

## Self-Review

- No placeholder requirements remain.
- The route uses `User.Id`, not `UserAccount.Id`.
- The design does not reuse Staff-user scoped APIs for tenant-user data.
- The design keeps tenant/company context visible in the same-page company list.
- The UI explicitly reuses Staff user details primitives and layout.
- The plan stays within issue 386 and does not add unrelated tenant-profile or
  email-editing behavior.
