# Tenant Invitations Integration Tests Agent Prompt

You are working in the PublyApp monorepo.

Task: implement the missing backend integration tests for the tenant-details Invitations tab introduced in commit `80c730c` (`feat(api,front): add tenant invitations tab and align invitation flows`).

This is not a frontend test task. The goal is to lock down the API contract that powers the new tenant-scoped invitations list used by the staff tenant-details `Invitations` tab.

## Primary target

- Create the missing spec for the new endpoint/handler:
  - `apps/api/Src/Modules/Invitations/Handlers/Staff/FindInvitationsForTenantAsStaff.Spec.cs`

## Feature context you must understand first

- The commit added:
  - `apps/api/Src/Modules/Invitations/Endpoints/InvitationEndpointsForTenantAsStaff.cs`
  - `apps/api/Src/Modules/Invitations/Handlers/Staff/FindInvitationsForTenantAsStaff.cs`
  - `apps/api/Src/Modules/Invitations/Services/InvitationService.cs` changes
  - frontend tenant-details invitations tab files
- The endpoint is mapped in:
  - `apps/api/Program.cs`
- Exact route helpers are in:
  - `apps/api/Src/Modules/Invitations/Routes.Invitations.cs`
- Use route constants/helpers, not hardcoded path strings.

## Endpoint behavior to test

- Route: `GET /staff/tenants/{tenantId}/invitations`
- Helper: `Routes.Invitations.ForTenantAsStaff.FindFn(tenantId)`
- Query params supported by handler:
  - `cursor`
  - `limit`
  - `sort_id`
  - `sort_order`
  - `q`
  - `status`
- Allowed `sort_id` values:
  - `created_at`
  - `expires_at`
  - `email`
  - `accepted_at`
- Allowed status values:
  - `pending`
  - `accepted`
  - `expired`
  - `revoked`
- Status semantics come from `Invitation` entity / service logic:
  - pending = not accepted, not revoked, not expired
  - accepted = `IsAccepted`
  - revoked = `IsRevoked`
  - expired = not accepted, not revoked, `ExpiresAt <= UtcNow`

## Important implementation notes

- Follow repo conventions from `AGENTS.md`.
- Use existing integration test style and naming conventions.
- Keep the spec colocated with the handler namespace/folder.
- Prefer existing helpers/fixtures over inventing new test infrastructure.
- Do not weaken assertions to just `200 OK`; validate actual contract behavior.
- Do not change production code unless you discover a real testability or correctness bug. If you do, keep it minimal and justify it in your final summary.

## Read these files before coding

- `apps/api/Src/Modules/Invitations/Handlers/Staff/FindInvitationsForTenantAsStaff.cs`
- `apps/api/Src/Modules/Invitations/Services/InvitationService.cs`
- `apps/api/Src/Modules/Invitations/Routes.Invitations.cs`
- `apps/api/Src/Modules/Users/Handlers/Staff/CreateInvitationForTenantAsStaff.Spec.cs`
- `apps/api/Src/Modules/Users/Handlers/Staff/FindTenantUsersAsStaff.Spec.cs`
- `apps/api/Src/Modules/Tenants/Handlers/Staff/FindTenantsAsStaff.Spec.cs`
- optionally for product intent:
  - `docs/misc/2026-04-04-tenant-details-invitations-tab-implementation-prompt.md`
  - `docs/misc/tenant-module-smoke-test-checklist.md`

## What the spec must cover at minimum

### 1. Happy path / default listing

- Staff admin can fetch tenant invitations successfully.
- Response is `200 OK`.
- `data` is returned and is tenant-scoped.
- Assert that rows represent invitations, not users.
- Assert basic shape on at least one row:
  - `id`
  - `email`
  - `scope`
  - `profileName`
  - `expiresAt`
  - `acceptedAt`
  - `isAccepted`
  - `isRevoked`
  - `createdAt`
  - `invitedByName`

### 2. Tenant scoping isolation

- Invitations from other tenants must not leak into the selected tenant’s results.
- This is critical because the UI tab is tenant-details scoped.
- If seed data is insufficient, create the extra invitation records through the API or directly via DbContext in the spec.

### 3. Cursor pagination

- Default cursor pagination returns OK.
- `nextCursor` is returned when more results exist.
- Second page fetched with cursor returns different records from page 1.
- Use deterministic sort inputs where needed, similar to nearby specs.

