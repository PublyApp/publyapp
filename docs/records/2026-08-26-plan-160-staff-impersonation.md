# Staff impersonation of tenant users (#160) — Phase 1 implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the missing backend half of #160 (staff impersonation of tenant users) as a complete vertical API slice: an "end impersonation" service method that emits the never-yet-emitted `impersonation.ended` audit action, two staff endpoints (`POST /staff/impersonations` to start, `POST /staff/impersonations/{id}/end` to end), a dedicated `ImpersonationsPermissionsForStaff` slice with `START`/`END` verbs, response-message i18n keys EN+FR, and the regenerated Kiota client. The front-end UI half of #160 (start button in the staff user list, end banner in the tenant UI) is deliberately out of scope here and is tracked by the phase 2 issue.

**Architecture:** The impersonation data model already exists and does not change: an impersonation session is a normal `sessions` row with `is_impersonation = true`, `impersonating_staff_user_id`, `impersonation_reason`, and `impersonation_expires_at` (`apps/api/Modules/Auth/Entities/Session.cs`). The dual-cookie transport format (`s:<staffToken>+t:<tenantToken>`) already exists in `packages/shared-ts/src/lib/session/parse.ts` and is written at login / accept-invitation by `apps/front/src/lib/server/session-actions.ts` and `session-cookie-utils.ts`. What #160 lacks is the control plane:

- `IImpersonationService.EndImpersonationSessionAsync(Guid sessionId, Guid endedByStaffUserId)` — revokes the impersonation session row (hard delete; `sessions` rows are hard-deleted by the existing `CleanupExpiredSessionsHandler` sweep, so hard delete on revoke matches house behavior for session lifecycle) inside one save, emitting the `AuditActions.ImpersonationEnded` audit entry in the same transaction.
- Two handlers under `apps/api/Modules/Impersonations/Handlers/Staff/`: `StartImpersonationForStaff.cs` and `EndImpersonationForStaff.cs`.
- An endpoint group `apps/api/Modules/Impersonations/Endpoints/ImpersonationEndpointsForStaff.cs` mounted at `/staff/impersonations`.
- A new permission slice `ImpersonationsPermissionsForStaff` (`staff_impersonations.start`, `staff_impersonations.end`) wired into `AppPermissions.Staff` so the reflection-based seeder picks it up.
- Two new response-message i18n keys (EN + FR).

The start endpoint returns the created impersonation session's token and id so the front can compose the combined cookie `s:<staffToken>+t:<impersonationToken>` using the existing `formatSessionCookie({staffToken, tenantToken})` helper — no front server-fn changes are required in this phase; the phase 2 UI issue wires them.

**Tech stack:** .NET 10 minimal APIs, EF Core 10 against real PostgreSQL via Testcontainers (`ApiFixture`), xUnit + FluentAssertions, FluentValidation over `JsonElement` bodies, Kiota client regeneration.

## Global Constraints

