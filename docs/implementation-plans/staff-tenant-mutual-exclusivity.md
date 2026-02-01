# Implementation Plan: Staff/Tenant Account Mutual Exclusivity

## Status: COMPLETE

All phases implemented. Key decisions:
- Suspended accounts **do count** toward mutual exclusivity (identity conflict persists)
- Proactive enforcement at invitation creation (not just acceptance)
- `Has*Account*` methods check `!IsDeleted` but NOT `!IsSuspended`

---

## Problem Summary

When a user logs out from a tenant account and logs back in as a staff user, they get a 403 error. This happens because:

1. The `publyapp-last_used_tenant` cookie persists after logout
2. `GetRedirectCode` endpoint returns the tenantId for staff users if the tenant exists (without checking access)
3. Staff user gets redirected to tenant UI → TenantAuthFilter returns 403

## Business Rule to Enforce

**Staff and Tenant/Project accounts are mutually exclusive for a given User:**
- A user can have Staff accounts OR Tenant/Project accounts, never both
- Rationale: Conflict of interest — platform admins shouldn't also be customers with the same identity
- Dogfooding: Use impersonation feature or separate email/user

---

## Shipped Implementation

### Phase 1: GetRedirectCode Fix
**File:** `apps/api/Src/Modules/Auth/Handlers/GetRedirectCode.cs`

- Staff users always return `"staff"` redirect code
- Removed session token from error logging (security fix)

### Phase 2: AccountService Enhancements
**File:** `apps/api/Src/Modules/Users/Services/AccountService.cs`

New methods added:
- `HasStaffAccountAsync(userId)` - existence-based (ignores IsSuspended)
- `HasTenantAccountAsync(userId, tenantId)` - existence-based (ignores IsSuspended)
- `HasTenantOrProjectAccountsAsync(userId)` - existence-based (ignores IsSuspended)
- `HasStaffAccountByEmailAsync(email)` - for invitation validation
- `HasTenantOrProjectAccountsByEmailAsync(email)` - for invitation validation
- `GetEmailsWithTenantOrProjectAccountsAsync(emails)` - batch for bulk invitations
- `GetEmailsWithStaffAccountsAsync(emails)` - batch for bulk invitations

New result types:
- `CreateStaffAccountResult.UserHasTenantOrProjectAccounts`
- `CreateTenantAccountResult.UserHasStaffAccount`

Key fixes:
1. `CreateStaffAccountAsync` and `CreateTenantAccountAsync` now use existence-based checks (`HasStaffAccountAsync`, `HasTenantAccountAsync`) instead of active-only checks (`IsUserStaffUserAsync`, `IsUserMemberOfTenantAsync`). This prevents 500 errors from duplicate insert attempts when suspended accounts exist.
2. Both methods wrap `SaveChangesAsync` in try-catch for `DbUpdateException` with unique constraint detection. This handles race conditions where concurrent requests pass the pre-check but then hit the unique constraint.

### Phase 3: AcceptInvitation Validation
**File:** `apps/api/Src/Modules/Invitations/Handlers/Anonymous/AcceptInvitation.cs`

- Added `IAccountService` dependency
- Validates scope conflicts when existing user accepts invitation

### Phase 4: CreateStaffUser Handler
**File:** `apps/api/Src/Modules/Users/Handlers/Staff/CreateStaffUser.cs`

- Handles `UserHasTenantOrProjectAccounts` result type

### Phase 5: Proactive Invitation Enforcement
**File:** `apps/api/Src/Modules/Invitations/Handlers/Staff/CreateStaffInvitation.cs`

- Checks `HasTenantOrProjectAccountsByEmailAsync` before creating invitation
- Query order optimized: UserExists checked first, then conflicts only if user exists

**File:** `apps/api/Src/Modules/Invitations/Handlers/Staff/BulkCreateStaffInvitations.cs`

- Batch check using `GetEmailsWithTenantOrProjectAccountsAsync`
- Returns structured 422 errors with emails as keys (better frontend handling)
- All bulk validation errors (conflicts, existing users, pending invitations, missing profiles) return structured `errors` dictionary

### Phase 6: Translation Keys
**File:** `packages/shared/lib/i18n/json/response-message.*.json`

Added:
- `user-has-tenant-or-project-accounts`
- `user-has-staff-account`

### Phase 7: Documentation
**File:** `AGENTS.md`

Added "Staff/Tenant Account Mutual Exclusivity" section documenting:
- Business rule and rationale
- Enforcement points
- Suspension behavior
- Dogfooding approach

---

## Verification Checklist

- [x] Staff user with stale tenant cookie redirects to `/staff`
- [x] Creating staff account for user with tenant accounts fails
- [x] Creating tenant account for user with staff account fails
- [x] Accepting staff invitation as user with tenant accounts fails
- [x] Accepting tenant invitation as user with staff account fails
- [x] Staff invitation to user with tenant accounts fails proactively
- [x] Bulk staff invitations with conflicting emails fail with structured errors dictionary
- [x] Suspended accounts count toward mutual exclusivity
- [x] Normal flows (new users) still work
