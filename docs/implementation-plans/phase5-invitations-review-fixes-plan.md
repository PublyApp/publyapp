# Implementation Plan to Address Review Findings (Phase 5)

## Goals
- Complete OpenAPI documentation for anonymous invitation endpoints.
- Add specific i18n key for “pending invitation exists” and use it in handler.
- Optionally strengthen email validation while preserving JsonElement pattern.
- Rebuild API and regenerate the TypeScript client to align with OpenAPI.

## Prerequisites
- Follow CLAUDE.md conventions (JsonElement DTOs, no DbContext in handlers, LINQ query syntax).
- Don’t alter handler responsibilities or service separation.

## Changes

### 1) OpenAPI: Document 404s for Anonymous Endpoints
File: apps/api/Src/Features/Staff/Invitations/InvitationEndpoints.cs

- GET /invitations/{token}/details:
  - Current:
    - .ProducesApiResponses(StatusCodes.Status500InternalServerError)
  - Change:
    - Add StatusCodes.Status404NotFound

- POST /invitations/{token}/accept:
  - Current:
    - .WithReqBodyValidation<AcceptInvitationBody>()
    - .ProducesApiResponses(StatusCodes.Status500InternalServerError)
  - Change:
    - Keep WithReqBodyValidation (400 auto)
    - Add StatusCodes.Status404NotFound to .ProducesApiResponses

Example patch (respect 100-char lines):

```csharp
group.MapGet(
        PathUtils.GetLastSegment(RoutePath.Invitations.DetailsByToken, 2),
        GetInvitationDetails.HandleGetInvitationDetails
    )
    .WithName("GetInvitationDetails")
    .WithSummary("Get invitation details by token")
    .ProducesApiResponses(
        StatusCodes.Status500InternalServerError,
        StatusCodes.Status404NotFound
    );

group.MapPost(
        PathUtils.GetLastSegment(RoutePath.Invitations.AcceptByToken, 2),
        AcceptInvitation.HandleAcceptInvitation
    )
    .WithName("AcceptInvitation")
    .WithSummary("Accept invitation and create account + session")
    .WithReqBodyValidation<AcceptInvitationBody>()
    .ProducesApiResponses(
        StatusCodes.Status500InternalServerError,
        StatusCodes.Status404NotFound
    );
```

Acceptance:
- apps/api/openapi/MainApi.json shows 404 responses under both anonymous endpoints after build.
- Scalar UI shows 404 documented for these endpoints.

### 2) i18n: Add specific key for “pending invitation exists”
Files:
- packages/shared/lib/i18n/json/response-message.en.json
- apps/api/Generated/ResponseKeys.g.cs (auto-generated on build)

Steps:
1) Add key to JSON (prefer hyphen-case to match project):

```json
"pending-invitation-exists": "A pending invitation already exists"
```

2) Update handler to use the new key.

File: apps/api/Src/Features/Staff/Invitations/Handlers/CreateStaffInvitation.cs

Replace the pending invitation case:

```csharp
return TypedResults.BadRequest(
    ApiResponse.Create(
        "Pending invitation exists",
        ResponseKeys.PendingInvitationExists
    )
);
```

Notes:
- Keep message string short; frontend primarily uses the i18n key.
- Build will regenerate ResponseKeys.g.cs with PendingInvitationExists.

Acceptance:
- ResponseKeys.g.cs contains InvitationRevoked and PendingInvitationExists.
- CreateStaffInvitation returns ApiResponse with ResponseKeys.PendingInvitationExists when applicable.

### 3) Email validation improvement (optional)
File: apps/api/Src/Features/Staff/Invitations/Handlers/CreateStaffInvitation.cs

Current:
- BeValidEmail() = string.Contains('@')

Option A (still JsonElement-compatible): switch BeValidEmail to MailAddress.TryCreate:

```csharp
private bool BeValidEmail(JsonElement element) {
    if (element.ValueKind != JsonValueKind.String) return false;
    var email = element.GetString();
    if (string.IsNullOrWhiteSpace(email)) return false;
    try {
        return System.Net.Mail.MailAddress.TryCreate(email, out _);
    } catch {
        return false;
    }
}
```

Option B: keep current approach (acceptable) if aligning with existing codebase; do not use
EmailAddress() directly since FluentValidation expects a string property, not JsonElement.

Acceptance:
- Validator still operates on JsonElement; returns friendly validation messages; no binding-time
  exceptions.

## Build & Client Generation

Run:
- `make check-write`
- `make build-api`
- `make generate-client`

Verify:
- apps/api/openapi/MainApi.json includes 404 on both anonymous endpoints.
- Generated TS client includes 404 in response unions for these operations.
- ResponseKeys.g.cs contains PendingInvitationExists.

## Manual QA (no code changes)
- Launch API: `make dev-api`; open http://localhost:5000/scalar/v1
  - Verify GET /invitations/{token}/details shows 200, 404, 500.
  - Verify POST /invitations/{token}/accept shows 200, 400, 404, 500.
- Exercise CreateStaffInvitation with an email that has an active pending invite; confirm API returns
  ApiResponse with message key pending-invitation-exists.
- Ensure no handler behavior changed beyond i18n key usage and OpenAPI docs.

## Non-goals
- Do not modify handler orchestration, service separation, or session logic.
- Do not change DTO types (keep JsonElement pattern).
- Do not introduce new dependencies.

## Suggested Commit Message (once implemented)

```
feat(staff): complete OpenAPI docs for anonymous invitation endpoints; add pending-invitation i18n
key and use it in CreateStaffInvitation

Co-authored-by: factory-droid[bot] <138933559+factory-droid[bot]@users.noreply.github.com>
```

Summary: This plan updates OpenAPI to include 404s for anonymous endpoints, adds a specific i18n key
for pending invitations, optionally strengthens email validation, and guides build/client regeneration
to keep the frontend in sync.