1. **No schema changes.** Every column the feature needs exists on `sessions` (`Session.cs`). If implementation proves otherwise, stop and re-plan — inventing a table would fork the auth model.
2. **Hard delete on revoke, matching session-lifecycle house style.** `CleanupExpiredSessionsHandler` hard-deletes expired `sessions` rows; there is no `IsDeleted` soft-delete flag on `Session : INoTenantEntity`. Revoking an impersonation session therefore means removing its row.
3. **Audit atomicity.** The `impersonation.ended` audit row and the session deletion commit together or not at all — same contract the existing green spec `ItShouldRollbackSessionAndAuditWhenAuditInsertFails` already proves for creation. The end path must be held to the identical standard: if the audit insert fails, the session row survives.
4. **Transparent failure causes** (owner product rule): every failure this surface returns names what went wrong in plain words with a stable translation key — `impersonation-not-found`, `impersonation-already-ended`, `impersonation-staff-user-required`. Never a bare 404 without cause text, never a generic 500.
5. **Permissions are split per verb, no god-mode:** `staff_impersonations.start` and `staff_impersonations.end` are two independent grants. Cross-checked against `SystemNoticePermissionsForStaff` (five single-verb properties) and `JobsPermissionsForStaff` (the K-1 comment documents the same convention). Admin bypass note: `PermissionFilter.InvokeAsync` lets `AccountLevel.Admin` through every permission check, so the 403 specs must use non-admin staff users seeded via `StaffUserTestHelper.SeedStaffUserAsync(AccountLevel.User)` plus a staff profile carrying exactly the tested permission keys (pattern proven in `FindTenantsAsStaff.Spec.cs:690-745`, `CreateStaffProfileAsync` + `UpdateStaffUserProfilesAsync`).
6. **Rate limiting:** both routes sit behind `ApiRateLimitPolicies.AuthenticatedDefault`. Impersonation start creates a live credential and must not be quieter than ordinary authenticated mutations; no new policy is added (no env vars, no settings-constructor ripple).
7. **Wire conventions:** camelCase JSON fields; errors are RFC 7807 via `TypedProblems.*` with stable `translationKey`s; handler wire types (`Body`/`Response`) are top-level siblings in the handler file with no `Dto` suffix; `Guid.TryParse` for route ids (malformed → 400 `MalformedId`, per `DeleteSystemNoticeSpec.ItShouldReturnBadRequestForMalformedId`); no route constraints.
8. **C# standards:** no null-forgiving operator, no `?? throw`, pattern-matching null checks, braces everywhere, max 100-char lines, handler orchestration only (no DbContext in handlers), services depend only on DbContext (+ infrastructure). The existing `ImpersonationService` uses `[Service(ServiceLifetime.Scoped)]` DI and stays the single owner of impersonation writes.
9. **Staff-method naming:** the service methods this plan adds are consumed only by staff handlers and carry the `ForStaffAsync` suffix (PUBLY0007 convention for staff-called variants).
10. **i18n parity:** new response-message keys land in both `packages/shared-ts/src/lib/i18n/json/response-message.en.json` and `.fr.json`; regenerate constants with `just generate-response-keys`.
11. **Client regeneration gate:** after endpoint changes, `just build-api && just generate-client && pnpm --filter front typecheck` must pass and the regenerated `packages/client-ts/` is committed. A second consecutive `just generate-client` run must produce a zero git diff.
12. **No disable/suppression comments, no `!` in production C#, no test skips or retries, boring readable code.**

## File Structure

**Modify**

- `apps/api/Modules/Impersonations/Services/ImpersonationService.cs` — add `EndImpersonationSessionForStaffAsync(EndImpersonationSessionArgs, CancellationToken)` returning a discriminated result (`Ended` | `NotFound` | `AlreadyEnded`); add `EndImpersonationSessionArgs(Guid SessionId, Guid EndedByStaffUserId)` record. Keep `CreateImpersonationSessionAsync` untouched except for nothing — it stays as-is.
- `apps/api/Lib/AppPermissions.cs` — add `public ImpersonationsPermissionsForStaff Impersonations { get; } = new();` to `StaffScopePermissions`.
- `packages/shared-ts/src/lib/i18n/json/response-message.en.json` + `.fr.json` — add the three failure/success keys listed in Task 4.
- `apps/api/Program.cs` — one line: `staffGroup.MapImpersonationEndpointsForStaff();` next to the other staff mappings.

**Create**

- `apps/api/Modules/Impersonations/Permissions/ImpersonationsPermissionsForStaff.cs`
- `apps/api/Modules/Impersonations/Routes.Impersonations.cs` (partial `Routes` class)
- `apps/api/Modules/Impersonations/Endpoints/ImpersonationEndpointsForStaff.cs`
- `apps/api/Modules/Impersonations/Handlers/Staff/StartImpersonationForStaff.cs`
- `apps/api/Modules/Impersonations/Handlers/Staff/StartImpersonation.Spec.cs`
- `apps/api/Modules/Impersonations/Handlers/Staff/EndImpersonationForStaff.cs`
- `apps/api/Modules/Impersonations/Handlers/Staff/EndImpersonation.Spec.cs`

---

## Task 1: Permission slice `ImpersonationsPermissionsForStaff`

