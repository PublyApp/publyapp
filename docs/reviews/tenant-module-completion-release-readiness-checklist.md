# Tenant Module Completion Release Readiness Checklist

## Purpose

This checklist closes the loop on the original intent of the tenant module
completion work:

- make the implementation sound
- make the touched slices consistent with repo conventions
- make the resulting code safe to merge and continue building on

This is not a statement about every unrelated legacy inconsistency in the
repository. It is a release-readiness view for the tenant-module completion
scope and the repo-wide convention work that was required to stabilize it.

## Scope Covered

### Phase 3 - List Improvements

- A2: bulk tenant actions
- A3: tenant export behavior

### Phase 4 - User Management

- B3: invite tenant user
- B4: remove tenant user
- B5: update tenant user level/details
- B6: tenant-user search and filtering

### Phase 5 - Integration Tests

- C1: create-tenant tests
- C2: find-tenants tests

### Repo-wide convention cleanup directly required by this work

- malformed route-ID handling
- empty PATCH-body guards
- impossible-state auth guard clauses
- `PatchField<T>` usage for clearable PATCH fields
- snake_case query parameter conventions
- no `ToLower()` / `ToLowerInvariant()` comparison or dispatch patterns
- body-getter caching guidance

## Go / No-Go Summary

### Current Recommendation

`GO`, with one non-blocking follow-up outside this workstream:

- the known `MSB3277` EF Core package-version skew warning still exists and
  should be cleaned up separately

### Why this is a `GO`

- the reviewed tenant-module behaviors are now consistent with the repo rules
- the remaining issues from the review rounds were fixed, not deferred
- API contract changes were regenerated into OpenAPI + TS client
- targeted integration verification passed for the touched slices
- the repo guides were updated so future agents have explicit conventions to follow

## Readiness Checklist

## 1. Plan Soundness

- [x] The implementation plan was corrected before execution.
- [x] Contradictory validator guidance was removed.
- [x] Permission naming mismatches were resolved.
- [x] Verification-only items were separated from implementation items.
- [x] Stale review-corrections appendices were replaced with current decisions.

Status: Ready.

## 2. Backend Contract Correctness

- [x] Staff and tenant-user PATCH routes return RFC 7807 errors correctly.
- [x] Malformed route IDs now use string route binding + `Guid.TryParse`.
- [x] Malformed route IDs return `ResponseKeys.MalformedId`.
- [x] Empty PATCH bodies are rejected where required.
- [x] Update handlers return `Ok<TResult>` with DTO payloads.
- [x] Delete/action handlers return `Ok<ApiResponse>` where appropriate.

Status: Ready.

## 3. Tenant User Mutation Semantics

- [x] `UpdateTenantUserAsStaff` uses `PatchField<T>` semantics for clearable nullable fields.
- [x] `UpdateStaffUser` was aligned to the same `PatchField<T>` pattern where needed.
- [x] Null/omitted/value behavior is no longer conflated for the reviewed PATCH fields.
- [x] “No fields to update” behavior is consistent in the touched update slices.

Status: Ready.

## 4. Admin Invariant Safety

- [x] Last-admin checks were aligned across remove/demote/suspend logic.
- [x] The dangerous partial-commit transaction shape was removed.
- [x] The mixed tenant-user update path now applies changes atomically.
- [x] The relevant last-admin behavior is covered by targeted tests.

Status: Ready.

## 5. Frontend / Generated Contract Alignment

- [x] Generated OpenAPI reflects the implemented backend contract.
- [x] Generated TS client was regenerated after contract changes.
- [x] Frontend hooks were aligned to the generated contract.
- [x] Review-identified stale contract mismatches were removed.
- [x] Frontend type-check passes after regeneration.

Status: Ready.

## 6. Search / Filter / Pagination Conventions

