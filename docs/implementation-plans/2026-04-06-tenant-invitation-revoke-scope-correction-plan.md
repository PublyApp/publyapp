# Tenant Invitation Revoke Scope Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct the invitation revoke API shape so staff invitation revocation remains global-and-staff-only, while tenant invitation revocation becomes explicitly tenant-scoped end to end.

**Architecture:** Split revoke flows by invitation scope. The existing global staff revoke endpoint should become staff-invitation-only by validating invitation scope before mutation. Tenant invitations should get a dedicated tenant-scoped revoke endpoint that validates both `tenantId` and `invitationId` against the same tenant invitation record. Frontend tenant-details UI must switch from the global revoke mutation to the tenant-scoped mutation, and automated coverage must assert the corrected contract.

**Tech Stack:** .NET 10 Minimal APIs, EF Core, xUnit integration specs, React 19, TanStack Query, generated Kiota client

---

## File Map

**Backend files likely to modify**

- `apps/api/Src/Modules/Invitations/Endpoints/InvitationEndpointsForStaff.cs`
- `apps/api/Src/Modules/Invitations/Endpoints/InvitationEndpointsForTenantAsStaff.cs`
- `apps/api/Src/Modules/Invitations/Handlers/Staff/RevokeStaffInvitation.cs`
- `apps/api/Src/Modules/Invitations/Handlers/Staff/FindInvitationsForTenantAsStaff.cs`
- `apps/api/Src/Modules/Invitations/Permissions/InvitationPermissionsForStaff.cs`
- `apps/api/Src/Modules/Invitations/Routes.Invitations.cs`
- `apps/api/Src/Modules/Invitations/Services/InvitationService.cs`
- `apps/api/Program.cs` only if endpoint registration shape changes beyond extension files

**Backend tests to create/update**

- `apps/api/Src/Modules/Invitations/Handlers/Staff/FindInvitationsForTenantAsStaff.Spec.cs`
- `apps/api/Src/Modules/Invitations/Handlers/Staff/RevokeStaffInvitation.Spec.cs` if global staff revoke lacks dedicated coverage today
- `apps/api/Src/Modules/Invitations/Handlers/Staff/RevokeInvitationForTenantAsStaff.Spec.cs` if tenant-scoped revoke gets its own handler/spec file

**Frontend files likely to modify**

- `apps/front/src/lib/react-query/features/staff/staff-invitation.hooks.ts`
- `apps/front/src/lib/react-query/features/staff/staff-tenant.hooks.ts`
- `apps/front/src/routes/authed/staff/tenants/details/invitations/parts/tenant-invitations-table.tsx`

**Generated/client contract files likely to modify**

- `apps/api/openapi/MainApi.json`
- `packages/client-ts/src/...` generated output after client regeneration

## Decisions Locked In

- [ ] Global revoke route remains for staff invitations only.
- [ ] Tenant invitations get a tenant-scoped revoke route.
- [ ] Tenant-details invitations UI stops using the global revoke hook.
- [ ] Tests should validate the corrected architecture, not preserve the accidental current behavior.

## Task 1: Finalize Backend Route and Permission Shape

**Files:**
- Modify: `apps/api/Src/Modules/Invitations/Routes.Invitations.cs`
- Modify: `apps/api/Src/Modules/Invitations/Permissions/InvitationPermissionsForStaff.cs`
- Modify: `apps/api/Src/Modules/Invitations/Endpoints/InvitationEndpointsForStaff.cs`
- Modify: `apps/api/Src/Modules/Invitations/Endpoints/InvitationEndpointsForTenantAsStaff.cs`

- [ ] Define the intended public route contract explicitly:
  - Global staff revoke: `DELETE /staff/invitations/{invitationId}`
  - Tenant revoke: `DELETE /staff/tenants/{tenantId}/invitations/{invitationId}`

- [ ] Decide permission naming:
  - Minimal option: keep `REVOKE_FOR_STAFF` for the global staff revoke and add `REVOKE_FOR_TENANT`
  - Avoid reusing a staff-only named permission for tenant revoke if we want the API surface to read clearly

- [ ] Register the tenant-scoped revoke endpoint in `InvitationEndpointsForTenantAsStaff.cs`.

- [ ] Ensure the global staff endpoint remains registered only for staff invitation management.

## Task 2: Split Backend Revoke Semantics by Scope

**Files:**
- Modify: `apps/api/Src/Modules/Invitations/Handlers/Staff/RevokeStaffInvitation.cs`
- Create or modify: tenant revoke handler under `apps/api/Src/Modules/Invitations/Handlers/Staff/`
- Modify: `apps/api/Src/Modules/Invitations/Services/InvitationService.cs`

