# Tenant User Suspension Review Summary

## Context

I reviewed the staged tenant-user suspension/reactivation implementation from the other AI agent and checked whether it was mergeable.

During review, I found and fixed several issues before reaching a green state.

## Issues found during review

### 1. Suspended users disappeared from the tenant users list

Root cause:

- the tenant users list query in `apps/api/Src/Modules/Users/Services/UserService.cs` still excluded `UserAccount.IsSuspended`

Impact:

- suspending a tenant user made them disappear from the list instead of remaining visible as `Suspended`

Fix:

- removed the `!ua.IsSuspended` exclusion from the tenant users list query
- changed list filtering and sorting semantics to use the tenant membership row (`UserAccount.IsSuspended`) instead of the global `User.Status`

### 2. Tenant-user status was being derived from the wrong entity

Root cause:

- tenant-user handlers and list mapping were still serializing status from `User.Status`

Impact:

- the API could report the wrong status for tenant membership operations
- this was inconsistent with the product rule that tenant suspension belongs to the `UserAccount` join row

Fix:

- tenant-user status in list/details/suspend/reactivate responses is now derived from `UserAccount.IsSuspended`

### 3. Suspend/reactivate DTO reads were stale after `ExecuteUpdateAsync`

Root cause:

- the service updated `UserAccount` with `ExecuteUpdateAsync` and then re-read through tracked entities

Impact:

- suspend/reactivate success responses could report stale `IsSuspended` values

Fix:

- changed the relevant reads in `UserService.cs` to `AsNoTracking()`

### 4. Reactivate conflict used the wrong translation key

Root cause:

- the reactivation failure path used `tenant-not-suspended`

Impact:

- the error message was misleading for tenant-user reactivation

Fix:

- changed it to `user-not-suspended`
- added the English and French response-message translations
- updated `apps/api/Generated/ResponseKeys.g.cs`

### 5. Missing regression coverage for the disappearing-row bug

Root cause:

- the staged tests asserted the suspend/reactivate mutation responses
- they did not assert that a suspended tenant user remains visible in the tenant users list

Fix:

- added integration coverage in `apps/api/Src/Modules/Users/Handlers/Staff/FindTenantUsersAsStaff.Spec.cs`
- the new test proves suspended memberships remain visible in the default list and show `Suspended`

## Additional cleanup performed

To make the account-level status semantics explicit and reusable, I added tenant-membership status helpers to:

- `apps/api/Src/Modules/Users/Entities/UserAccount.cs`

Added:

- `UserAccount.ParseStatus(...)`
- `UserAccount.GetStatusDescription(...)`

Updated call sites to use those helpers in:

- `apps/api/Src/Modules/Users/Handlers/Staff/FindTenantUsersAsStaff.cs`
- `apps/api/Src/Modules/Users/Handlers/Staff/SuspendTenantUserAsStaff.cs`
- `apps/api/Src/Modules/Users/Handlers/Staff/ReactivateTenantUserAsStaff.cs`
- `apps/api/Src/Modules/Users/Handlers/Staff/UpdateTenantUserAsStaff.cs`

## Verification

The following verification succeeded:

- `dotnet build apps/api/MainApi.csproj -c Test`
- `cd apps/api; dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~FindTenantUsersAsStaffSpec|FullyQualifiedName~SuspendTenantUserAsStaffSpec|FullyQualifiedName~ReactivateTenantUserAsStaffSpec"`
- `make tsc-front`

React verification:

- `react-doctor` still only reported the same pre-existing unrelated repo error in `apps/front/src/routes/authed/staff/profiles/new/parts/new-staff-profile-form.tsx`

## Conclusion

After these fixes, the tenant-user suspension/reactivation work is in a mergeable state.

## Global suspension follow-up

The broader global-user suspension invariant follow-up is now complete too.

What was added after the initial review:

- active account/member helper queries in `apps/api/Src/Modules/Users/Services/AccountService.cs`
  now exclude globally suspended identities in addition to locally suspended
  memberships
- tenant-user list coverage now proves a globally suspended user is excluded from
  the tenant users list even if a legacy tenant membership row remains locally active
- auth coverage now proves both tenant picker access and tenant-auth access are
  rejected for a globally suspended user, even when using a session token that was
  issued before the suspension change

Verification for this follow-up:

- `cd apps/api; dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~UpdateStaffUserSpec|FullyQualifiedName~UpdateStaffUserSuspensionInvariantSpec|FullyQualifiedName~FindTenantUsersAsStaffSpec|FullyQualifiedName~SuspendTenantUserAsStaffSpec|FullyQualifiedName~ReactivateTenantUserAsStaffSpec|FullyQualifiedName~GetUserTenantsForPickerSpec|FullyQualifiedName~GetTenantAuthDataSpec|FullyQualifiedName~PasswordLoginSpec"`
- `dotnet build apps/api/MainApi.csproj -c Test`

After this follow-up, global suspension semantics are aligned across:

- login/session validation
- tenant-auth access
- tenant picker access
- tenant-user list semantics
- active account/member helper queries