- [x] `CursorPaginatedQuery` and `OffsetPaginatedQuery` expose snake_case query names.
- [x] Query-parameter docs now match the implemented naming convention.
- [x] Multi-word query parameter names no longer use collapsed lowercase like `updatedat`.
- [x] Offset pagination type names are consistent after the rename.
- [x] Validator docs were updated to the new base-type names.

Status: Ready.

## 7. Case-Insensitive Comparison / Dispatch Rules

- [x] The targeted `ToLower*()` dispatch/comparison violations were removed.
- [x] Sort dispatch now uses case-insensitive comparer-based lookup where required.
- [x] Status parsing/allowlists in the reviewed slices no longer rely on lowered-string dispatch.
- [x] Remaining legitimate lowercase usages are normalization/serialization, not dispatch.

Status: Ready.

## 8. Route-Parameter Convention Compliance

- [x] No remaining module handlers bind route IDs directly as `[FromRoute] Guid ...`.
- [x] Touched route handlers now consistently own malformed-ID responses.
- [x] Existing specs for the touched handlers now include malformed-ID coverage where added.

Status: Ready.

## 9. Impossible-State Guard Clause Compliance

- [x] Staff-only endpoints reviewed in this work now treat missing `AccountStaff` as an impossible-state guard failure, not a user-facing business error.
- [x] The remaining incorrect `BadRequest("Unauthorized")` fallback in the touched scope was removed.

Status: Ready.

## 10. Validation / Parser Ownership

- [x] System-notice severity validation now uses the entity parser.
- [x] Tenant status parsing uses `Tenant.ParseStatus`.
- [x] Account-level parsing in the touched tenant creation path uses the entity parser.
- [x] Stale validator constants left behind after parser migration were removed.

Status: Ready.

## 11. Tests

- [x] Targeted integration specs exist for the higher-risk tenant-user mutation paths.
- [x] Malformed-ID behavior is asserted in the reviewed slices.
- [x] Last-admin mutation behavior is covered in the reviewed tenant-user specs.
- [x] Targeted API test execution for the touched areas passed.

Status: Ready.

## 12. Documentation / Future-Agent Safety

- [x] Repo guides now explicitly define the API naming split:
  - internal C# = PascalCase
  - DB columns = snake_case
  - JSON body/response = camelCase for now
  - URL/query params = snake_case
- [x] Repo guides now explicitly ban `ToLower*()` comparison/dispatch.
- [x] Repo guides now explicitly define the body-getter caching rule.
- [x] Execution-plan and agent-prompt docs were created for weaker follow-up agents.

Status: Ready.

## Verification Record

The following verification was performed during the review/remediation cycle:

- `make build-api`
- `make generate-client`
- `make tsc-front`
- targeted API integration tests for the touched tenant/system-notice/update flows

Most recent targeted verification after the final cleanup:

- `make build-api` passed
- `make generate-client` passed
- `make tsc-front` passed
- targeted API tests passed: `34/34`

## Remaining Non-Blocking Follow-Up

These are not blockers for merging the tenant-module completion work, but they
still exist:

1. `MSB3277` EF Core version-skew warning
   - This appeared in targeted test runs.
   - It should be cleaned up in package references, but it does not currently
     invalidate the reviewed tenant-module implementation.

2. Unrelated legacy repo cleanup
   - This checklist does not claim every unrelated historical inconsistency in
     the repository has been removed.
   - It only claims the tenant-module completion scope and the directly related
     convention cleanup are in a mergeable state.

## Final Decision

### Merge Decision

`MERGEABLE`

### Rationale

The original intent of this work has been met:

- the tenant-module completion implementation is now technically sound
- the high-risk mutation and contract issues identified across the review rounds
  were fixed
- the touched slices were aligned to the repo conventions
- the supporting documentation now makes those conventions explicit for future
  agents and follow-up work

If you want a stricter release gate than this, the only additional step I would
recommend before merge is running the full API suite (`make test-api`) and
cleaning up the EF Core package-version warning in a separate maintenance pass.