**Files:** Create `apps/api/Modules/Impersonations/Permissions/ImpersonationsPermissionsForStaff.cs`; modify `apps/api/Lib/AppPermissions.cs`.

- [ ] **Step 1: RED — failing permission-seeding assertion.** Create `apps/api/Modules/Impersonations/Permissions/ImpersonationsPermissionsForStaff.Spec.cs`:

```csharp
using FluentAssertions;

using PublyApp.Api.Lib;
using PublyApp.Api.Modules.Impersonations.Permissions;

using Xunit;

namespace PublyApp.Api.Modules.Impersonations.Permissions;

public sealed class ImpersonationsPermissionsForStaffSpec {
	[Fact]
	public void ItShouldExposeStartAndEndPermissionKeys() {
		var slice = new ImpersonationsPermissionsForStaff();
		slice.KeyPrefix.Should().Be("staff_impersonations");
		slice.START.Key.Should().Be("staff_impersonations.start");
		slice.END.Key.Should().Be("staff_impersonations.end");
	}

	[Fact]
	public void ItShouldRegisterTheSliceInStaffScope() {
		var scope = new StaffScopePermissions();
		scope.Impersonations.Should().NotBeNull();
		scope.Impersonations.START.Key.Should().Be("staff_impersonations.start");
	}
}
```

Run: `cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~ImpersonationsPermissions"` → RED (compile error: the type does not exist).

- [ ] **Step 2: GREEN — implement the slice.** Mirror `SystemNoticePermissionsForStaff.cs` exactly (class shape, `ISlicePermissions`, EN+FR translations):

```csharp
using PublyApp.Api.Lib;
using PublyApp.Api.Modules.Permissions.Entities;

namespace PublyApp.Api.Modules.Impersonations.Permissions;

public class ImpersonationsPermissionsForStaff : ISlicePermissions {
	public string KeyPrefix { get; } = "staff_impersonations";

	public Permission START { get; }
	public Permission END { get; }

	public ImpersonationsPermissionsForStaff() {
		START = Permission
			.CreateStaffPermission(string.Join(Permission.KeySeparator, new[] { KeyPrefix, "start" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "Start impersonation", Description = "Start impersonating a tenant user as a staff member" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Démarrer une usurpation d'identité", Description = "Usurper l'identité d'un utilisateur locataire en tant que membre du personnel" });

		END = Permission
			.CreateStaffPermission(string.Join(Permission.KeySeparator, new[] { KeyPrefix, "end" }))
			.SetTranslation(SupportedLanguage.English, new PermissionTranslation { Name = "End impersonation", Description = "Revoke a running impersonation session" })
			.SetTranslation(SupportedLanguage.French, new PermissionTranslation { Name = "Terminer une usurpation d'identité", Description = "Révoquer une session d'usurpation d'identité en cours" });
	}
}
```

Add to `StaffScopePermissions` in `apps/api/Lib/AppPermissions.cs`:

```csharp
public ImpersonationsPermissionsForStaff Impersonations { get; } = new();
```

Because `PermissionSeeder` reflects over `IScopePermissions` → `ISlicePermissions` properties (`PermissionSeeder.cs:88-121`), the two keys seed automatically once the slice property exists.

- [ ] **Step 3: GREEN check.** Same filter → green. Also run `--filter "FullyQualifiedName~PermissionSeeder"` to confirm seeding discovery still passes.

- [ ] **Step 4: Commit.**

```bash
git add apps/api/Modules/Impersonations apps/api/Lib/AppPermissions.cs
git commit -m "feat(impersonations): staff impersonation permission slice (#160)"
```

## Task 2: Route constants + endpoint group skeleton

**Files:** Create `apps/api/Modules/Impersonations/Routes.Impersonations.cs`, `apps/api/Modules/Impersonations/Endpoints/ImpersonationEndpointsForStaff.cs`; modify `apps/api/Program.cs`.

- [ ] **Step 1: Routes partial class**, mirroring `Routes.SystemNotices.ForStaff` shape:

