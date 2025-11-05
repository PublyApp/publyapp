# Phase 5 (Staff Invitations) – Critical Code Review

Date: 2025-11-05
Branch: staff-mvp-week-1
Scope: Review staged changes for Phase 5 implementing staff invitations and anonymous acceptance.

## Summary
The implementation adheres well to Vertical Slice and CLAUDE.md rules:
- Handlers are self-contained with DTOs/validators (JsonElement) colocated; handlers do not use DbContext.
- Service layer (InvitationService) encapsulates data access; LINQ query syntax used consistently.
- Authorization and response patterns follow conventions (403 via JsonHttpResult with ApiResponse; success data returned directly).
- Anonymous routes are separated from staff-protected routes; DI registrations are correct.

Primary issue before merge:
- OpenAPI for anonymous endpoints lacks explicit 404 documentation (details/accept). This can break Kiota client error typing.

## Files Reviewed (staged)
- apps/api/Program.cs
- apps/api/Src/Lib/RoutePath.cs
- apps/api/Src/Features/Common/Invitation/InvitationService.cs
- apps/api/Src/Features/Staff/Invitations/InvitationEndpoints.cs
- Handlers: AcceptInvitation.cs, CreateStaffInvitation.cs, FindStaffInvitations.cs, GetInvitationDetails.cs, RevokeInvitation.cs
- i18n: packages/shared/lib/i18n/json/response-message.en.json → ResponseKeys.g.cs
- OpenAPI: apps/api/openapi/MainApi.json (generated)

## Compliance with CLAUDE.md
- Request bodies use JsonElement with colocated validators; handler files are self-contained. Good.
- Handlers orchestrate services only; no DbContext in handlers. Good.
- LINQ query syntax in services. Good.
- Naming: “Find” used for collections (FindStaffInvitations). Good.
- Responses: data success via TypedResults.Ok(data); errors via ApiResponse; 403 with JsonHttpResult. Good.

## Endpoints & OpenAPI
- Anonymous:
  - GET /invitations/{token}/details → Handler returns 200, 404. Endpoint currently documents 500 only.
  - POST /invitations/{token}/accept → Handler returns 200, 400, 404. Endpoint currently documents 500 and body validation (400 auto), but 404 is missing.
- Staff:
  - POST /staff/invitations → 200, 400, 403 documented. Good.
  - GET /staff/invitations → 200, 403 documented. Good.
  - DELETE /staff/invitations/{id} → 200, 404, 403 documented. Good.

Why it matters: CLAUDE.md requires all status codes be documented. The OpenAPI spec drives the Kiota TS client; missing 404s leads to incorrect client error modeling.

## Service Layer & Data
- InvitationService has proper single-responsibility methods and uses transactions for acceptance.
- Email normalization and validity checks via service; invitation CanBeAccepted() respected. Good.
- Accept path sets IsVerified = true before session creation (required). Good.

## i18n
- Added "invitation-revoked" key and ResponseKey; used in Revoke handler. Good.
- Suggestion: add a specific key for pending invitation (e.g., "pending-invitation-exists") and use it instead of generic BadRequest for that case in Create.

## Validation & Security
- JsonElement validators present (names/password); basic email check in CreateStaffInvitationBody.
- Optional improvement: leverage FluentValidation .EmailAddress() if aligned with existing patterns.
- Authorization:
  - Create/Revoke: requires AccountScope.Staff and AccountLevel.Admin. Good.
  - Find: requires staff scope. Good.
  - Anonymous endpoints bypass staff filters by design. Good.

## Routing & Program Configuration
- RoutePath constants for both anonymous and staff routes implemented using PathUtils.Join; endpoints use GetLastSegment to prevent double prefixing. Good.
- Program.cs maps anonymous invitation endpoints at app level; staff endpoints under staffGroup with filters (.WithCheckSessionHeader → .WithSessionAuthentication → .WithStaffAuthorization). Good.

## OpenAPI Snapshot (generated)
- New tags: "Invitations (Anonymous)" and "Staff Invitations" present. Staff routes show 403/404 as expected.
- Missing: 404 documentation for the anonymous endpoints as noted above.

## Action Items (Pre-merge)
1) OpenAPI completeness
   - Add .ProducesApiResponses(StatusCodes.Status404NotFound) to:
     - GET /invitations/{token}/details
     - POST /invitations/{token}/accept

2) i18n specificity (optional but recommended)
   - Add a key like "pending-invitation-exists" and use it in CreateStaffInvitation for the pending case.

3) Email validation (optional)
   - Consider FluentValidation .EmailAddress() for stronger validation, if consistent with prior code.

4) After adjustments
   - make build-api && make generate-client to ensure OpenAPI → TS client alignment.

## Verdict
Approve with minor changes. The critical item is documenting 404s for the anonymous endpoints to preserve accurate client generation. Other notes are quality improvements and can be scheduled as follow-ups.
