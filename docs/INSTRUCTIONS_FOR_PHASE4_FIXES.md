# Instructions for Implementing Phase 4 Completion Fixes

**Date:** 2025-11-02  
**For:** Another AI Model  
**Time Required:** 30-45 minutes  
**Risk Level:** LOW - All changes are non-breaking internal improvements

---

## Context

Phase 4 of Staff MVP Week 1 has been implemented (Invitation, AuditLog, Impersonation services). Two AI reviewers (GPT 5 and Claude) have reviewed the code and reached consensus on 5 minimal, safe fixes to complete Phase 4 properly.

**All changes are:**
- ✅ Non-breaking (no API surface changes)
- ✅ Low-risk (simple, focused improvements)
- ✅ High-value (performance + data integrity)
- ✅ Consensus-based (both AIs agree)

---

## Required Changes

### Fix 1: Add Unique Index on TokenHash (CRITICAL - 5 minutes)

**Why:** Without an index, invitation token validation does O(n) table scan. With unique index: O(1) lookup.

**File:** `apps/api/Src/Features/Common/Invitation/Invitation.cs`

**Action:** Add this line after the existing `[Index(...)]` attributes (around line 15):

```csharp
[Index(nameof(TokenHash), IsUnique = true)]
```

**Full context:**
```csharp
[Table("invitations")]
[Index(nameof(Email), nameof(Scope), nameof(IsAccepted))]
[Index(nameof(InvitedByUserId))]
[Index(nameof(ExpiresAt))]
[Index(nameof(TenantId), nameof(Scope))]
[Index(nameof(TokenHash), IsUnique = true)]  // <-- ADD THIS
public class Invitation : BaseAttributes, IOptionalTenantEntity {
```

**After adding, create migration:**
```bash
make db-add NAME=AddInvitationTokenHashUniqueIndex
make db-migrate
```

---

### Fix 2: Make RevokeInvitationAsync Idempotent (IMPORTANT - 5 minutes)

**Why:** Prevents state-transition bugs; makes API contract clearer (idempotent operations, no accidental revocation of accepted invitations).

**File:** `apps/api/Src/Features/Common/Invitation/InvitationService.cs`

**Action:** Replace the entire `RevokeInvitationAsync` method (around line 124) with:

```csharp
public async Task<bool> RevokeInvitationAsync(
    Guid invitationId,
    CancellationToken cancellationToken = default
) {
    var invitation = await _dbContext.Invitation
        .FindAsync(new object[] { invitationId }, cancellationToken);

    if (invitation is null) {
        return false;
    }

    // Idempotent: already revoked is a no-op success
    if (invitation.IsRevoked) {
        _logger.LogInformation(
            "Invitation {InvitationId} is already revoked; no-op",
            invitationId
        );
        return true;
    }

    // State-transition invariant: cannot revoke accepted invitations
    if (invitation.IsAccepted) {
        _logger.LogWarning(
            "Attempt to revoke accepted invitation {InvitationId} blocked",
            invitationId
        );
        return false;
    }

    invitation.IsRevoked = true;
    invitation.RevokedAt = DateTime.UtcNow;

    await _dbContext.SaveChangesAsync(cancellationToken);

    _logger.LogInformation("Revoked invitation {InvitationId}", invitationId);
    return true;
}
```