```csharp
#pragma warning disable IDE0130 // Namespace does not match folder structure
namespace PublyApp.Api.Lib.Routes;
#pragma warning restore IDE0130

public static partial class Routes {
	public static class Impersonations {
		public static class ForStaff {
			public const string Root = "/impersonations";
			public const string Start = "/";
			public const string End = "/{sessionId}/end";

			public static string EndFn(string sessionId) {
				return $"/{sessionId}/end";
			}
		}
	}
}
```

(The `IDE0130` pragma pair copies `Routes.SystemNotices.cs` verbatim — this is the established exception pattern for the shared `Routes` partial, not a new suppression.)

- [ ] **Step 2: Endpoint group** mirroring `SystemNoticeEndpointsForStaff`:

```csharp
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Filters;
using PublyApp.Api.Lib.RateLimiting;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Modules.Impersonations.Handlers.Staff;

namespace PublyApp.Api.Modules.Impersonations.Endpoints;

public static class ImpersonationEndpointsForStaff {
	public static IEndpointRouteBuilder MapImpersonationEndpointsForStaff(
		this IEndpointRouteBuilder routes
	) {
		var group = routes.MapGroup(Routes.Impersonations.ForStaff.Root)
			.RequireRateLimiting(ApiRateLimitPolicies.AuthenticatedDefault)
			.WithTags("Staff Impersonations");

		group.MapPost(
				Routes.Impersonations.ForStaff.Start,
				StartImpersonationForStaff.Handle
			)
			.WithName("StartImpersonationForStaff")
			.WithSummary("Start impersonating a tenant user")
			.WithReqBodyValidation<StartImpersonationForStaffBody>()
			.WithPermission([AppPermissions.Staff.Impersonations.START]);

		group.MapPost(
				Routes.Impersonations.ForStaff.End,
				EndImpersonationForStaff.Handle
			)
			.WithName("EndImpersonationForStaff")
			.WithSummary("Revoke a running impersonation session")
			.WithPermission([AppPermissions.Staff.Impersonations.END]);

		return routes;
	}
}
```

- [ ] **Step 3: Mount it.** In `apps/api/Program.cs`, next to `staffGroup.MapJobDeadLetterEndpointsForStaff();` add `staffGroup.MapImpersonationEndpointsForStaff();`.

- [ ] **Step 4: RED proof at the HTTP boundary.** This task's compile-green state is itself the first observable milestone; the endpoint specs in Tasks 3–4 are the paired RED evidence (they fail before their handlers exist). Run the architecture guards to catch metadata problems early:

```bash
cd apps/api && dotnet build && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test \
  --filter "FullyQualifiedName~EndpointPermissionMetadataGuard|FullyQualifiedName~RouteConstraintGuard"
```

Expected: green (handlers referenced above must exist by now — implement Tasks 3–4 handlers first if you land this file standalone, or land Tasks 2–4 in one commit sequence where the build stays compilable).

- [ ] **Step 5: Commit** (together with Task 3/4 handlers so the tree always builds):

```bash
git add apps/api/Modules/Impersonations apps/api/Program.cs
git commit -m "feat(impersonations): /staff/impersonations endpoint group (#160)"
```

## Task 3: Start endpoint `POST /staff/impersonations`

**Files:** Create `apps/api/Modules/Impersonations/Handlers/Staff/StartImpersonationForStaff.cs` + `StartImpersonation.Spec.cs`.

Design decisions (with alternatives):

- **Who gets impersonated?** The request names the target user explicitly (`targetUserId`), not just the tenant. Alternative rejected: deriving the target from the tenant's highest-level account like `CreateImpersonationSessionAsync` does today — that silently impersonates whichever account sorts first, which is wrong for support flows aimed at a specific user and makes audits ambiguous about who was actually impersonated. The service gains an explicit-target overload; the legacy highest-level default remains for compatibility but the endpoint always passes an explicit target. The endpoint validates the target belongs to the named tenant and is an active tenant-scope account (service-level guard, mirrors the suspended-account exclusion already in the service).
- **Why 201 Created:** house rule — create success → 201 `Created<T>` with entity DTO (AGENTS.md response-format rule), matching `CreateSystemNotice`.
- **Token exposure:** the response carries the raw impersonation token once, over the authenticated staff channel — the same trust level as `auth/login`'s response. It is needed once to compose the combined cookie; there is no other read path for it.

