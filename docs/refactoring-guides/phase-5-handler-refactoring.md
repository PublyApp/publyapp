# Phase 5 Handler Refactoring Guide

**Status:** Ready for implementation
**Date:** November 5, 2025
**Estimated Time:** 2-3 hours

## Overview

This guide documents all the changes needed to bring the Phase 5 implementation into compliance with our coding standards. All rules have been documented in `AGENTS.md`.

## Issues to Fix

### 1. File Structure (Vertical Slice Architecture)
- ❌ **Current:** `InvitationDtos.cs` and `InvitationValidators.cs` are separate files
- ✅ **Required:** Merge DTOs and validators into their respective handler files

### 2. DTO Naming Conventions
- ❌ **Current:** `CreateStaffInvitationRequest`, `AcceptInvitationRequest` (Request suffix)
- ✅ **Required:** `CreateStaffInvitationBody`, `AcceptInvitationBody` (Body suffix)
- ❌ **Current:** `InvitationResponse`, `InvitationTokenResponse` (generic names)
- ✅ **Required:** Descriptive names without Dto suffix

### 3. Handler Method Naming
- ❌ **Current:** `Handle()` method name
- ✅ **Required:** `HandleCreateStaffInvitation()`, `HandleAcceptInvitation()`, etc.

### 4. Service Layer Separation
- ❌ **Current:** Handlers access `MainApiDbContext` directly
- ✅ **Required:** Move all database logic to `InvitationService`

### 5. Line Length
- ❌ **Current:** Long lines exceeding 100 characters (e.g., line 15 in CreateStaffInvitation.cs)
- ✅ **Required:** Break lines > 100 characters

### 6. String Comparison
- ❌ **Current:** `email.ToLowerInvariant() == other.ToLowerInvariant()`
- ✅ **Required:** `email.Equals(other, StringComparison.OrdinalIgnoreCase)`

### 7. Request Body DTOs
- ❌ **Current:** Typed properties (`string Email`, `Guid ProfileId`)
- ✅ **Required:** `JsonElement` properties for proper validation

### 8. OpenAPI Documentation
- ❌ **Current:** Using `ApiResponse` with manual `ProducesApiResponses`
- ✅ **Required:** Use `TypedProblems.*` methods for automatic OpenAPI documentation (RFC 7807)

## Detailed Refactoring Steps

### Step 1: Update InvitationService (Add Missing Methods)

**File:** `apps/api/Src/Features/Common/Invitation/InvitationService.cs`

Add methods to handle database queries currently in handlers:

```csharp
public interface IInvitationService {
    // Existing methods...

    // Add these new methods:
    Task<Profile?> GetStaffProfileAsync(Guid profileId, CancellationToken cancellationToken);
    Task<bool> UserExistsAsync(string email, CancellationToken cancellationToken);
    Task<bool> PendingInvitationExistsAsync(string email, InvitationScope scope, CancellationToken cancellationToken);
    Task<List<InvitationListItem>> ListStaffInvitationsAsync(CancellationToken cancellationToken);
}

public class InvitationService : IInvitationService {
    // ... existing implementation

    public async Task<Profile?> GetStaffProfileAsync(
        Guid profileId,
        CancellationToken cancellationToken
    ) {
        return await (
            from p in _dbContext.Profile
            where p.Id == profileId && p.ProfileScope == ProfileScope.Staff
            select p
        ).FirstOrDefaultAsync(cancellationToken);
    }

    public async Task<bool> UserExistsAsync(
        string email,
        CancellationToken cancellationToken
    ) {
        var normalizedEmail = email.ToLowerInvariant();
        return await (
            from u in _dbContext.User
            where u.Email == normalizedEmail
            select u
        ).AnyAsync(cancellationToken);
    }

    public async Task<bool> PendingInvitationExistsAsync(
        string email,
        InvitationScope scope,
        CancellationToken cancellationToken
    ) {
        var normalizedEmail = email.ToLowerInvariant();
        return await (
            from inv in _dbContext.Invitation
            where inv.Email == normalizedEmail
                && inv.Scope == scope
                && inv.IsAccepted == false
                && inv.IsRevoked == false
                && inv.ExpiresAt > DateTime.UtcNow
            select inv
        ).AnyAsync(cancellationToken);
    }

    public async Task<List<InvitationListItem>> ListStaffInvitationsAsync(
        CancellationToken cancellationToken
    ) {
        var invitationsQuery =
            from inv in _dbContext.Invitation
            where inv.Scope == InvitationScope.Staff
            join profile in _dbContext.Profile on inv.ProfileId equals profile.Id
            join inviter in _dbContext.User on inv.InvitedByUserId equals inviter.Id
            orderby inv.CreatedAt descending
            select new InvitationListItem {
                Id = inv.GetRequiredId(),
                Email = inv.Email,
                Scope = "Staff",
                ProfileName = profile.Name,
                ExpiresAt = inv.ExpiresAt,
                IsAccepted = inv.IsAccepted,
                IsRevoked = inv.IsRevoked,
                CreatedAt = inv.CreatedAt.Value,
                InvitedByName = $"{inviter.FirstName} {inviter.LastName}"
            };

        return await invitationsQuery.ToListAsync(cancellationToken);
    }
}

// Response DTO for list items
public record InvitationListItem {
    public required Guid Id { get; init; }
    public required string Email { get; init; }
    public required string Scope { get; init; }
    public required string ProfileName { get; init; }
    public required DateTime ExpiresAt { get; init; }
    public required bool IsAccepted { get; init; }
    public required bool IsRevoked { get; init; }
    public required DateTime CreatedAt { get; init; }
    public string? InvitedByName { get; init; }
}
```

