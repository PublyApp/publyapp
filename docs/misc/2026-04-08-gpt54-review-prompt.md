# Prompt for GPT 5.4: Severe Code Review - Status Model Unification

## Context

You are requested to perform a **severe, uncompromising code review** of the Status Model Unification implementation completed on branch `feat/status-model-unification`.

### Background

This implementation unifies lifecycle modeling across 5 entities by replacing boolean flags with enum-based status fields:

| Entity | Removed Fields | New Status Enum |
|--------|---------------|-----------------|
| User | `IsSuspended` | `UserStatus` (Inactive, Pending, Suspended, Active) |
| Tenant | `IsSuspended` | `TenantStatus` (Pending, Active, Suspended) |
| UserAccount | `IsSuspended` | `AccountStatus` (Active, Suspended, GloballySuspended) |
| Invitation | `IsAccepted`, `IsRevoked` | `InvitationStatus` (Pending, Accepted, Expired, Revoked) |
| Project | `IsActive` | `ProjectStatus` (Active, Inactive) |

### Key Domain Rules (Must Not Be Violated)

1. **User.Status == Suspended** is the global identity suspension state
2. **Tenant.Status == Suspended** is the tenant lifecycle suspension state  
3. **UserAccount.Status == Suspended** is membership-local suspension only
4. **GloballySuspended** must stay a derived tenant-user read-model status (not persisted as local state)
5. **Invitation.Status** owns invitation lifecycle; `AcceptedAt`/`RevokedAt` remain event metadata
6. **Expired** remains derived from `Invitation.Status == Pending && ExpiresAt <= now`

## Review Scope

Perform a **line-by-line, uncompromising review** of all changes. Do not be polite. Find every issue, no matter how small.

### Files to Review

All modified files in the implementation:

**Entities (5 files):**
- `apps/api/Src/Modules/Users/Entities/User.cs`
- `apps/api/Src/Modules/Tenants/Entities/Tenant.cs`
- `apps/api/Src/Modules/Users/Entities/UserAccount.cs`
- `apps/api/Src/Modules/Invitations/Entities/Invitation.cs`
- `apps/api/Src/Modules/Projects/Entities/Project.cs`

**Services (~12 files):**
- `apps/api/Src/Modules/Users/Services/UserService.cs`
- `apps/api/Src/Modules/Users/Services/AccountService.cs`
- `apps/api/Src/Modules/Tenants/Services/TenantAsStaffService.cs`
- `apps/api/Src/Modules/Invitations/Services/InvitationService.cs`
- `apps/api/Src/Modules/Projects/Services/ProjectService.cs`
- `apps/api/Src/Modules/Auth/Services/SessionService.cs`
- `apps/api/Src/Modules/Permissions/Services/PermissionService.cs`
- `apps/api/Src/Modules/Impersonations/Services/ImpersonationService.cs`
- `apps/api/Src/Modules/Profiles/Services/ProfileAsStaffService.cs`

**Handlers (~15 files):**
- `apps/api/Src/Modules/Users/Handlers/Staff/FindTenantUsersAsStaff.cs`
- `apps/api/Src/Modules/Users/Handlers/Staff/UpdateTenantUserAsStaff.cs`
- `apps/api/Src/Modules/Users/Handlers/Staff/SuspendTenantUserAsStaff.cs`
- `apps/api/Src/Modules/Users/Handlers/Staff/ReactivateTenantUserAsStaff.cs`
- `apps/api/Src/Modules/Users/Handlers/Staff/UpdateStaffUser.cs`
- `apps/api/Src/Modules/Auth/Handlers/PasswordLogin.cs`
- `apps/api/Src/Modules/Auth/Handlers/GetTenantAuthData.cs`
- `apps/api/Src/Modules/Auth/Handlers/GetUserTenantsForPicker.cs`
- `apps/api/Src/Modules/Tenants/Handlers/Staff/SuspendTenantAsStaff.cs`
- `apps/api/Src/Modules/Tenants/Handlers/Staff/ReactivateTenantAsStaff.cs`
- `apps/api/Src/Modules/Tenants/Handlers/Staff/UpdateTenantAsStaff.cs`
- `apps/api/Src/Modules/Tenants/Handlers/Staff/GetTenantAsStaff.cs`
- `apps/api/Src/Modules/Invitations/Handlers/Anonymous/AcceptInvitation.cs`
- `apps/api/Src/Modules/Invitations/Handlers/Staff/RevokeInvitation.cs`
- `apps/api/Src/Lib/Filters/TenantAuthFilter.cs`
- `apps/api/Src/Lib/Auth/RequestAuthContext.cs`

**Tests (~15 files):**
- All corresponding `.Spec.cs` files

## Review Checklist

### 1. Entity Design (Critical)

- [ ] **Status enum values are correct** - Check numeric values match design spec
- [ ] **Database column mappings correct** - snake_case column names
- [ ] **Default values correct** - All entities have appropriate defaults
- [ ] **No orphaned boolean columns** - All IsSuspended/IsAccepted/IsRevoked/IsActive removed
- [ ] **GloballySuspended handling** - Never persisted as local state
- [ ] **Navigation properties intact** - No broken relationships

### 2. Service Layer (Critical)

- [ ] **All boolean references updated** - No `entity.IsSuspended` or similar remain
- [ ] **Status comparisons correct** - Using `==` and `!=` with proper enum values
- [ ] **Query filters correct** - LINQ queries use status enums properly
- [ ] **Business logic preserved** - Suspension semantics unchanged
- [ ] **No null reference risks** - Status is non-nullable with defaults
- [ ] **Staff methods use ForStaff variants** - Proper scoping