- [ ] **Step 1: RED — endpoint spec.** Create the spec file with these cases (full code shape below; reuse `SeedTenantUserAsync`-style helpers from the existing `ImpersonationService.Spec.cs`):

```csharp
[Fact]
public async Task ItShouldReturnCreatedWithImpersonationTokenAndId() {
	// staff admin login; seed tenant + active tenant-scope user;
	// POST { targetUserId, reason: "support ticket 42" }
	// expect 201; body.impersonationToken non-empty;
	// body.sessionExpiresAt > now; then verify DB:
	//   sessions row with IsImpersonation == true,
	//   ImpersonatingStaffUserId == staff admin's userId,
	//   ImpersonationReason == "support ticket 42";
	// and verify AuditLog row: Action == "impersonation.started",
	//   UserId == staff admin, TargetId == tenantId.
}

[Fact]
public async Task ItShouldReturnNotFoundWhenTargetUserIsNotInTenant() {
	// POST with a targetUser that has no UserAccount row for tenantId
	// → 404 AppProblemDetails, TranslationKey == "impersonation-user-not-in-tenant".
}

[Fact]
public async Task ItShouldReturnForbiddenForNonAdminWithoutStartGrant() {
	// SeedStaffUserAsync(email, AccountLevel.User); create staff profile with
	// permissions: [] ; assign to user; login as that user; POST → 403.
}

[Fact]
public async Task ItShouldAllowStaffWithExplicitStartGrant() {
	// Same non-admin staff, profile permissions: ["staff_impersonations.start"]
	// → 201.
}
```

Run → RED (route/handler do not exist → 404 on the POST).

- [ ] **Step 2: GREEN — handler + service change.** Extend `IImpersonationService` with an explicit-target creation path (keep the existing method signature working for its current callers):

```csharp
public record CreateImpersonationSessionArgs(
	Guid TenantId,
	Guid StaffUserId,
	string Reason,
	int DurationMinutes = 60,
	Guid? TargetUserId = null
);
```

In the implementation, when `TargetUserId` has a value, resolve that specific active tenant-scope `UserAccount` instead of the order-by-level default (same predicate otherwise: `Scope == AccountScope.Tenant && Status != AccountStatus.Suspended`, additionally `UserId == TargetUserId`); when no account matches return `null` from the resolution step and let the method return a typed `ImpersonationResult.NotFound` instead of throwing `InvalidOperationException` — the handler maps that to 404 with `impersonation-user-not-in-tenant`. (The throw-based contract of the existing method is preserved for `TargetUserId == null`; the explicit-target path returns results because "user not in tenant" is an expected client error, not a programming error.)

Handler body type and validator:

```csharp
public record StartImpersonationForStaffBody {
	public required JsonElement TenantId { get; init; }
	public required JsonElement TargetUserId { get; init; }
	public JsonElement? Reason { get; init; }

	public Guid GetTenantId() { return TenantId.GetValueAsGuid(); }
	public Guid GetTargetUserId() { return TargetUserId.GetValueAsGuid(); }
	public string GetReason() { ... }
}

public class StartImpersonationForStaffBodyValidator
	: AbstractValidator<StartImpersonationForStaffBody> {
	public StartImpersonationForStaffBodyValidator() {
		RuleFor(x => x.TenantId).MustBeRequiredIso... // use the repo's guid rules
		RuleFor(x => x.TargetUserId).MustBeRequired...
		RuleFor(x => x.Reason).MustBeNullableStringWithLength("Reason", 1, 500);
	}
}
```

(Final rule names come from `JsonElementRules.*` extension methods — read `apps/api/Lib/Validation/` and mirror `CreateSystemNoticeBodyValidator` usage; never inline validation chains, PUBLY0005.)

Response DTO:

```csharp
public record StartImpersonationForStaffResponse {
	public required Guid SessionId { get; init; }
	public required Guid UserId { get; init; }
	public required string ImpersonationToken { get; init; }
	public required DateTime SessionExpiresAt { get; init; }
	public required DateTime ImpersonationExpiresAt { get; init; }
}
```

