# Issue #167: Tenant Suspend/Reactivate - Implementation Review

## Implementation Summary

### Backend Changes

**Phase 1: Database Migration**
- Created `20260201120000_AddTenantSuspendedStatusCheckConstraint.cs`
- Adds CHECK constraint ensuring `IsSuspended` and `Status` stay in sync
- Includes data cleanup for any inconsistent records

**Phase 2: Entity Methods**
- Added `Suspend()` and `Reactivate()` methods to `Tenant.cs`
- Methods atomically update both `IsSuspended` and `Status` fields

**Phase 3: Permissions & Routes**
- Added `SUSPEND` and `REACTIVATE` permissions to `TenantPermissionsForStaff.cs`
- Added route constants in `Routes.Tenants.cs`

**Phase 4: Service Layer**
- `TenantService.cs`: Added `GetTenantByIdIncludingSuspendedAsync`
- `AccountService.cs`: Added `GetUserTenantsForPickerAsync` with `IsActive` computed field
- `TenantAsStaffService.cs`: Added `SuspendTenantAsync`, `ReactivateTenantAsync`, `GetTenantByIdForStaffAsync`

**Phase 5: Handlers**
- Created `SuspendTenantAsStaff.cs` and `ReactivateTenantAsStaff.cs`
- Created `AppConflictHttpResult.cs` for 409 responses
- Added `TypedProblems.Conflict()` method
- Updated `FindTenantsAsStaff.cs` to include `IsSuspended`
- Registered endpoints in `TenantEndpointsForStaff.cs`

**Phase 6: TenantAuthFilter (D9 Security)**
- Reordered to check membership FIRST before loading tenant
- Non-members always get generic 403 (prevents ID probing)
- Members see specific `tenant-suspended` message

**Phase 7: GetTenantAuthData (D9 Security)**
- Same membership-first pattern as TenantAuthFilter

**Phase 8: GetRedirectCode**
- Uses new `GetUserTenantsForPickerAsync`
- Uses `IsActive` flag instead of string comparison
- Users with all tenants suspended see picker (not "unauthorized")

**Phase 9: Tenant Picker Endpoint**
- Created `GetUserTenantsForPicker.cs` handler
- Registered at `GET /auth/tenants-for-picker`

**Phase 11: Translations**
- Added English and French translations for tenant suspension messages

### Frontend Changes

**Phase 12: API Hooks**
- Added `useSuspendTenant`, `useReactivateTenant` mutations
- Added `useGetUserTenantsForPicker` query

**Phase 13: Tenants Table**
- Added `isSuspended` to row data
- Added Suspend/Reactivate action buttons with confirmation dialogs
- Cache invalidation on success

**Phase 15: Tenant Picker**
- Shows suspended tenants as disabled with badge
- Warning banner when user has suspended tenants
- Contact support link

**Phase 16: Error Handling**
- Global handler for `tenant-suspended` errors
- Clears tenant hint cookie to prevent loops
- Navigates to tenant picker

---

## GPT Review Prompt

I've completed the implementation of Issue #167 (Tenant Suspend/Reactivate). Please review the following changes for correctness, security, and completeness.

**Key Implementation Details:**

1. **D9 Security (Membership-First):** Both `TenantAuthFilter` and `GetTenantAuthData` check membership BEFORE loading tenant to prevent ID probing. Non-members always get generic 403.

2. **Atomic Updates:** Uses `ExecuteUpdateAsync` with WHERE clause to handle race conditions.

3. **IsActive Computed Field:** `TenantForPicker.IsActive` is computed server-side using enum comparison (not string), ensuring consistency with `ActiveCount`.

4. **CHECK Constraint:** Database enforces `(is_suspended = true AND status = 30) OR (is_suspended = false AND status != 30)`

5. **Frontend Error Handling:** Global handler catches `tenant-suspended` errors, clears tenant hint cookie, and redirects to picker.

**Files Changed (Backend):**
- Migration: `20260201120000_AddTenantSuspendedStatusCheckConstraint.cs`
- Entities: `Tenant.cs` (Suspend/Reactivate methods)
- Services: `TenantService.cs`, `AccountService.cs`, `TenantAsStaffService.cs`
- Handlers: `SuspendTenantAsStaff.cs`, `ReactivateTenantAsStaff.cs`, `GetUserTenantsForPicker.cs`
- Filters: `TenantAuthFilter.cs`, `GetTenantAuthData.cs`, `GetRedirectCode.cs`
- Endpoints: `TenantEndpointsForStaff.cs`, `AuthEndpoints.cs`

**Files Changed (Frontend):**
- Hooks: `staff-tenant.hooks.ts`, `auth.hooks.ts`
- Components: `tenants-table.tsx`, `tenant-portal-page.tsx`
- Error handling: `query-client.tsx`, `tenant-hint-cookie.utils.ts`
- i18n: `common.en.json`, `common.fr.json`, `response-message.en.json`, `response-message.fr.json`

**Please review for:**
1. Security gaps in D9 implementation
2. Race condition handling completeness
3. Missing edge cases
4. Any inconsistencies between plan and implementation

---

## Round 2 Fixes (GPT Feedback)

**Blocker Fixed:**
- Removed session token logging from `GetTenantAuthData.cs` (lines 65, 89) and `GetUserTenantsForPicker.cs` (line 37)
- Changed to `HasSessionToken = authContext.SessionToken is not null` instead of logging the actual token

**Non-blocking Fixes:**
1. `.claude/settings.local.json` - Unstaged from git
2. Success toasts - Changed from `showSuccessToast: true` to `successMessage: 'tenant-suspended-success'` / `tenant-reactivated-success` (added translations)
3. Legacy cookie clearing - Added `clearLegacyTenantFromBrowser()` call in tenant-suspended handler to prevent fallback to suspended tenant
4. Support email placeholder - Added TODO comment for future env var

## Round 3 Fixes (GPT Feedback)

**Additional session token logging removed:**
- `GetUserAuthData.cs` lines 35 and 50 - Changed to `HasSessionToken`
- `GetUserTenants.cs` line 33 - Changed to `HasSessionToken`

**Success toast translation keys:**
- Moved from `common.*.json` to `response-message.*.json` (correct namespace for toast system)
- Keys: `tenant-suspended-success`, `tenant-reactivated-success`

**Remaining (Acknowledged, non-blocking):**
- Race condition messaging could be improved to distinguish "state changed" from "already in state"
- Support email should come from config (marked with TODO)