### 4. Tenant ID validation

- Malformed `tenantId` returns `400 BadRequest`.

### 5. Cursor validation

- Malformed cursor returns `400 BadRequest`.
- Well-formed but nonexistent cursor returns `400 BadRequest`.

### 6. Sort validation

- Invalid `sort_id` returns `400 BadRequest`.
- At least one valid non-default sort should be exercised successfully.
- Prefer covering one of the tab-relevant supported sorts such as `email` or `expires_at`.

### 7. Status filter validation

- Invalid status token returns `422 UnprocessableEntity`.
- Comma-separated valid statuses work.
- Include a positive test for multi-status filtering such as `pending,revoked` or `accepted,expired`.

### 8. Status filter behavior

- Pending filter returns only pending invitations.
- Accepted filter returns only accepted invitations.
- Revoked filter returns only revoked invitations.
- Expired filter returns only expired invitations.
- You do not necessarily need one separate test per status if you can set up a precise mixed dataset and assert subsets cleanly, but coverage must be explicit and robust.

### 9. Search behavior

- `q` filters by invitation email.
- Include a search test showing tenant invitation email matching works.
- Prefer asserting both inclusion of expected rows and exclusion of non-matching rows.

### 10. Auth and permission gating

- No session returns `401 Unauthorized`.
- Tenant-scoped user token returns `403 Forbidden`.
- Staff user without required permission returns `403 Forbidden`.
- Mirror the style used in `FindTenantUsersAsStaff.Spec.cs`.

### 11. Regression linkage to invitation creation flow

- Add at least one integration test proving that a tenant invitation created for a tenant can later be retrieved from this endpoint for that same tenant.
- Reuse the creation endpoint if practical:
  - `CreateInvitationForTenantAsStaff`
- This is important because the user story was: invite from Users tab, then see it in Invitations tab.
- If this is too overlapping with existing create-invitation coverage, at minimum ensure the list spec explicitly verifies freshly created tenant invitation records are discoverable by this endpoint.

## High-value edge cases you should include if practical

- Search term trimming behavior.
- Case-insensitive status parsing.
- Empty/blank status behaving as “no filter”.
- `accepted_at` sorting when some rows have null `AcceptedAt`.
- Invitation with no profiles should still serialize a stable `profileName` value (currently service uses empty string when none exist).
- Cursor belonging to another tenant should be treated as cursor-not-found for the current tenant query path, not leak cross-tenant ordering context.

## What not to do

- Do not add frontend tests.
- Do not hardcode route strings when helpers exist.
- Do not use brittle assertions tied to incidental seed ordering unless sort inputs make them deterministic.
- Do not add redundant tests that simply duplicate `FindTenantUsersAsStaff.Spec.cs` structure without asserting invitation-specific behavior.
- Do not regress existing invitation semantics.

## Implementation guidance

- Follow the style of:
  - `FindTenantUsersAsStaff.Spec.cs` for auth/permission/pagination/query helper patterns
  - `FindTenantsAsStaff.Spec.cs` for cursor/search/filter coverage style
  - `CreateInvitationForTenantAsStaff.Spec.cs` for tenant invitation setup and DB assertions
- A private `GetFindUrl(...)` helper inside the new spec is appropriate.
- Use `TestAuthClient`, `TenantTestHelper`, fixture scope + `MainApiDbContext`, and existing seed constants.
- If you need precise mixed status data, create invitations directly in DB with controlled values for:
  - `TenantId`
  - `Scope`
  - `Email`
  - `CreatedAt`
  - `ExpiresAt`
  - `IsAccepted`
  - `AcceptedAt`
  - `IsRevoked`
  - `RevokedAt`
  - `InvitedByUserId`
- Keep setup readable and deterministic.

## Verification required

- Run the focused spec:
  - `cd apps/api && dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~FindInvitationsForTenantAsStaffSpec"`
- If you touch shared invitation test helpers or adjacent behavior, also run the nearest related specs as needed.
- In your final report, include:
  - files changed
  - exact tests run
  - whether all tests passed
  - any behavior gaps you found but did not change

## Expected deliverable

- A new passing integration spec file covering the tenant invitations list endpoint comprehensively enough that the tenant-details Invitations tab backend contract is protected against regressions.