Handler flow: cache `body.GetTenantId()` / `GetTargetUserId()` locals (PUBLY0006), null-guard `authContext.AccountStaff` (throw InvalidOperationException exactly like `DeleteSystemNotice`), call the service, map typed results to 201 / 404 `TypedProblems.NotFound(..., ResponseKeys.ImpersonationUserNotInTenant)`. No separate audit call in the handler: unlike `DeleteSystemNotice` (whose service owns no audit), the impersonation service already writes its own audit rows transactionally — duplicating the write in the handler would double-log.

- [ ] **Step 3: GREEN check.** Spec filter green; full-module filter green.

- [ ] **Step 4: Commit.**

```bash
git add apps/api/Modules/Impersonations
git commit -m "feat(impersonations): POST /staff/impersonations start endpoint (#160)"
```

## Task 4: End endpoint + `EndImpersonationSessionForStaffAsync` + i18n keys

**Files:** Modify `apps/api/Modules/Impersonations/Services/ImpersonationService.cs`; create `apps/api/Modules/Impersonations/Handlers/Staff/EndImpersonationForStaff.cs` + `EndImpersonation.Spec.cs`; modify both response-message JSON files; run `just generate-response-keys`.

Design decisions (with alternatives):

- **Discriminated result, not exceptions:** `EndImpersonationSessionForStaffAsync` returns `ImpersonationEndResult` = `Ended` | `NotFound` | `AlreadyEnded`. Alternatives rejected: bool + out-param (cannot distinguish "never existed" from "already revoked", and the transparent-failure rule needs distinct causes); exceptions (expected client outcomes are not exceptional).
- **AlreadyEnded detection:** the impersonation session row is identified by id + `IsImpersonation == true`. "Already ended" is indistinguishable from "never existed" after a hard delete, so the result distinguishes them only while the row lives. Decision: keep three result states anyway — `NotFound` when no row with that id exists at all, `AlreadyEnded` when the row existed but its `ImpersonationExpiresAt <= UtcNow` (an expired-but-not-yet-swept row is materially "already over") — the handler maps expired to 200-with-key `impersonation-already-ended`, unknown id to 404 `impersonation-not-found`. Both messages state the plain-words cause.
- **Who may end:** any caller holding `staff_impersonations.end` — including a different staff member than the one who started (a shift handover). The audit row records `EndedByStaffUserId` in `Details` and the impersonated session's `ImpersonatingStaffUserId` remains on the deleted row's audit trail via the started audit.

- [ ] **Step 1: RED — service spec additions** (append to `ImpersonationService.Spec.cs`, reusing its existing helpers):

```csharp
[Fact]
public async Task ItShouldEndSessionEmittingImpersonationEndedAudit() {
	var (tenantId, _) = await SeedTenantUserAsync();
	var staffUserId = await SeedStaffActorAsync();
	var service = BuildService(); // local helper wrapping fixture scope
	var session = await service.CreateImpersonationSessionAsync(
		new CreateImpersonationSessionArgs(tenantId, staffUserId, "end-test"));

	var result = await service.EndImpersonationSessionForStaffAsync(
		new EndImpersonationSessionArgs(session.GetRequiredId(), staffUserId));

	result.Should().BeOfType<ImpersonationEndResult.Ended>();
	(await CountSessionsAsync(s => s.Id == session.GetRequiredId())).Should().Be(0);
	(await CountAuditsAsync(a =>
		a.Action == AuditActions.ImpersonationEnded &&
		a.UserId == staffUserId &&
		a.TargetId == session.GetRequiredId())).Should().Be(1);
}

[Fact]
public async Task ItShouldRollBackEndWhenAuditInsertFails() {
	// Arrange: valid impersonation session; a service whose AuditLog insert fails
	// (reuse the invalid-FK trick from ItShouldRollbackSessionAndAuditWhenAuditInsertFails
	// — e.g. pass a nonexistent EndedByStaffUserId if AuditLog.UserId is FK-bound,
	// else inject a failing AuditLog via the same seam the create-spec uses).
	// Act: EndImpersonationSessionForStaffAsync → DbUpdateException.
	// Assert: the sessions row STILL EXISTS (rollback), no impersonation.ended audit.
}

[Fact]
public async Task ItShouldReportAlreadyEndedForAnExpiredImpersonationRow() {
	// Create session; UPDATE sessions SET impersonation_expires_at = now() - interval '1 minute';
	// End → ImpersonationEndResult.AlreadyEnded; row still present (not swept);
	// no new impersonation.ended audit row.
}

[Fact]
public async Task ItShouldReturnNotFoundForUnknownSessionId() { ... }
```