**What changed:**
- Added check: if already revoked, return true (idempotent)
- Added guard: if accepted, return false (can't revoke accepted invitations)

---

### Fix 3: Standardize Token Generation (CONSISTENCY - 5 minutes)

**Why:** ImpersonationService uses GUID concatenation, but SessionService uses `CryptoUtils.RandomString(32)`. Both have same entropy (256 bits) but should be consistent.

**File:** `apps/api/Src/Features/Staff/Impersonation/ImpersonationService.cs`

**Action 1:** Add using directive at top (around line 6):

```csharp
using MainApi.Src.Lib.Utils;
```

**Action 2:** Replace `GenerateSessionToken()` method (around line 85):

**Current:**
```csharp
private static string GenerateSessionToken() {
    return string.Concat(Guid.NewGuid().ToString("N"), Guid.NewGuid().ToString("N"));
}
```

**New:**
```csharp
private static string GenerateSessionToken() {
    return CryptoUtils.RandomString(32);
}
```

---

### Fix 4: Add Account Selection Tie-Breaker (DETERMINISM - 2 minutes)

**Why:** When multiple tenant accounts have the same `Level`, query returns arbitrary first match. Adding `CreatedAt` makes it deterministic (oldest account wins).

**File:** `apps/api/Src/Features/Staff/Impersonation/ImpersonationService.cs`

**Action:** Modify the `orderby` line in `CreateImpersonationSessionAsync` (around line 40):

**Current:**
```csharp
var tenantAccountQuery =
    from ua in _dbContext.UserAccount
    where ua.TenantId == tenantId
        && ua.Scope == AccountScope.Tenant
        && ua.IsSuspended == false
    orderby ua.Level descending
    select ua;
```

**New:**
```csharp
var tenantAccountQuery =
    from ua in _dbContext.UserAccount
    where ua.TenantId == tenantId
        && ua.Scope == AccountScope.Tenant
        && ua.IsSuspended == false
    orderby ua.Level descending, ua.CreatedAt ascending  // <-- ADD CreatedAt
    select ua;
```

---

### Fix 5: Parse Tenant Header Conditionally (OPTIONAL - 5 minutes)

**Why:** Removes hard-coded GUID; makes tenant filtering work properly when header is present.

**File:** `apps/api/Src/Lib/AppServicesConfig.cs`

**Action:** Find the `GetCurrentTenantId` method and DbContext registration, then update:

**Current (approximate):**
```csharp
private static Guid GetCurrentTenantId(IHttpContextAccessor httpContextAccessor) {
    // TODO: Parse from X-Tenant-Id header
    return Guid.Parse("3fa85f64-5717-4562-b3fc-2c963f66afa6");
}
```

**New:**
```csharp
private static Guid? GetCurrentTenantId(IHttpContextAccessor httpContextAccessor) {
    var httpContext = httpContextAccessor.HttpContext;
    if (httpContext is null) {
        return null;
    }
    
    var tenantIdHeader = httpContext.Request.Headers["X-Tenant-Id"].FirstOrDefault();
    if (string.IsNullOrEmpty(tenantIdHeader)) {
        return null;
    }
    
    return Guid.TryParse(tenantIdHeader, out var tenantId) ? tenantId : null;
}
```

**Also update DbContext registration to handle nullable:**
```csharp
// In AddDbContext call:
var tenantId = GetCurrentTenantId(httpContextAccessor);
if (tenantId.HasValue) {
    options.UseTenantId(tenantId.Value);
}
```

---

## Verification Steps

After all changes:

### 1. Code Quality
```bash
make check-write
```

### 2. Migration
```bash
make db-migrate
```

### 3. Verify Database Index
```bash
make dev-db
\d invitations
```

Expected output should include:
```
Indexes:
    "invitations_pkey" PRIMARY KEY, btree (id)
    "IX_invitations_token_hash" UNIQUE, btree (token_hash)  <-- NEW
    ...other indexes...
```

### 4. Run Any Existing Tests
```bash
# If tests exist:
make test-api
```

---

## Commit Message

After all fixes are complete and verified:

```bash
git add .
git commit -m "fix(staff): phase 4 service improvements and index optimization

- Add unique index on invitations.token_hash for O(1) lookups
- Make InvitationService.RevokeInvitationAsync idempotent
- Prevent revoking accepted invitations (state-transition guard)
- Standardize impersonation token generation with CryptoUtils.RandomString
- Add CreatedAt tie-breaker for deterministic account selection
- Parse X-Tenant-Id header conditionally in AppServicesConfig

Performance: Token validation queries now use indexed lookups.
Data integrity: Accepted invitations cannot be revoked; revoke is idempotent.
Consistency: All session tokens use same generation method.

Refs: docs/reviews/staff-mvp-week1-phase4-rejoinder.md

Co-authored-by: factory-droid[bot] <138933559+factory-droid[bot]@users.noreply.github.com>"
```

---

## What NOT to Do

❌ **Do NOT** add profile scope validation in services (deferred to Phase 5 endpoints)  
❌ **Do NOT** add authorization checks in services (belongs in endpoint handlers)  
❌ **Do NOT** change audit details serialization (current fail-fast is correct)  
❌ **Do NOT** modify any entity structures beyond the index attribute  
❌ **Do NOT** change any public method signatures

---

## Reference Documents

For more context, see:
- `docs/implementation-plans/phase4-fixes.md` - Detailed implementation plan
- `docs/reviews/staff-mvp-week1-phase4-review.md` - Original review
- `docs/reviews/staff-mvp-week1-phase4-counter-feedback.md` - Claude's analysis
- `docs/reviews/staff-mvp-week1-phase4-rejoinder.md` - GPT 5's consensus response
- `docs/roadmaps/staff-mvp/week-1-revised-implementation-plan.md` - Updated with addendum

---

## Expected Outcome

After these fixes:
- ✅ Invitation token lookups are O(1) instead of O(n)
- ✅ Revoke operation is idempotent and safe
- ✅ Token generation is consistent across all session types
- ✅ Account selection is deterministic
- ✅ Tenant filtering works correctly when header is present
- ✅ No breaking changes to any APIs
- ✅ Phase 4 is complete and ready for Phase 5 (endpoint implementation)

---

**Estimated Time:** 30-45 minutes total  
**Risk Level:** LOW (all internal improvements, no API changes)  
**Status:** Ready to implement
