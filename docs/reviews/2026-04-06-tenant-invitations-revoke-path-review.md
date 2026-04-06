# Tenant Invitations Revoke Path Review

## Context

This review started from the new integration spec added for tenant invitation listing:

- `apps/api/Src/Modules/Invitations/Handlers/Staff/FindInvitationsForTenantAsStaff.Spec.cs`

The immediate failure in that spec was that the test attempted to revoke tenant invitations through a tenant-scoped route and received `404`.

After tracing the UI and backend, the deeper issue is architectural: tenant invitation revocation currently works through the global staff invitation revoke endpoint, but that path is shaped and named as if it were only for staff invitations.

## Findings

### 1. The UI currently revokes tenant invitations through the global staff invitation endpoint

The tenant invitations table uses:

- `useRevokeInvitation` from `apps/front/src/lib/react-query/features/staff/staff-invitation.hooks.ts`

That hook calls:

- `client.staff.invitations.byInvitationId(data.invitationId).delete()`

So the UI is effectively revoking tenant invitations through:

- `DELETE /staff/invitations/{invitationId}`

not through:

- `DELETE /staff/tenants/{tenantId}/invitations/{invitationId}`

### 2. The tenant-scoped revoke route helper exists, but the tenant-scoped revoke endpoint is not mapped

Route helper exists in:

- `apps/api/Src/Modules/Invitations/Routes.Invitations.cs`

Specifically:

- `Routes.Invitations.ForTenantAsStaff.RevokeByIdFn(...)`

But `apps/api/Src/Modules/Invitations/Endpoints/InvitationEndpointsForTenantAsStaff.cs` only maps:

- `GET /staff/tenants/{tenantId}/invitations`

There is no tenant-scoped `DELETE` mapping there today.

### 3. The global revoke endpoint is broader than its naming implies

The global endpoint is:

- `DELETE /staff/invitations/{invitationId}`

Mapped in:

- `apps/api/Src/Modules/Invitations/Endpoints/InvitationEndpointsForStaff.cs`

Handled by:

- `apps/api/Src/Modules/Invitations/Handlers/Staff/RevokeStaffInvitation.cs`

Problems with the current shape:

- The handler name implies it revokes only staff invitations.
- The permission name implies staff-invitation scope:
  - `AppPermissions.Staff.Invitations.REVOKE_FOR_STAFF`
- But the service call revokes any invitation record by `id`.

### 4. The current backend does not enforce tenant scoping on revoke

The current revoke flow:

1. Validates `invitationId`
2. Checks the caller is a staff admin
3. Calls `InvitationService.RevokeInvitationAsync(invitationId)`

The service then does a plain lookup by invitation primary key and revokes whatever it finds.

It does not verify:

- that the invitation is `InvitationScope.Staff`
- or that the invitation belongs to a specific tenant
- or that a tenant route parameter matches the invitation's tenant

## Conclusion

The current behavior is functional but mis-shaped.

Tenant invitation revocation is currently implemented as a global-by-id mutation hidden behind a staff-invitation route and permission naming scheme.

That creates three problems:

1. Route semantics are misleading.
2. Authorization scope is broader and less explicit than the tenant-details UI suggests.
3. The integration tests exposed the inconsistency because the natural tenant-scoped route does not exist.

## Recommended Direction

We should treat this as an API design correction, not just a test fix.

### Recommended target shape

#### Staff invitation management

Use global staff invitation endpoints only for actual staff invitations:

- `GET /staff/invitations/...`
- `DELETE /staff/invitations/{invitationId}`

These should operate only on `InvitationScope.Staff`.

#### Tenant invitation management

Use tenant-scoped endpoints for tenant invitations:

- `GET /staff/tenants/{tenantId}/invitations`
- `DELETE /staff/tenants/{tenantId}/invitations/{invitationId}`

These should operate only on `InvitationScope.Tenant` and require the invitation's `TenantId` to match the route tenant.

## Decision Points To Agree Before Implementation

### 1. Global revoke scope

Choose one:

- Option A: Keep global revoke endpoint and intentionally allow it to revoke any invitation by `id`
- Option B: Restrict global revoke endpoint to `InvitationScope.Staff` only

Recommendation:

- Option B

Reason:

- It matches route naming and prevents cross-scope ambiguity.

### 2. Tenant revoke endpoint

Choose one:

- Option A: Add tenant-scoped revoke endpoint
- Option B: Continue using the global revoke endpoint from tenant-details UI

Recommendation:

- Option A

Reason:

- It matches the tenant-details mental model and makes authorization and auditing explicit.

### 3. Frontend revoke hook split

Choose one:

- Option A: Reuse one generic revoke hook for both staff and tenant invitations
- Option B: Split into separate hooks for staff invitations and tenant invitations

Recommendation:

- Option B

Reason:

- The routes and responsibilities differ.
- It keeps query invalidation, route usage, and permission expectations clearer.

### 4. Permission model

Choose one:

- Option A: Reuse `REVOKE_FOR_STAFF` for tenant invitation revoke
- Option B: Introduce a distinct tenant revoke permission, parallel to `LIST_FOR_TENANT`

Recommendation:

- Option B, if tenant invitation management is meant to remain a first-class tenant-scoped surface

Reason:

- Current permission naming is already conflating scopes.

If we want minimal churn, Option A is still viable short term, but the naming debt remains.

### 5. Test direction

Choose one:

- Option A: Patch Kimi's tests to use the current global revoke route
- Option B: Keep the tests aligned to the corrected architecture and implement the scoped revoke endpoint

Recommendation:

- Option B

Reason:

- The tests were exposing the shape we actually want.
- Changing them to the global path would lock in the wrong contract.

## Proposed Next Move

Before implementation, align on the following package:

1. Global revoke becomes staff-invitation-only.
2. Tenant invitations get a proper tenant-scoped revoke endpoint.
3. Frontend tenant invitations UI switches to the tenant-scoped revoke mutation.
4. Integration tests target the tenant-scoped list and revoke behavior.
5. Existing global revoke tests and handlers are tightened to staff-only semantics.

## Suggested Implementation Planning Scope

Once the above is approved, the implementation plan should cover:

- backend route/handler/service adjustments
- permission naming or permission additions
- frontend hook and UI mutation wiring
- integration test updates for both staff and tenant invitation revoke flows
- regression verification around tenant details invitations tab behavior