- [ ] **Step 2: GREEN — service implementation sketch.**

```csharp
public abstract record ImpersonationEndResult {
	public sealed record Ended : ImpersonationEndResult;
	public sealed record NotFound : ImpersonationEndResult;
	public sealed record AlreadyEnded : ImpersonationEndResult;
}

public record EndImpersonationSessionArgs(
	Guid SessionId,
	Guid EndedByStaffUserId
);

public async Task<ImpersonationEndResult> EndImpersonationSessionForStaffAsync(
	EndImpersonationSessionArgs args,
	CancellationToken cancellationToken = default
) {
	await using var tx = await _dbContext.Database.BeginTransactionAsync(cancellationToken);

	var sessionQuery =
		from s in _dbContext.Session
		where s.Id == args.SessionId && s.IsImpersonation
		select s;

	var session = await sessionQuery.FirstOrDefaultAsync(cancellationToken);

	if (session is null) {
		return new ImpersonationEndResult.NotFound();
	}

	if (session.IsImpersonationValid()) {
		await _dbContext.Session.Remove(session);
		AddEndAuditEntry(args, session);
		await _dbContext.SaveChangesAsync(cancellationToken);
		await tx.CommitAsync(cancellationToken);
	} else {
		// Expired but not yet swept by CleanupExpiredSessionsHandler: the
		// impersonation is over; report AlreadyEnded and leave the sweep
		// to own the row's removal.
		return new ImpersonationEndResult.AlreadyEnded();
	}

	if (_logger.IsEnabled(LogLevel.Information)) {
		_logger.LogInformation(
			"Impersonation session {SessionId} ended by staff user {StaffUserId}",
			args.SessionId, args.EndedByStaffUserId);
	}

	return new ImpersonationEndResult.Ended();
}
```

`AddEndAuditEntry` mirrors `AddAuditEntry` but uses `AuditActions.ImpersonationEnded` with `details: { EndedByStaffUserId, StartedByStaffUserId = session.ImpersonatingStaffUserId, Reason = session.ImpersonationReason }` and `ipAddress`/`userAgent` from the accessor like the start path.

- [ ] **Step 3: GREEN — handler.** `EndImpersonationForStaff` maps: `Ended` → 200 `Ok<ApiResponse>` message "Impersonation ended successfully" + key; `AlreadyEnded` → 200 `Ok<ApiResponse>` with key `impersonation-already-ended` (plain words: the session had already expired); `NotFound` → 404 `TypedProblems.NotFound("Impersonation session not found", ResponseKeys.ImpersonationNotFound)`; malformed `{sessionId}` → 400 `ResponseKeys.MalformedId`.

- [ ] **Step 4: i18n keys.** Add to BOTH `response-message.en.json` and `response-message.fr.json`:

```json
"impersonation-started-success": "Impersonation session started",
"impersonation-user-not-in-tenant": "The target user does not belong to this workspace",
"impersonation-not-found": "Impersonation session not found",
"impersonation-already-ended": "This impersonation session had already expired"
```

FR translations mirror the same shape ("Session d'usurpation d'identité démarrée", etc.). Run `just generate-response-keys` and commit the regenerated `ResponseKeys.g.cs`.

- [ ] **Step 5: GREEN check + commit.**

```bash
just generate-response-keys
git add apps/api packages/shared-ts/src/lib/i18n/json
git commit -m "feat(impersonations): end impersonation endpoint + ended-audit (#160)"
```