- [ ] Change global revoke so it no longer revokes arbitrary invitation ids.

- [ ] Add a service method for staff revoke that only succeeds when:
  - invitation exists
  - invitation scope is `Staff`
  - invitation is revocable

- [ ] Add a service method for tenant revoke that only succeeds when:
  - invitation exists
  - invitation scope is `Tenant`
  - invitation `TenantId` matches route `tenantId`
  - invitation is revocable

- [ ] Decide exact result shapes before implementation:
  - malformed ids -> `400`
  - invitation not found -> `404`
  - invitation exists but wrong scope / wrong tenant -> preferably `404` to avoid leaking cross-scope/cross-tenant existence
  - accepted invitation revoke attempt -> confirm whether this remains `400` or `404`

- [ ] Keep audit logging behavior consistent for both revoke paths.

## Task 3: Update Frontend Revoke Wiring

**Files:**
- Modify: `apps/front/src/lib/react-query/features/staff/staff-invitation.hooks.ts`
- Modify: `apps/front/src/lib/react-query/features/staff/staff-tenant.hooks.ts`
- Modify: `apps/front/src/routes/authed/staff/tenants/details/invitations/parts/tenant-invitations-table.tsx`

- [ ] Leave the existing global revoke hook for staff invitations only.

- [ ] Add a tenant-scoped revoke hook in `staff-tenant.hooks.ts` that accepts:
  - `tenantId`
  - `invitationId`

- [ ] Replace tenant invitations table revoke usage:
  - row action
  - bulk revoke action

- [ ] Keep invalidation scoped to `useFindTenantInvitations.getKey({ tenantId })`.

- [ ] Verify no staff-invitations UI regresses from the hook split.

## Task 4: Correct and Expand Backend Integration Coverage

**Files:**
- Modify: `apps/api/Src/Modules/Invitations/Handlers/Staff/FindInvitationsForTenantAsStaff.Spec.cs`
- Create/update revoke specs under `apps/api/Src/Modules/Invitations/Handlers/Staff/`

- [ ] Update the existing tenant invitation list spec so revoked-status setup uses the tenant-scoped revoke path, not the global path.

- [ ] Add focused revoke coverage for the new tenant revoke endpoint:
  - success for pending tenant invitation in matching tenant
  - `400` malformed `tenantId`
  - `400` malformed `invitationId`
  - `404` invitation id not found
  - `404` invitation belongs to different tenant
  - `404` invitation is staff-scoped
  - `401` no session
  - `403` wrong scope / insufficient permission
  - accepted invitation cannot be revoked

- [ ] Add or update global revoke coverage so it proves:
  - staff invitation can be revoked through global route
  - tenant invitation cannot be revoked through global staff route after the correction

- [ ] Ensure list coverage still proves:
  - revoked tenant invitations appear under revoked filter
  - pending filter excludes revoked rows

## Task 5: Regenerate Contract and Align Client

**Files:**
- Modify generated files after regeneration:
  - `apps/api/openapi/MainApi.json`
  - `packages/client-ts/src/...`

- [ ] Regenerate OpenAPI/client only after backend route changes are complete.

- [ ] Confirm the generated client exposes:
  - global staff revoke under staff invitations
  - tenant revoke under tenant invitations

- [ ] Remove any accidental frontend dependence on the old global tenant-revoke behavior.

## Task 6: Verification

**Files:**
- No new files beyond those already listed

- [ ] Run focused backend specs for:
  - tenant invitation list
  - tenant invitation revoke
  - global staff invitation revoke

- [ ] Run:
  - `make build-api`
  - `make generate-client`
  - `make tsc-front`

- [ ] If frontend files changed materially, also run the project’s React verification pass used by the team.

## Open Questions To Resolve Before Writing Code

- [ ] Should tenant revoke return a dedicated permission such as `REVOKE_FOR_TENANT`, or should we deliberately reuse `REVOKE_FOR_STAFF` for now?
- [ ] For wrong-scope and wrong-tenant revocation attempts, do we want `404` for non-disclosure or `403` for explicit authorization failure?
- [ ] Should accepted-invitation revoke attempts continue returning the current “not found/bad request” style outcome, or do we want to formalize a clearer problem response?
- [ ] Do we want to rename `RevokeStaffInvitation` to clarify that it is staff-scope-only after the correction?

## Recommended Resolution

- [ ] Add `REVOKE_FOR_TENANT`
- [ ] Return `404` for cross-tenant or wrong-scope invitation ids on tenant revoke
- [ ] Restrict global revoke to `InvitationScope.Staff`
- [ ] Rename handlers/types where needed so route name, permission name, and behavior all agree

