# Review: Phase 4 Core Services (Staff MVP Week 1)

Date: 2025-11-02

Scope reviewed (staged):
- apps/api/Src/Features/Common/Invitation/InvitationService.cs
- apps/api/Src/Features/Staff/Audit/AuditLogService.cs
- apps/api/Src/Features/Staff/Impersonation/ImpersonationService.cs
- apps/api/Src/Lib/AppServicesConfig.cs

## Key Concerns

### InvitationService
- No DB index on `token_hash` in `Invitation` entity, yet lookups use it for validation; this can cause slow validations at scale. Suggest adding an index (ideally unique if tokens are single-use).
- `RevokeInvitationAsync` revokes regardless of `IsAccepted`; typically accepted invitations should not be revocable (or should no-op). Consider guarding against revoking accepted invites.
- No verification that `profileId` matches the invitation scope (e.g., Staff invite with Staff-scoped profile). A mismatched profile scope can slip through; add an application-level check when creating invitations.

### AuditLogService
- `Request.Headers.UserAgent` may not be reliable; prefer `Request.Headers["User-Agent"].ToString()` for compatibility across ASP.NET Core versions.
- `details` serialization uses default options and will throw if the object isn’t serializable. If untrusted objects are passed, consider accepting a `string` or using tolerant serializer options with try/catch.

### ImpersonationService
- Session token generation uses concatenated GUIDs, while `SessionService` uses `CryptoUtils.RandomString`. For consistency and stronger entropy, prefer `CryptoUtils.RandomString(...)` here too.
- No explicit authorization check that `staffUserId` is allowed to impersonate; ensure endpoint layer enforces this (OK if handled by filters/permissions upstream).
- Chooses highest-level tenant account automatically; if multiple ties exist the choice is arbitrary. If that matters, make the selection criteria explicit.

### AppServicesConfig (DI)
- DI registrations for the new services are present and `AddHttpContextAccessor()` is configured — good. Note: `GetCurrentTenantId` still returns a hard-coded GUID (TODO). This isn’t directly blocking these services (Invitation is optional-tenant, Audit is no-tenant), but should be addressed before broader feature work.

## Suggested Follow-ups (non-blocking quick fixes)
- Add `[Index(nameof(TokenHash))]` (consider unique) to `Invitation` and create a migration.
- In `InvitationService.RevokeInvitationAsync`, prevent revoking accepted invites or return false/no-op with a log.
- Validate `profileId` scope matches the invitation scope during creation.
- Use `Request.Headers["User-Agent"]` in `AuditLogService` and consider safe serialization for `details`.
- Switch impersonation token generation to `CryptoUtils.RandomString` for consistency.

## Proposed Solutions

### InvitationService
- Index on token hash
  - Change: in `Invitation.cs` add an EF Core index on `TokenHash`.
    ```csharp
    // apps/api/Src/Features/Common/Invitation/Invitation.cs
    [Index(nameof(TokenHash), IsUnique = true)]
    public class Invitation : BaseAttributes, IOptionalTenantEntity { ... }
    ```
  - Follow-up: create migration and apply.

- Prevent revoking accepted invitations (idempotent revoke)
  - Change: guard in `RevokeInvitationAsync`.
    ```csharp
    public async Task<bool> RevokeInvitationAsync(Guid id, CancellationToken ct = default) {
      var inv = await _dbContext.Invitation.FindAsync(new object[]{ id }, ct);
      if (inv is null) return false;
      if (inv.IsAccepted) { _logger.LogInformation("Attempt to revoke accepted invitation {Id} ignored", id); return false; }
      if (inv.IsRevoked) return true; // idempotent
      inv.IsRevoked = true; inv.RevokedAt = DateTime.UtcNow;
      await _dbContext.SaveChangesAsync(ct);
      return true;
    }
    ```

- Verify `profileId` matches invitation scope (and tenant)
  - Change: validate profile before creating invitation.
    ```csharp
    // Staff
    var profQ = from p in _dbContext.Profile where p.Id == profileId select new { p.Id, p.ProfileScope };
    var prof = await profQ.FirstOrDefaultAsync(cancellationToken);
    if (prof is null || prof.ProfileScope != ProfileScope.Staff)
      throw new InvalidOperationException("Profile must be Staff-scoped for staff invitations");

    // Tenant
    var profQ = from p in _dbContext.Profile where p.Id == profileId select new { p.Id, p.ProfileScope, p.TenantId };
    var prof = await profQ.FirstOrDefaultAsync(cancellationToken);
    if (prof is null || prof.ProfileScope != ProfileScope.Tenant || prof.TenantId != tenantId)
      throw new InvalidOperationException("Profile must be Tenant-scoped and match the tenant for tenant invitations");
    ```

### AuditLogService
- Robust User-Agent extraction
  - Change: use header key explicitly.
    ```csharp
    UserAgent = httpContext?.Request.Headers["User-Agent"].ToString();
    ```

- Safe details serialization
  - Change: tolerate non-serializable inputs and ignore cycles.
    ```csharp
    using System.Text.Json.Serialization;
    using System.Text.Json;

    private static readonly JsonSerializerOptions JsonOptions = new() {
      DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
      ReferenceHandler = ReferenceHandler.IgnoreCycles
    };

    var detailsJson = details switch { null => null, string s => s, _ => TrySerialize(details) };

    private static string? TrySerialize(object obj) {
      try { return JsonSerializer.Serialize(obj, JsonOptions); } catch { return null; }
    }
    ```

### ImpersonationService
- Use same token generation as SessionService
  - Change:
    ```csharp
    using MainApi.Src.Lib.Utils;
    private static string GenerateSessionToken() => CryptoUtils.RandomString(32);
    ```

- Deterministic account selection (tie-breaker) or explicit target
  - Change: add secondary ordering by creation time:
    ```csharp
    var tenantAccountQuery =
      from ua in _dbContext.UserAccount
      where ua.TenantId == tenantId && ua.Scope == AccountScope.Tenant && ua.IsSuspended == false
      orderby ua.Level descending, ua.CreatedAt descending
      select ua;
    ```
  - Option: extend API to accept an explicit `userAccountId` to impersonate when provided.

- Authorization
  - Ensure endpoints wrapping this service enforce permissions (e.g., require `AccountLevel.Admin` or a permission like `staff.impersonation.start`) via existing filters; keep the service free of auth concerns per Vertical Slice conventions.

### AppServicesConfig (DI)
- Remove hard-coded tenant and read from request (when present)
  - Change: conditionally apply `UseTenantId` only if header parses.
    ```csharp
    builder.Services.AddDbContext<MainApiDbContext>((sp, options) => {
      var http = sp.GetRequiredService<IHttpContextAccessor>();
      var raw = http.HttpContext?.Request.Headers["X-Tenant-Id"].FirstOrDefault();
      options.UseNpgsql(AppEnvironment.POSTGRES_CONNECTION_STRING);
      if (Guid.TryParse(raw, out var tenantId)) {
        options.UseTenantId(tenantId);
      }
    }, ServiceLifetime.Scoped);
    ```