## Task 5: Endpoint integration specs + adversarial mutation

**Files:** extend the two handler spec files from Tasks 3–4.

- [ ] **Step 1: End-to-end HTTP cases for the END route** (in `EndImpersonation.Spec.cs`):

```csharp
[Fact]
public async Task ItShouldReturnOkAndRevokeSessionOverHttp() {
	// staff admin login; create impersonation session via service (fixture scope);
	// POST /staff/impersonations/{id}/end with session token → 200 ApiResponse,
	// Key == "impersonation-ended-success"; sessions row gone; audit row present.
}

[Fact]
public async Task ItShouldReturnUnauthorizedWithoutToken() { ... }

[Fact]
public async Task ItShouldReturnBadRequestForMalformedSessionId() {
	// replace the guid segment with "not-a-guid" → 400 MalformedId.
}

[Fact]
public async Task ItShouldReturnForbiddenForNonAdminWithoutEndGrant() {
	// AccountLevel.User staff with empty-grant profile → 403.
}
```

- [ ] **Step 2: Paired RED proof for `.dump/proof-red.md`.** For each new spec family, capture md5 of the mechanism file before mutation, apply the named adversarial mutation, run the new tests → RED, restore, verify md5 unchanged, run again → GREEN:

  1. **Mutation M1 (end path):** in `EndImpersonationSessionForStaffAsync`, delete the `AddEndAuditEntry(args, session);` line (audit skipped). Expected RED: `ItShouldEndSessionEmittingImpersonationEndedAudit` fails (no audit row); `ItShouldRollBackEndWhenAuditInsertFails` still passes (nothing to roll back is vacuously true — noted in the proof doc).
  2. **Mutation M2 (start path):** in `CreateImpersonationSessionAsync`, remove `AddAuditEntry(...)` similarly → `ItShouldCreateSessionAndAuditOnSuccess` goes RED.

- [ ] **Step 3: Full-suite verification under heavy.sh** (verification policy: unit/spec suites only, focused invocations):

```bash
~/ai-orchestration-playbook/tools/heavy.sh just test-api
```

Quote totals in the PR body. CI does not run this suite.

- [ ] **Step 4: Commit.**

```bash
git add apps/api/Modules/Impersonations .dump/proof-red.md 2>/dev/null || git add apps/api/Modules/Impersonations
git commit -m "test(impersonations): endpoint integration specs + red-proof mutations (#160)"
```

(`.dump/` is gitignored; keep the proof file untracked, reference it from the PR body.)

## Task 6: Client regeneration + final gates

- [ ] **Step 1:** `just build-api && just generate-client && pnpm --filter front typecheck`. Commit regenerated `packages/client-ts/`. Re-run `just generate-client` a second time; confirm zero git diff; quote both hashes in the PR body.
- [ ] **Step 2:** `pnpm lint` (repo-wide, exactly what CI runs) — expected green; no front source changed in this lane beyond generated client code.
- [ ] **Step 3:** `just knip` — expected green (no new dependencies).
- [ ] **Step 4:** `pnpm --filter front test` — full front suite green (guards included).
- [ ] **Step 5:** Final commit if anything regenerated drifted:

```bash
git add -A
git commit -m "chore(impersonations): regenerate kiota client (#160)"
```

## Task 7: PR

- [ ] **Step 1:** Write `.dump/pr-body.md`: triage outcome (epic partially delivered; this PR = plan + phase 1 scoping), what/why, RED proof summary, named adversarial mutation, suite totals, `Part of #160` (NOT Closes — phase 2 front-end UI closes the epic), `Model: Ox Alpha (jcode, stealth/ox-alpha), effort max`, `Unverified until review`.
- [ ] **Step 2:** `gh pr create --base develop --head lane/wt-160 --title "docs(plan): staff impersonation implementation plan (phase 1, #160)" --body-file .dump/pr-body.md`.
- [ ] **Step 3:** Poll `gh pr checks` until every check passes. "no checks reported" > 1 min → CONFLICTING → fetch/rebase keeping both intents → push `--force-with-lease`.
