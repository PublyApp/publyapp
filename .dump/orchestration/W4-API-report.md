# W4-API report

## Findings

### F2 — Tenant-list `usersCount` excludes soft-deleted users

- File changes
  - `apps/api/Modules/Tenants/Services/TenantAsStaffService.cs:442` — added `&& !ua.User.IsDeleted` to the staff tenant-list users-count projection over `UserAccount` so list counts match active identity rows.
  - `apps/api/Modules/Tenants/Handlers/Staff/FindTenantsAsStaff.Spec.cs` — added `ItShouldExcludeSoftDeletedUsersFromUsersCountInTenantsListAggregate` and seeded helper stack (`SeedTenantWithSoftDeletedUserForFindAsync`, `AddFindTenantUserAsync`) to cover a tenant with one soft-deleted `User` identity still linked by `UserAccount`.
- Verification
  - `dotnet test apps/api/Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~FindTenantsAsStaffSpec"`
    - Included by the broader tenant-filter run below; currently green.
  - Scope check: search sweep of `apps/api/Modules/Tenants/Services/TenantAsStaffService.cs` shows all `UserAccount` count projections now gate on both `!ua.IsDeleted` and `!ua.User.IsDeleted`.

### F3 — Logo cleanup failure path can still fail PATCH after save

- File changes
  - `apps/api/Modules/Tenants/Services/TenantAsStaffService.cs:878` — moved the stale-logo reference query and delete path into the same `try/catch` boundary so transient reference-check/query errors cannot affect committed update result.
  - Added failure-injection regression spec: `apps/api/Modules/Tenants/Services/TenantAsStaffService.Spec.cs`
    - `ItShouldStillReturnSuccessWhenLogoReferenceCheckFailsAfterSave`
    - Uses a `DbCommandInterceptor` to fail after tenant `UPDATE` on the first post-update reference DB command.
    - Asserts success result, updated persisted logo, and no `DeleteAsync` call under injected failure.
- Proven-to-fail transcript (from this packet’s prior state before the final boundary fix)
  - `apps/api/Modules/Tenants/Services/TenantAsStaffService.Spec.cs` test failed:
    - `PublyApp.Api.Modules.Tenants.Services.TenantAsStaffServiceSpec.ItShouldStillReturnSuccessWhenLogoReferenceCheckFailsAfterSave [FAIL]`
    - `Expected interceptor.HasFailed to be True, but found False.`

### F4 — Locale contract should reject non-lowercase values

- File changes
  - `apps/api/Modules/Tenants/Validation/TenantValidationRules.cs:16` — changed `AllowedLocales` comparer to `StringComparer.Ordinal` (case-sensitive).
  - `apps/api/Modules/Tenants/Handlers/Staff/CreateTenantAsStaff.Spec.cs:529` — added invalid-case examples for `defaultLocale` (`FR`, `En`).
  - `apps/api/Modules/Tenants/Handlers/Staff/UpdateTenantAsStaff.Spec.cs:762` — added invalid-case examples for `defaultLocale` (`FR`, `En`).
- Verification
  - tenant spec suites (`CreateTenantAsStaff.Spec`, `UpdateTenantAsStaff.Spec`) pass as part of tenant-filter test run listed below.

### F6 — LIKE escaper under-test did not guard `_` and `\`

- File changes
  - `apps/api/Lib/Utils/LikePatternUtils.Spec.cs` — added table-driven escaping assertions for `%`, `_`, `\`, and combined order-sensitive input.
  - `apps/api/Modules/Tenants/Handlers/Staff/FindTenantsAsStaff.Spec.cs`
    - Added `ItShouldTreatABareUnderscoreSearchAsALiteralCharacterNotAWildcard`.
    - Added `ItShouldTreatABareBackslashSearchAsALiteralCharacterNotAWildcard`.
- Verification
  - Tenant find tests pass in the same filtered API test run.

## Verification

- `npx oxlint --quiet apps/api/Modules/Tenants/Services/TenantAsStaffService.cs apps/api/Modules/Tenants/Validation/TenantValidationRules.cs apps/api/Modules/Tenants/Handlers/Staff/FindTenantsAsStaff.Spec.cs apps/api/Modules/Tenants/Handlers/Staff/CreateTenantAsStaff.Spec.cs apps/api/Modules/Tenants/Handlers/Staff/UpdateTenantAsStaff.Spec.cs apps/api/Lib/Utils/LikePatternUtils.Spec.cs apps/api/Modules/Tenants/Services/TenantAsStaffService.Spec.cs`
  - Output: `No files found to lint` (oxlint is JS/TS oriented).
- `dotnet test apps/api/Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~TenantAsStaffServiceSpec|FullyQualifiedName~FindTenantsAsStaffSpec|FullyQualifiedName~CreateTenantAsStaffSpec|FullyQualifiedName~UpdateTenantAsStaffSpec|FullyQualifiedName~LikePatternUtilsSpec"`
  - `Passed! Failed: 0, Passed: 123, Skipped: 0, Total: 123`
- `pnpm --filter front-2 exec vitest run --passWithNoTests apps/front-2/src/does-not-exist.ts`
  - `No test files found, exiting with code 0`
- `pnpm --filter front-2 typecheck`
  - Fails in front-2 test/typecheck files outside this lane:
    - `src/components/ui/copy-button.test.tsx`
    - `src/components/ui/select.test.tsx`
    - `src/routes/authed/staff/tenants/$tenantId/profiles.test.tsx`
    - `src/routes/authed/staff/tenants/$tenantId/users.test.tsx`
- `just build-api`
  - Build passed.
- `dotnet test apps/api/Tests/PublyApp.Api.Tests.csproj -c Test`
  - `Passed! Failed: 0, Passed: 1102, Skipped: 0, Total: 1102`

## Handoffs

- None.

## Disputed

- None.

## Brief errors

- NONE.
