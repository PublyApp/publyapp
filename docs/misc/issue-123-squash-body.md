Refactor pure junction entities to use their foreign key pairs as composite primary
keys instead of carrying synthetic UUID identifiers.

- Remove surrogate `id`, `is_deleted`, and `deleted_at` columns from the pure
  junction-table schema.
- Map `UserAccountProfile`, `ProfilePermission`, and `InvitationProfile` around
  their relationship key columns, with entity comments clarifying that these IDs
  are foreign key components rather than standalone entity IDs.
- Change profile and permission unassignment flows to hard-delete junction rows.
- Recreate the unreleased initial migration so new databases start with the
  composite-key schema directly.
- Document the junction-table convention for future agents and add an
  architecture guard that enforces it.

Verification:
- `dotnet test apps/api/Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~ArchitectureGuardSpec|FullyQualifiedName~StaffProfilePermissionsSpec|FullyQualifiedName~TenantProfilePermissionsAsStaffSpec|FullyQualifiedName~UpdateStaffUserProfilesSpec|FullyQualifiedName~UpdateStaffUserProfilesConcurrencySpec|FullyQualifiedName~DeleteStaffUserSpec|FullyQualifiedName~BulkDeleteStaffUsersSpec|FullyQualifiedName~GetScopeAuthDataSpec"`
- `just build-api`

Closes #123