### Step 2: Refactor CreateStaffInvitation Handler

**File:** `apps/api/Src/Features/Staff/Invitations/Handlers/CreateStaffInvitation.cs`

**Complete refactored file:**

```csharp
using System.Text.Json;
using FluentValidation;
using MainApi.Localization;
using MainApi.Src.Data.DbContext;
using MainApi.Src.Features.Common.Account;
using MainApi.Src.Features.Common.Invitation;
using MainApi.Src.Features.Staff.Audit;
using MainApi.Src.Lib;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Features.Staff.Invitations.Handlers;

// ✅ Request DTO with JsonElement and Body suffix
public record CreateStaffInvitationBody {
    public required JsonElement Email { get; init; }
    public required JsonElement ProfileId { get; init; }
}

// ✅ Response DTO with descriptive name (no Dto suffix)
public record InvitationCreated {
    public required Guid InvitationId { get; init; }
    public required string Token { get; init; }
    public required DateTime ExpiresAt { get; init; }
}

// ✅ Validator in same file
public class CreateStaffInvitationBodyValidator : AbstractValidator<CreateStaffInvitationBody> {
    public CreateStaffInvitationBodyValidator() {
        RuleFor(x => x.Email)
            .Must(e => e.ValueKind == JsonValueKind.String)
            .WithMessage("Email must be a string")
            .Must(e => !string.IsNullOrWhiteSpace(e.GetString()))
            .WithMessage("Email is required")
            .Must(BeValidEmail)
            .WithMessage("Invalid email format");

        RuleFor(x => x.ProfileId)
            .Must(e => e.ValueKind == JsonValueKind.String)
            .WithMessage("ProfileId must be a string")
            .Must(BeValidGuid)
            .WithMessage("ProfileId must be a valid GUID");
    }

    private bool BeValidEmail(JsonElement element) {
        if (element.ValueKind != JsonValueKind.String) return false;
        var email = element.GetString();
        return !string.IsNullOrEmpty(email) && email.Contains('@');
    }

    private bool BeValidGuid(JsonElement element) {
        if (element.ValueKind != JsonValueKind.String) return false;
        return Guid.TryParse(element.GetString(), out _);
    }
}

// ✅ Handler with descriptive method name
public static class CreateStaffInvitation {
    // ✅ Line length < 100 chars per line
    // ✅ Use typed result classes for automatic OpenAPI documentation
    public static async Task<Results<
        Ok<InvitationCreated>,
        AppBadRequestHttpResult,
        AppForbiddenHttpResult
    >> HandleCreateStaffInvitation(  // ✅ Descriptive name
        [FromServices] IAuthContext authContext,
        [FromServices] IInvitationService invitationService,  // ✅ Service layer
        [FromServices] IAuditLogService auditLogService,
        [FromBody] CreateStaffInvitationBody request,
        CancellationToken cancellationToken = default
    ) {
        // Authorization check
        var account = authContext.AccountStaff;
        if (account is null
            || account.Scope != AccountScope.Staff
            || account.Level != AccountLevel.Admin) {
            return TypedProblems.Forbidden(
                "User does not have the necessary permissions",
                ResponseKeys.UserDoesNotHaveTheNecessaryPermissions
            );
        }

        // Extract values after validation
        var email = request.Email.GetString()!;
        var profileId = Guid.Parse(request.ProfileId.GetString()!);

        // Validate profile via service
        var profile = await invitationService.GetStaffProfileAsync(
            profileId,
            cancellationToken
        );
        if (profile is null) {
            return TypedProblems.BadRequest("Profile not found", ResponseKeys.NotFound);
        }

        // Check if user exists via service
        var userExists = await invitationService.UserExistsAsync(
            email,
            cancellationToken
        );
        if (userExists) {
            return TypedProblems.BadRequest(
                "User already exists",
                ResponseKeys.UserAlreadyExists
            );
        }

        // Check for pending invitation via service
        var pendingExists = await invitationService.PendingInvitationExistsAsync(
            email,
            InvitationScope.Staff,
            cancellationToken
        );
        if (pendingExists) {
            return TypedProblems.BadRequest(
                "Pending invitation exists",
                ResponseKeys.BadRequest
            );
        }

        // Create invitation via service
        var (invitation, token) = await invitationService.CreateStaffInvitationAsync(
            email,
            profileId,
            account.UserId,
            cancellationToken
        );

        // Audit log
        await auditLogService.LogAsync(
            account.UserId,
            AuditActions.InvitationCreated,
            invitation.GetRequiredId(),
            new { Email = email, ProfileId = profileId, Scope = "Staff" },
            cancellationToken
        );

        return TypedResults.Ok(new InvitationCreated {
            InvitationId = invitation.GetRequiredId(),
            Token = token,
            ExpiresAt = invitation.ExpiresAt
        });
    }
}
```

