# Phase 4 Completion Fixes - Implementation Plan

**Date:** 2025-11-02  
**Status:** Ready for Implementation  
**Time:** 30-45 minutes  

## Consensus Summary

GPT 5 and Claude agree on these minimal, safe fixes to complete Phase 4:

1. ✅ **TokenHash unique index** - Performance critical
2. ✅ **Revoke idempotent** - State-transition guard (5 lines)
3. ✅ **Token generation** - Use `CryptoUtils.RandomString(32)`
4. ✅ **Tie-breaker** - Add `CreatedAt` for determinism
5. ⏭️ **Profile/auth validation** - Defer to Phase 5 endpoints

---

## Task 1: Add TokenHash Unique Index

**File:** `apps/api/Src/Features/Common/Invitation/Invitation.cs`

Add after line 13 (after other `[Index(...)]` attributes):
```csharp
[Index(nameof(TokenHash), IsUnique = true)]
```

Then create migration:
```bash
make db-add NAME=AddInvitationTokenHashUniqueIndex
make db-migrate
```

---

## Task 2: Make Revoke Idempotent

**File:** `apps/api/Src/Features/Common/Invitation/InvitationService.cs`

Replace `RevokeInvitationAsync` method (around line 124):

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

    // Idempotent: already revoked is success
    if (invitation.IsRevoked) {
        _logger.LogInformation(
            "Invitation {InvitationId} already revoked; no-op",
            invitationId
        );
        return true;
    }

    // State guard: cannot revoke accepted
    if (invitation.IsAccepted) {
        _logger.LogWarning(
            "Cannot revoke accepted invitation {InvitationId}",
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

---

## Task 3: Standardize Token Generation

**File:** `apps/api/Src/Features/Staff/Impersonation/ImpersonationService.cs`

Add using (around line 5):
```csharp
using MainApi.Src.Lib.Utils;
```

Replace method (around line 85):
```csharp
private static string GenerateSessionToken() {
    return CryptoUtils.RandomString(32);
}
```

---

## Task 4: Add Tie-Breaker

**File:** `apps/api/Src/Features/Staff/Impersonation/ImpersonationService.cs`

Update query (around line 35):
```csharp
orderby ua.Level descending, ua.CreatedAt ascending
```

---

## Task 5 (Optional): Fix Tenant Parsing

**File:** `apps/api/Src/Lib/AppServicesConfig.cs`

Replace `GetCurrentTenantId` method:
```csharp
private static Guid? GetCurrentTenantId(IHttpContextAccessor httpContextAccessor) {
    var httpContext = httpContextAccessor.HttpContext;
    if (httpContext is null) return null;
    
    var header = httpContext.Request.Headers["X-Tenant-Id"].FirstOrDefault();
    return Guid.TryParse(header, out var tenantId) ? tenantId : null;
}
```

Update DbContext registration to use nullable:
```csharp
var tenantId = GetCurrentTenantId(httpContextAccessor);
if (tenantId.HasValue) {
    options.UseTenantId(tenantId.Value);
}
```

---

## Testing

```bash
make check-write
make db-migrate
```

Verify in database:
```sql
\d invitations  -- Should show unique index on token_hash
```

---

## Commit Message

```
fix(staff): phase 4 service improvements and index optimization

- Add unique index on invitations.token_hash for O(1) lookups
- Make RevokeInvitationAsync idempotent with state guards
- Standardize token generation with CryptoUtils.RandomString
- Add CreatedAt tie-breaker for deterministic selection
- Parse X-Tenant-Id header conditionally

Refs: docs/reviews/staff-mvp-week1-phase4-rejoinder.md

Co-authored-by: factory-droid[bot] <138933559+factory-droid[bot]@users.noreply.github.com>
```