### 3. Handler/Endpoint Layer (Critical)

- [ ] **Response DTOs correct** - IsSuspended in DTOs derived from Status
- [ ] **API contract preserved** - No breaking changes to JSON responses
- [ ] **Status filter handling** - Multiple status filters work correctly
- [ ] **Error responses correct** - Proper error keys and messages
- [ ] **RFC 7807 compliance** - Error responses follow standard

### 4. Auth & Security (Critical)

- [ ] **Session validation** - Suspended users cannot authenticate
- [ ] **Tenant auth filter** - Suspended tenants properly rejected
- [ ] **Permission checks** - No bypass of suspension state
- [ ] **Auth invariants maintained** - User.Status dominates membership

### 5. Migration (Critical)

- [ ] **Migration properly ordered** - Schema changes before data backfill
- [ ] **Data backfill correct** - Existing data migrated to proper status values
- [ ] **Down migration viable** - Can rollback if needed
- [ ] **No data loss** - All boolean state preserved in status

### 6. Test Coverage (High)

- [ ] **All test assertions updated** - No references to removed properties
- [ ] **Test seed data correct** - Uses new status enums
- [ ] **Edge cases covered** - Suspension scenarios tested
- [ ] **Integration tests pass** - All tests green

### 7. Frontend Compatibility (High)

- [ ] **API contract unchanged** - Frontend can consume responses
- [ ] **Client generation works** - Kiota generates compatible client
- [ ] **TypeScript types correct** - Generated types match C# types

### 8. Performance (Medium)

- [ ] **Query performance** - No N+1 from status lookups
- [ ] **Index usage** - Status columns properly indexed
- [ ] **No redundant checks** - Don't check both Status and IsSuspended

### 9. Code Quality (Medium)

- [ ] **Namespace correctness** - IDE0130 compliance
- [ ] **Consistent patterns** - Same pattern used everywhere
- [ ] **No magic numbers** - Enum values used, not hardcoded
- [ ] **Guard clauses proper** - Early returns for error cases
- [ ] **Comments accurate** - No outdated references

### 10. Documentation (Medium)

- [ ] **XML comments updated** - No references to removed properties
- [ ] **Design spec alignment** - Implementation matches spec
- [ ] **Breaking changes documented** - Migration notes complete

## Severity Levels

Grade each finding with one of:

| Level | Description | Action Required |
|-------|-------------|-----------------|
| **CRITICAL** | Security risk, data loss, or broken core functionality | Must fix before merge |
| **HIGH** | Business logic error, API contract violation, or test failure | Must fix before merge |
| **MEDIUM** | Code quality issue, inconsistency, or technical debt | Should fix before merge |
| **LOW** | Style issue, minor optimization, or nitpick | Can address post-merge |

## Required Output Format

Provide your review in the following structure:

```markdown
## Executive Summary
- Total issues found: X (Critical: Y, High: Z, Medium: W, Low: V)
- Overall assessment: [PASS / CONDITIONAL / FAIL]
- Recommended action: [MERGE / FIX_REQUIRED / REJECT]

## Critical Issues (Must Fix)

### 1. [File]:[Line] - [Brief Title]
**Severity:** CRITICAL
**Issue:** Detailed description
**Risk:** What could go wrong
**Fix:** Specific code change required

## High Issues (Must Fix)
[Same format]

## Medium Issues (Should Fix)
[Same format]

## Low Issues (Consider)
[Same format]

## Positive Findings
- Well-executed aspects worth acknowledging

## Questions/Clarifications
- Areas needing more context
```

## Reference Materials

Review against these documents:

1. **Implementation Plan:** `docs/superpowers/plans/2026-04-06-status-model-unification.md`
2. **Design Spec:** `docs/superpowers/specs/2026-04-06-status-model-unification-design.md`
3. **Architecture Guide:** `docs/guides/api-module-structure.md`
4. **Project Conventions:** `AGENTS.md` and referenced guides

## Specific Code Patterns to Verify

### Pattern 1: Status Comparison
```csharp
// CORRECT:
user.Status == UserStatus.Suspended
user.Status != UserStatus.Suspended

// WRONG:
user.IsSuspended == true
user.IsSuspended
!user.IsSuspended
```

### Pattern 2: Tenant-User Status Derivation
```csharp
// CORRECT:
AccountStatus.GloballySuspended is READ-ONLY derived
// Never set directly; computed from user.Status == UserStatus.Suspended

// WRONG:
userAccount.Status = AccountStatus.GloballySuspended;
```

### Pattern 3: Query Filters
```csharp
// CORRECT:
where ua.Status != AccountStatus.Suspended
where ua.User.Status != UserStatus.Suspended

// WRONG:
where !ua.IsSuspended
where !ua.User.IsSuspended
```

### Pattern 4: Migration Backfill
```sql
-- CORRECT for UserAccounts:
UPDATE user_accounts SET status = 0 WHERE is_suspended = false;
UPDATE user_accounts SET status = 1 WHERE is_suspended = true;

-- CORRECT for Invitations:
UPDATE invitations SET status = CASE 
    WHEN accepted_at IS NOT NULL THEN 1  -- Accepted
    WHEN revoked_at IS NOT NULL THEN 2   -- Revoked
    ELSE 0                               -- Pending
END;
```

## Final Instructions

1. **Be ruthless.** If something is questionable, flag it.
2. **Verify every file.** Don't trust that changes are consistent.
3. **Check domain logic.** Suspension semantics are critical.
4. **Validate tests.** Tests must prove correctness, not just exist.
5. **Question assumptions.** If something looks odd, ask why.

The implementation is complete and all tests pass, but your job is to find what was missed or what could fail in production.

**Begin your review now.**