### Step 3: Refactor GetInvitationDetails Handler

**File:** `apps/api/Src/Features/Staff/Invitations/Handlers/GetInvitationDetails.cs`

```csharp
using MainApi.Src.Features.Common.Invitation;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Localization;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Features.Staff.Invitations.Handlers;

// ✅ Response DTO (no separate file)
public record InvitationDetails {
    public required string Email { get; init; }
    public required string ProfileName { get; init; }
    public required DateTime ExpiresAt { get; init; }
}

public static class GetInvitationDetails {
    // ✅ Use typed result classes for automatic OpenAPI documentation
    public static async Task<Results<
        Ok<InvitationDetails>,
        AppNotFoundHttpResult
    >> HandleGetInvitationDetails(  // ✅ Descriptive name
        [FromRoute] string token,
        [FromServices] IInvitationService invitationService,
        CancellationToken cancellationToken = default
    ) {
        // Validate token via service
        var invitation = await invitationService.ValidateInvitationTokenAsync(
            token,
            cancellationToken
        );

        if (invitation is null) {
            return TypedProblems.NotFound(
                "Invitation not found or expired",
                ResponseKeys.NotFound
            );
        }

        // Get profile via service
        var profile = await invitationService.GetStaffProfileAsync(
            invitation.ProfileId,
            cancellationToken
        );

        if (profile is null) {
            return TypedProblems.NotFound(
                "Profile not found",
                ResponseKeys.ProfileNotFound
            );
        }

        return TypedResults.Ok(new InvitationDetails {
            Email = invitation.Email,
            ProfileName = profile.Name,
            ExpiresAt = invitation.ExpiresAt
        });
    }
}
```

### Step 4: Fix InvitationEndpoints.cs

**File:** `apps/api/Src/Features/Staff/Invitations/InvitationEndpoints.cs`

Update to use new handler names. Status codes are automatically documented via typed results:

```csharp
using MainApi.Src.Features.Staff.Invitations.Handlers;
using MainApi.Src.Lib;
using MainApi.Src.Lib.Extensions;
using MainApi.Src.Lib.Filters;
using MainApi.Src.Lib.Utils;

namespace MainApi.Src.Features.Staff.Invitations;

public static class InvitationEndpoints {
    // Anonymous endpoints: mounted outside /staff
    public static IEndpointRouteBuilder MapInvitationAnonymousEndpoints(
        this IEndpointRouteBuilder app
    ) {
        var group = app.MapGroup(PathUtils.GetLastSegment(RoutePath.Invitations.Root))
            .WithTags("Invitations (Anonymous)")
            .WithOpenApi();

        group.MapGet(
                PathUtils.GetLastSegment(RoutePath.Invitations.DetailsByToken, 2),
                GetInvitationDetails.HandleGetInvitationDetails  // ✅ Updated name
            )
            .WithName("GetInvitationDetails")
            .WithSummary("Get invitation details by token");
            // ✅ Status codes auto-documented via AppNotFoundHttpResult in handler

        group.MapPost(
                PathUtils.GetLastSegment(RoutePath.Invitations.AcceptByToken, 2),
                AcceptInvitation.HandleAcceptInvitation  // ✅ Updated name
            )
            .WithName("AcceptInvitation")
            .WithSummary("Accept invitation and create account + session")
            .WithReqBodyValidation<AcceptInvitationBody>();  // ✅ Updated name
            // ✅ Status codes auto-documented via typed results

        return app;
    }

    // Staff-protected endpoints
    public static IEndpointRouteBuilder MapInvitationAsStaffEndpoints(
        this IEndpointRouteBuilder routes
    ) {
        var group = routes.MapGroup(PathUtils.GetLastSegment(RoutePath.Staff.Invitations.Root))
            .WithTags("Staff Invitations")
            .WithOpenApi();

        group.MapPost(
                PathUtils.GetLastSegment(RoutePath.Staff.Invitations.Create),
                CreateStaffInvitation.HandleCreateStaffInvitation  // ✅ Updated name
            )
            .WithName("CreateStaffInvitation")
            .WithSummary("Create a staff invitation (Admin only)")
            .WithReqBodyValidation<CreateStaffInvitationBody>();
            // ✅ 422 auto-documented via WithReqBodyValidation; 400/403 via AppBadRequestHttpResult/AppForbiddenHttpResult

        group.MapGet(
                PathUtils.GetLastSegment(RoutePath.Staff.Invitations.Find),
                ListStaffInvitations.HandleListStaffInvitations  // ✅ Updated name
            )
            .WithName("ListStaffInvitations")
            .WithSummary("List staff invitations");
            // ✅ 403 auto-documented via AppForbiddenHttpResult

        group.MapDelete(
                PathUtils.GetLastSegment(RoutePath.Staff.Invitations.RevokeById),
                RevokeInvitation.HandleRevokeInvitation  // ✅ Updated name
            )
            .WithName("RevokeInvitation")
            .WithSummary("Revoke a staff invitation (Admin only)");
            // ✅ 403 auto-documented via AppForbiddenHttpResult

        return routes;
    }
}
```

### Step 5: Delete Obsolete Files

Delete these files (DTOs and validators now in handler files):

```bash
# Delete obsolete files
rm apps/api/Src/Features/Staff/Invitations/InvitationDtos.cs
rm apps/api/Src/Features/Staff/Invitations/InvitationValidators.cs
```

### Step 6: Apply Similar Pattern to Other Handlers

Apply the same refactoring pattern to:
- `AcceptInvitation.cs`
- `ListStaffInvitations.cs`
- `RevokeInvitation.cs`

Each should:
1. Include DTOs and validators in the same file
2. Use descriptive `Handle{Action}` method names
3. Use `JsonElement` for body params
4. Delegate all database access to service layer
5. Keep lines under 100 characters
6. Use `StringComparison.OrdinalIgnoreCase` for string comparisons

## Verification Checklist

After refactoring, verify:

- [ ] No separate `*Dtos.cs` or `*Validators.cs` files exist
- [ ] All request body DTOs use `Body` suffix and `JsonElement` properties
- [ ] All handler methods use descriptive `Handle{Action}` names
- [ ] No handler accesses `MainApiDbContext` directly
- [ ] All lines are ≤ 100 characters
- [ ] String comparisons use `StringComparison.OrdinalIgnoreCase`
- [ ] All error responses use `TypedProblems.*` for automatic OpenAPI documentation
- [ ] Run `make check-write` - no errors
- [ ] Run `make build-api` - builds successfully
- [ ] Run `make generate-client` - client generates correctly

## Testing After Refactoring

1. **Build and run:**
   ```bash
   make build-api
   make dev-api
   ```

2. **Test endpoints:**
   - Visit `/scalar/v1` for API docs
   - Verify all endpoints are documented
   - Test invitation creation, acceptance, listing, revocation

3. **Generate TypeScript client:**
   ```bash
   make generate-client
   ```
   - Verify client includes all status codes
   - Check for proper error handling types

## References

- Coding Rules: `AGENTS.md`
- Coding Standards: `CLAUDE.md`
- Phase 5 Plan: `docs/roadmaps/staff-mvp/week-1-revised-implementation-plan.md`
