# C4 — Pause, Resume & Reconnect Banner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Round 2 revision note:** the round-1 adversarial review found this plan cited a pruned directory, fabricated APIs, non-existent front components/routes/locales, and spec sections that do not exist. Every symbol below was re-verified against `origin/develop`, `origin/lane/wt-641` (C2), and `origin/lane/wt-644` (D1) immediately before writing; Appendix A is the verification ledger. The two dependency branches are named wherever this plan consumes their code.

**Goal:** Implement Epic C §5 "Failures, reconnection, pause" + §3 "Workspace banner" for C4: switch `SocialAccount.Status` to `NeedsReconnect` on credential failure (completed by D1's job handler; this plan completes the sibling-pause sweep), workspace reconnect banner, pause/resume of scheduled publications, and the past-due pause policy.

**Specs cited (real paths, verified):**
- Epic C design lives on **`origin/lane/wt-641`** at `docs/superpowers/specs/2026-08-22-epic-c-social-accounts-design.md` (that branch predates the #1357 docs prune; it is not on develop). Cited by its real section numbers only: §1 decisions (table rows 4–5), §2 model, §3 screens/actions ("Reconnect" + "Workspace banner"), §4 security/permissions, §5 failures/reconnection/pause, §6 delivery, §7 hard repo constraints.
- Epic D design is merged on develop: `docs/records/2026-08-22-spec-epic-d-publishing-scheduling.md`. Cited sections: §3 "Execution path" items 1–6 (schedule / due scan / run / classified failures / retry / resume-after-pause), §5 delivery order.
- Service-boundary standing rule: [`docs/guides/api-module-structure.md`](../../guides/api-module-structure.md), "**Domain Service Split Rules**" ("Services must not depend on other domain/application services… Handlers orchestrate; services implement") — build-enforced by `apps/api/Lib/Architecture/ServiceDependencyBoundaryGuard.Spec.cs`.
- Route-design and rate-limiting standing rules: [`docs/guides/api-route-design.md`](../../guides/api-route-design.md) and [`docs/guides/api-rate-limiting.md`](../../guides/api-rate-limiting.md) ("every endpoint declares a rate-limit policy").

**Tech Stack:** .NET 10 / EF Core 10, xUnit, FluentAssertions, Testcontainers (via the real `ApiFixture` in `apps/api/Lib/Testing/Fixtures/ApiFixture.cs`: `Factory`, `HttpClient`, `CreateClient()`, `GetFakeEmailSender()`; helpers `TestAuthClient`, `HttpRequestMessageExtensions.WithSessionToken/.WithTenantId`, seeded tenants via `PublyApp.Api.Data.Seeding.SeedConstants`, constants in `Lib/Testing/Fixtures/TestConstants.cs`). Front: TanStack Start + Base UI wrappers in `apps/front/src/components/ui/*`, Vitest + Testing Library with plain `.toBeTruthy()`/`.toBe()`/`toContain()` assertions (**jest-dom is not installed in this repo — never use `toBeInTheDocument`**).

## Global Constraints

- D1 gate: Tasks 3–5 require `IPublicationStatusTransitionService` from **D1 = `origin/lane/wt-644`**. Tasks 1–2 ship independently; if D1 is not merged when implementation starts, land Tasks 1–2 first and hold Tasks 3–5 (implement them stacked on a local merge of `origin/lane/wt-644`).
- `SocialAccountStatus` enum (develop, `apps/api/Modules/SocialAccounts/Entities/SocialAccountStatus.cs`): `Active = 10, NeedsReconnect = 20, Revoked = 30`.
- `PublicationStatus` enum (D1, `apps/api/Modules/Publishing/Entities/PublicationStatus.cs`): `Scheduled = 10, InProgress = 20, Published = 30, Failed = 40, Paused = 50`; the DB CHECK is `status IN (10, 20, 30, 40, 50)` (asserted by `PublicationArchitectureSpec`). This plan adds **no new enum value**, therefore **no migration**.
- **The real transition interface (D1) has exactly five members, all `Task<bool>`, each taking an Args record** (verified verbatim on wt-644):
  - `MarkInProgressAsync(MarkPublicationInProgressArgs { PublicationId, TenantId }, ct)`
  - `MarkPublishedAsync(MarkPublicationPublishedArgs { PublicationId, TenantId, ExternalRecordId, ExternalUrl }, ct)`
  - `MarkFailedAsync(MarkPublicationFailedArgs { PublicationId, TenantId, Cause }, ct)`
  - `MarkPausedAsync(MarkPublicationPausedArgs { PublicationId, TenantId, Cause }, ct)`
  - `RescheduleToNowAsync(ReschedulePublicationToNowArgs { PublicationId, TenantId }, ct)`

  There is **no `MarkScheduledAsync`** anywhere on develop/wt-641/wt-644. Resuming a paused publication to `Scheduled` while preserving its instant requires extending the D1 interface — see Task 3.
- **Why `RescheduleToNowAsync` cannot serve as resume:** its implementation stamps `ScheduledAtUtc = DateTime.UtcNow` and clears `LastError`/external fields. Using it for resume would fire past-due publications immediately — exactly the "published late without explicit action" outcome Epic C §5 forbids. Resume must preserve the original instant (future ones re-enter the due scan; past-due ones stay paused until the user picks a new time — see Open Questions).
- **Transition-map reality (verified against `AllowedSources` on wt-644):**
  - `[InProgress] ← [Scheduled, InProgress, Paused]`, `[Published] ← [InProgress]`, `[Failed] ← [InProgress]`, `[Paused] ← [InProgress]`, `[Scheduled] ← [Scheduled, Paused, Failed]`.
  - `Paused → Scheduled` (resume) is **already legal**. The only missing move is **`Scheduled → Paused`** (pausing a not-yet-running publication when its account breaks). Task 3 makes exactly one map edit: `[Paused]` gains `Scheduled`.
- `PublicationStatusTransitionService` is the only writer of `Publication.Status`; `apps/api/Lib/Architecture/PublicationArchitecture.Spec.cs` (ships with D1) scans **all** `Modules/**/*.cs` for `.Status =` writes whose line also mentions "publication"/"pub." outside the transition service. Consequences this plan respects: (a) all publication moves go through the transition service; (b) the one direct entity write this plan keeps — `account.Status = SocialAccountStatus.NeedsReconnect` in the job handler, matching D1's existing `FlagAccountNeedsReconnectAsync` — is safe because the line does not mention "publication"; (c) never write that assignment on a line containing the word "publication". This plan adds no second guard and must not weaken this one (red-proof protocol in Appendix B).
- **Service boundary:** domain services never call other domain services (`ServiceDependencyBoundaryGuard.Spec.cs` fails the build on `Service → IService` constructor injection; allowlist covers only `AppDbContext`, infrastructure abstractions, `ILogger<T>`). Cross-service coordination lives in **handlers/jobs** (Tasks 4–5). A new read-only `PublicationQueueService` (Task 5, AppDbContext-only) is boundary-legal precisely because it never injects another service.
- **No `DbContext` in handlers** (repo rule "handlers orchestrate, services implement"): handlers needing publication reads go through `PublicationQueueService`, not `_db` directly.
- Epic C §5 rule: nothing is ever published late without an explicit action. Resume keeps past-due publications paused.
- The secret (`ProtectedCredentials` cleartext) is never returned by any API, never logged, never in an error message, never in an audit row. Persisted causes pass through `LastErrorSanitiser.Sanitize` (real signature `public static string? Sanitize(string? raw)`, caps 2 KB, redacts credential-shaped tokens).
- Analyzers PUBLY0001–0007 are errors: **no null-forgiving `!` in production code** — use `entity.GetRequiredId()` (defined on `BaseAttributes`, `apps/api/Data/BaseAttributes.cs`) instead of `entity.Id!.Value`; no `?? throw`; no `ToLower()` dispatch; wire DTOs lack a `Dto` suffix; cache repeated `JsonElement` getter results; tenant-scoped service methods must use their `tenantId`.
- Adding `{Action}{Domain}Args`-style records requires updating `apps/api/Lib/Architecture/ServiceArgsRecordConvention.Spec.cs` assertions (repo rule) — Task 3 includes that step.
- Permission wiring follows C2's real pattern: `.WithTenantPermission([AppPermissions.Tenant.SocialAccounts.VIEW])` (keys `socialaccounts.view` / `socialaccounts.manage` from `SocialAccountPermissionsForTenant`, `KeyPrefix = "socialaccounts"`), defined in C2's module and exposed via `AppPermissions.Tenant.SocialAccounts`.
- Every endpoint declares a rate-limit policy. C2's tenant group already wraps everything in `RequireRateLimiting(ApiRateLimitPolicies.AuthenticatedDefault)` and pins `SocialConnect` on connect/reconnect; Task 1 inherits the group default (list endpoint, small payload).
- `just build-api && just generate-client && pnpm --filter front typecheck` runs after any API contract change (Tasks 1 and 5).
- Migrations are applied only by the one-shot `migrate` service; locally `just db-migrate`. (This plan generates none.)

## Dependency Chain

```
develop (C1-bis: SocialAccount entity, CredentialProtector, LastErrorSanitiser, master key witness)
    ↓
C2 (lane/wt-641): SocialAccountPermissionsForTenant, Routes.SocialAccounts.cs,
    SocialAccountEndpointsForTenant (+ registration in Program.cs),
    SocialAccountService (find/connect/reconnect/disconnect/set-projects),
    BlueskyClient/ISocialSessionProvider, SocialConnect rate-limit policy
    ↓
D1 (lane/wt-644): Publication entity, IPublicationStatusTransitionService (five Args-record
    members), PublicationArchitecture.Spec guard, PublishPublicationJobHandler
    (PauseForAccountAsync pauses the failing publication + FlagAccountNeedsReconnectAsync)
    ↓
C4 (this plan): needs-reconnect listing endpoint, banner,
    transition-map extension + MarkScheduledAsync, sibling-pause sweep, resume-on-reconnect
```

---

## File Structure

### Wave 1 — Banner data path (D1-independent)

**Create**
- `apps/api/Modules/SocialAccounts/Handlers/Tenant/FindNeedsReconnectAccountsForTenant.cs`
- `apps/api/Modules/SocialAccounts/Handlers/Tenant/FindNeedsReconnectAccountsForTenant.Spec.cs`

**Modify**
- `apps/api/Modules/SocialAccounts/Services/SocialAccountService.cs` — add `FindNeedsReconnectAccountsAsync` (method on the existing C2 service; no new service class).
- `apps/api/Modules/SocialAccounts/Routes.SocialAccounts.cs` — add `FindNeedsReconnect = "/needs-reconnect-accounts"` inside the existing `Routes.SocialAccounts.ForTenant` partial (this is C2's real per-module routes partial; there is no social-accounts block in `Lib/Routes/Routes.cs`).
- `apps/api/Modules/SocialAccounts/Endpoints/SocialAccountEndpointsForTenant.cs` — add one `group.MapGet(...)` to C2's existing group (the group's `MapGroup("/social-accounts").RequireRateLimiting(AuthenticatedDefault)` and its `Program.cs` registration already exist — do not re-register anything).
- `packages/client-ts/**` — regenerated by `just generate-client`, never hand-edited.
- `apps/front/src/i18n/locales/en/social-accounts.json` + `fr/social-accounts.json` — kebab-case flat keys, sibling of `en/posts.json`.
- `apps/front/src/i18n/locales/en.ts` / `fr.ts` — register the bundle under `'social-accounts'`.
- `apps/front/src/lib/i18n.namespaces.ts` — add `'social-accounts'` to `FEATURE_I18N_NAMESPACES`.
- `apps/front/src/components/social-accounts/reconnect-banner.tsx` (+ `.test.tsx`) — presentational banner.
- `apps/front/src/routes/authed/tenant/settings/integrations.tsx` (+ `.test.tsx`) — banner slot above the first Card (the real connections surface on develop; there is no `authed/tenant/workspace/index.tsx` — see Open Questions for the eventual workspace-shell home).

### Wave 2 — Pause/Resume coordination (requires D1)

**Modify (on D1 or its merge successor)**
- `apps/api/Modules/Publishing/Services/PublicationStatusTransitionService.cs` — one `AllowedSources` edit (`[Paused]` gains `Scheduled`) + new `MarkScheduledAsync` on interface and implementation + new `MarkPublicationScheduledArgs` record (Task 3).
- `apps/api/Lib/Architecture/ServiceArgsRecordConvention.Spec.cs` — add the new Args record to its assertions (Task 3).

**Create**
- `apps/api/Modules/Publishing/Services/PublicationQueueService.cs` (+ `.Spec.cs`) — read-only finder over `AppDbContext` (paused/scheduled publication ids per account), boundary-legal (Task 5).
- `apps/api/Modules/Publishing/Jobs/PublishPublicationJobHandler` sibling-sweep — modifies `PauseForAccountAsync` to also pause the account's other `Scheduled` publications (Task 4).

**Modify**
- `apps/api/Modules/SocialAccounts/Handlers/Tenant/ReconnectSocialAccountForTenant.cs` — after C2's reconnect succeeds, orchestrate resume via `PublicationQueueService` + transitions (handler-level; Task 5).
- `apps/api/Modules/SocialAccounts/Handlers/Tenant/DisconnectSocialAccountForTenant.cs` — after disconnect succeeds, orchestrate pause-all (Task 5).

---

## Task 1: FindNeedsReconnectAccountsForTenant — banner data endpoint

**Files:**
- Create: `apps/api/Modules/SocialAccounts/Handlers/Tenant/FindNeedsReconnectAccountsForTenant.cs`
- Create: `apps/api/Modules/SocialAccounts/Handlers/Tenant/FindNeedsReconnectAccountsForTenant.Spec.cs`
- Modify: `apps/api/Modules/SocialAccounts/Services/SocialAccountService.cs` — add `FindNeedsReconnectAccountsAsync`
- Modify: `apps/api/Modules/SocialAccounts/Routes.SocialAccounts.cs` — add the route constant
- Modify: `apps/api/Modules/SocialAccounts/Endpoints/SocialAccountEndpointsForTenant.cs` — add the `MapGet`

**Interfaces:**
- Consumes: `AppDbContext`, `SocialAccountStatus.NeedsReconnect`, C2's `SocialAccountService` (concrete-class injection, exactly as `FindSocialAccountsForTenant` does).
- Produces: `GET /social-accounts/needs-reconnect-accounts` → `200 Ok<…Response>` (camelCase JSON), tenant-isolated (a foreign tenant's accounts are simply absent — 200 with an empty list, never a leak), gated on `socialaccounts.view`, group rate-limit `AuthenticatedDefault`.

- [ ] **Step 1: Write the failing test**

Real fixture idiom, copied from the repo's tenant CRUD specs: `IClassFixture<ApiFixture>`, `TestAuthClient.LoginAsync(TestConstants.AcmeAdminEmail, TestConstants.SeedPassword)`, staff login + `TenantTestHelper.GetTenantIdByNameAsync(http, staffToken, SeedConstants.Tenants.AcmeName)` for tenant ids, `.WithSessionToken(token).WithTenantId(tenantId)` request headers. No fabricated fixture helpers.

```csharp
// apps/api/Modules/SocialAccounts/Handlers/Tenant/FindNeedsReconnectAccountsForTenant.Spec.cs
using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Modules.SocialAccounts.Entities;

using Xunit;

namespace PublyApp.Api.Modules.SocialAccounts.Handlers.Tenant;

public sealed class FindNeedsReconnectAccountsForTenantSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public FindNeedsReconnectAccountsForTenantSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	private async Task<(Guid TenantId, string Token)> LoginAsAcmeAdminAsync() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await TenantTestHelper.GetTenantIdByNameAsync(
			_http,
			staffToken,
			SeedConstants.Tenants.AcmeName
		);
		var token = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);
		return (tenantId, token);
	}

	private async Task<Guid> GetOtherTenantIdAsync() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		return await TenantTestHelper.GetTenantIdByNameAsync(
			_http, staffToken, SeedConstants.Tenants.GlobalName
		);
	}

	private static HttpRequestMessage GetRequest(string token, Guid tenantId) {
		return new HttpRequestMessage(
				HttpMethod.Get,
				"/social-accounts/needs-reconnect-accounts"
			)
			.WithSessionToken(token)
			.WithTenantId(tenantId);
	}

	private async Task SeedAccountAsync(
		Guid tenantId,
		string externalAccountId,
		SocialAccountStatus status,
		string? lastError = null
	) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		db.SocialAccount.Add(new SocialAccount {
			TenantId = tenantId,
			ExternalAccountId = externalAccountId,
			DisplayHandle = $"@{externalAccountId}.bsky.social",
			ProtectedCredentials = "x",
			Status = status,
			LastError = lastError,
		});
		await db.SaveChangesAsync();
	}

	[Fact]
	public async Task ItShouldReturnOnlyNeedsReconnectAccountsOfTheCallingTenant() {
		var (tenantId, token) = await LoginAsAcmeAdminAsync();
		await SeedAccountAsync(
			tenantId, "did:plc:test", SocialAccountStatus.NeedsReconnect, "Bluesky refused"
		);

		using var response = await _http.SendAsync(GetRequest(token, tenantId));

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var payload = await response.Content.ReadFromJsonAsync<NeedsReconnectListPayload>();
		payload.Should().NotBeNull();
		Assert.NotNull(payload);
		payload.Accounts.Should().ContainSingle();
		payload.Accounts[0].DisplayHandle.Should().Be("@did:plc:test.bsky.social");
		payload.Accounts[0].Provider.Should().Be("bluesky");
		payload.Accounts[0].LastError.Should().Be("Bluesky refused");
	}

	[Fact]
	public async Task ItShouldReturnEmptyListWhenNoAccountNeedsReconnect() {
		var (tenantId, token) = await LoginAsAcmeAdminAsync();

		using var response = await _http.SendAsync(GetRequest(token, tenantId));

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var payload = await response.Content.ReadFromJsonAsync<NeedsReconnectListPayload>();
		payload!.Accounts.Should().BeEmpty();
	}

	[Fact]
	public async Task ItShouldNotLeakAnotherTenantsAccounts() {
		var (acmeId, acmeToken) = await LoginAsAcmeAdminAsync();
		var globalId = await GetOtherTenantIdAsync();
		await SeedAccountAsync(
			globalId, "did:plc:other", SocialAccountStatus.NeedsReconnect, "Bluesky refused"
		);

		using var response = await _http.SendAsync(GetRequest(acmeToken, acmeId));

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var payload = await response.Content.ReadFromJsonAsync<NeedsReconnectListPayload>();
		payload!.Accounts.Should().BeEmpty(
			"a foreign tenant's account is invisible, never leaked"
		);
	}

	private sealed record NeedsReconnectListPayload(AccountItem[] Accounts);
	private sealed record AccountItem(
		string Id,
		string DisplayHandle,
		string Provider,
		string? LastError
	);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~FindNeedsReconnectAccountsForTenantSpec"`

Expected: FAIL — 404 because the route does not exist yet.

- [ ] **Step 3: Add the service method**

Add to `apps/api/Modules/SocialAccounts/Services/SocialAccountService.cs` (same file/class as C2's methods; "Find" prefix per repo naming):

```csharp
public sealed record SocialAccountNeedsReconnectItem(
	Guid Id,
	string DisplayHandle,
	SocialProvider Provider,
	string? LastError
);

public async Task<IReadOnlyList<SocialAccountNeedsReconnectItem>>
	FindNeedsReconnectAccountsAsync(Guid tenantId, CancellationToken cancellationToken) {
	return await _db.SocialAccount
		.AsNoTracking()
		.Where(a => a.TenantId == tenantId
			&& a.Status == SocialAccountStatus.NeedsReconnect)
		.OrderBy(a => a.DisplayHandle)
		.Select(a => new SocialAccountNeedsReconnectItem(
			a.Id,
			a.DisplayHandle,
			a.Provider,
			a.LastError
		))
		.ToListAsync(cancellationToken);
}
```

Soft-delete filtering: match however C2's own `FindForTenantAsync` treats `SocialAccount` rows — verify the predicate when implementing and add `!a.IsDeleted` only if the entity carries soft deletes (it inherits `BaseAttributes`, so it does; mirror C2's exact filter rather than inventing one).

- [ ] **Step 4: Add route constant, handler, endpoint mapping**

Route constant — in `apps/api/Modules/SocialAccounts/Routes.SocialAccounts.cs`, inside the existing `ForTenant` class (file already declares `public static partial class Routes` in namespace `PublyApp.Api.Lib.Routes` with `#pragma warning disable IDE0130`):

```csharp
public const string FindNeedsReconnect = "/needs-reconnect-accounts";
```

Handler — `apps/api/Modules/SocialAccounts/Handlers/Tenant/FindNeedsReconnectAccountsForTenant.cs`. Shape mirrors `FindSocialAccountsForTenant` (top-level wire types without a `Dto` suffix, static `Handle`, `Guid.TryParse(authContext.TenantId, …)` with `InvalidOperationException` on failure, concrete `SocialAccountService` injection). No pagination needed (banner-sized list):

```csharp
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Modules.SocialAccounts.Services;

namespace PublyApp.Api.Modules.SocialAccounts.Handlers.Tenant;

public sealed class FindNeedsReconnectAccountsForTenantResponse {
	public required IReadOnlyList<AccountItem> Accounts { get; init; }
}

public sealed record AccountItem(
	Guid Id,
	string DisplayHandle,
	string Provider,
	string? LastError
);

public sealed class FindNeedsReconnectAccountsForTenant {
	public static async Task<Ok<FindNeedsReconnectAccountsForTenantResponse>> Handle(
		[FromServices] IRequestAuthContext authContext,
		[FromServices] SocialAccountService socialAccountService,
		CancellationToken cancellationToken = default
	) {
		if (!Guid.TryParse(authContext.TenantId, out var tenantId)) {
			throw new InvalidOperationException(
				$"{nameof(authContext.TenantId)} is not a GUID"
			);
		}

		var accounts = await socialAccountService.FindNeedsReconnectAccountsAsync(
			tenantId,
			cancellationToken
		);

		return TypedResults.Ok(new FindNeedsReconnectAccountsForTenantResponse {
			Accounts = accounts.Select(a => new AccountItem(
				a.Id,
				a.DisplayHandle,
				// Single-provider reality today, identical to C2's own list mapping
				// (SocialAccountService projects Provider = "bluesky"); generalize
				// only when a second provider lands.
				Provider: "bluesky",
				a.LastError
			)).ToList(),
		});
	}
}
```

Endpoint mapping — inside C2's existing `SocialAccountEndpointsForTenant` group in `apps/api/Modules/SocialAccounts/Endpoints/SocialAccountEndpointsForTenant.cs` (do **not** create a new group or touch `Program.cs`; `tenantGroup.MapSocialAccountEndpointsForTenant();` is already registered there by C2):

```csharp
group.MapGet(
	Routes.SocialAccounts.ForTenant.FindNeedsReconnect,
	FindNeedsReconnectAccountsForTenant.Handle
)
	.WithName("FindNeedsReconnectAccountsForTenant")
	.WithSummary("Accounts of the current tenant that need reconnection")
	.WithTenantPermission(
		[AppPermissions.Tenant.SocialAccounts.VIEW]
	);
```

(Rate limiting comes from the group's existing `AuthenticatedDefault` requirement.)

- [ ] **Step 5: Run test to verify it passes**

Same filter as Step 2. Expected: PASS, including the foreign-tenant invisibility case.

- [ ] **Step 6: Regenerate the client**

```bash
just build-api && just generate-client && pnpm --filter front typecheck
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/Modules/SocialAccounts packages/client-ts
git commit -m "feat(api): GET /social-accounts/needs-reconnect-accounts — banner data (C4)"
```

---

## Task 2: Reconnect banner (front)

**Files:**
- Create: `apps/front/src/components/social-accounts/reconnect-banner.tsx`
- Create: `apps/front/src/components/social-accounts/reconnect-banner.test.tsx`
- Create: `apps/front/src/i18n/locales/en/social-accounts.json`, `apps/front/src/i18n/locales/fr/social-accounts.json`
- Modify: `apps/front/src/i18n/locales/en.ts`, `fr.ts` — register the resource bundle
- Modify: `apps/front/src/lib/i18n.namespaces.ts` — add `'social-accounts'` to `FEATURE_I18N_NAMESPACES`
- Modify: `apps/front/src/routes/authed/tenant/settings/integrations.tsx` (+ `.test.tsx`) — banner slot above the first Card

Reality checks that shape this task (verified on develop):
- There is **no** `components/ui/alert.tsx` and **no** `Button` `leftSection`/`rightSection` prop. Buttons take icons as ordinary children marked `data-icon="inline-start"` (styled by `button.variants.ts`'s `has-data-[icon=…]` padding rules).
- Raw palette utilities (`bg-amber-500`…) fail the design-token guard (`check-design-system.mjs`, `no-raw-visual-color`). Warning styling comes from the theme's `--publy-alert-warning-bg/-border/-text` custom properties (defined for light and dark in `apps/front/src/styles/app.css`).

- [ ] **Step 1: Add the i18n bundles**

`apps/front/src/i18n/locales/en/social-accounts.json` (kebab-case flat keys, i18next `{{…}}` interpolation):

```json
{
	"reconnect-banner-title": "{{handle}} needs reconnection",
	"reconnect-banner-description": "{{handle}} stopped working and its scheduled posts were paused.",
	"reconnect-banner-more": "+{{count}} more account(s)",
	"reconnect-banner-button": "Reconnect",
	"reconnect-banner-contact-admin": "Ask someone with manage access to reconnect this account."
}
```

Mirror every key in `apps/front/src/i18n/locales/fr/social-accounts.json` (French copy reviewed at implementation time; never ship English-only). Register the bundle in `en.ts`/`fr.ts` and add the namespace to `FEATURE_I18N_NAMESPACES`.

- [ ] **Step 2: Write the failing component test**

Repo assertion idiom (matches `integrations.test.tsx`): `@vitest-environment jsdom`, `cleanup()` in `afterEach`, `toBeTruthy()`/`toBe()`/`toContain()` — **no jest-dom matchers, no vitest globals reliance**.

```tsx
// apps/front/src/components/social-accounts/reconnect-banner.test.tsx
/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { ReconnectBanner } from './reconnect-banner';

const ACCOUNT = {
	id: '11111111-1111-1111-1111-111111111111',
	displayHandle: '@test.bsky.social',
	lastError: 'Bluesky refused: invalid app password',
};

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe('ReconnectBanner', () => {
	test('renders nothing when no account needs reconnect', () => {
		const { container } = render(
			<ReconnectBanner accounts={[]} hasManagePermission={true} onReconnect={() => {}} />
		);
		expect(container.querySelector('[data-testid="reconnect-banner"]')).toBeNull();
	});

	test('names the first account needing reconnect', () => {
		render(
			<ReconnectBanner accounts={[ACCOUNT]} hasManagePermission={true} onReconnect={() => {}} />
		);
		expect(screen.getByTestId('reconnect-banner').textContent).toContain('@test.bsky.social');
	});

	test('shows the reconnect button for manage holders', () => {
		render(
			<ReconnectBanner accounts={[ACCOUNT]} hasManagePermission={true} onReconnect={() => {}} />
		);
		expect(screen.getByRole('button', { name: 'Reconnect' })).toBeTruthy();
	});

	test('hides the button and shows the contact-admin message otherwise', () => {
		render(
			<ReconnectBanner accounts={[ACCOUNT]} hasManagePermission={false} onReconnect={() => {}} />
		);
		expect(screen.queryByRole('button')).toBeNull();
		expect(screen.getByTestId('reconnect-banner').textContent).toContain('manage');
	});

	test('calls onReconnect with the account id on click', async () => {
		const user = userEvent.setup();
		const onReconnect = vi.fn();
		render(
			<ReconnectBanner accounts={[ACCOUNT]} hasManagePermission={true} onReconnect={onReconnect} />
		);
		await user.click(screen.getByRole('button', { name: 'Reconnect' }));
		expect(onReconnect).toHaveBeenCalledWith(ACCOUNT.id);
	});
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/front && pnpm exec vitest run src/components/social-accounts/reconnect-banner.test.tsx`

Expected: FAIL — module does not exist.

- [ ] **Step 4: Write the component**

```tsx
// apps/front/src/components/social-accounts/reconnect-banner.tsx
import { IconAlertTriangle, IconPlugConnectedX } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

import { Button } from '~/components/ui/button';

export interface NeedsReconnectAccount {
	id: string;
	displayHandle: string;
	lastError: string | null;
}

interface ReconnectBannerProps {
	accounts: NeedsReconnectAccount[];
	hasManagePermission: boolean;
	onReconnect: (accountId: string) => void;
}

export function ReconnectBanner({
	accounts,
	hasManagePermission,
	onReconnect,
}: ReconnectBannerProps) {
	const { t } = useTranslation('social-accounts');

	if (accounts.length === 0) {
		return null;
	}

	const primary = accounts[0];
	const more = accounts.length - 1;

	return (
		<div
			data-testid="reconnect-banner"
			className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--publy-radius-medium-control)] border p-4 text-sm"
			style={{
				backgroundColor: 'var(--publy-alert-warning-bg)',
				borderColor: 'var(--publy-alert-warning-border)',
				color: 'var(--publy-alert-warning-text)',
			}}
		>
			<div className="flex min-w-0 items-start gap-2">
				<IconAlertTriangle className="mt-0.5 size-4 shrink-0" />
				<div className="min-w-0">
					<p className="font-medium">
						{t('reconnect-banner-title', { handle: primary.displayHandle })}
					</p>
					<p className="mt-1 opacity-90">
						{primary.lastError ?? t('reconnect-banner-description', { handle: primary.displayHandle })}
						{more > 0 ? ` ${t('reconnect-banner-more', { count: more })}` : ''}
					</p>
					{!hasManagePermission && (
						<p className="mt-1 text-xs italic opacity-80">
							{t('reconnect-banner-contact-admin')}
						</p>
					)}
				</div>
			</div>
			{hasManagePermission && (
				<Button
					variant="outline"
					size="sm"
					data-testid="reconnect-banner-action"
					onClick={() => onReconnect(primary.id)}
				>
					<IconPlugConnectedX data-icon="inline-start" className="size-3.5" />
					{t('reconnect-banner-button')}
				</Button>
			)}
		</div>
	);
}
```

`lastError` renders verbatim: it was sanitised server-side by `LastErrorSanitiser` before storage (Epic C §4), and the transparent-failure-cause product rule wants the human-readable cause shown, never a generic message.

- [ ] **Step 5: Run test to verify it passes**

Same command as Step 3. Expected: PASS.

- [ ] **Step 6: Wire the slot into the integrations page**

Modify `apps/front/src/routes/authed/tenant/settings/integrations.tsx`:
- Fetch with TanStack Query through the generated Kiota client (regenerated in Task 1 Step 6), browser-side only — this page is CSR; never fetch authenticated domain data in a loader/server function.
- Gate the manage affordance on the signed-in user's actual permissions exactly the way sibling tenant surfaces read them from the session/auth context (inspect the neighbouring pages when implementing; do not invent a `hasPermission()` helper if permissions arrive differently).
- Render `<ReconnectBanner … />` above the first Card.
- `onReconnect` opens the same reconnect drawer flow C2/C3 use (handle prefilled). Until that drawer ships on this branch, the callback may be a stub that logs intent; the banner itself must still render and gate correctly.
- Extend `integrations.test.tsx` with a case asserting `data-testid="reconnect-banner"` appears once the query resolves with one account, mocking the generated client function the way the sibling test mocks its imports.

- [ ] **Step 7: Run the gates**

```bash
cd apps/front && pnpm exec vitest run \
  src/components/social-accounts/reconnect-banner.test.tsx \
  src/routes/authed/tenant/settings/integrations.test.tsx
pnpm --filter front typecheck
pnpm --filter front exec oxlint src/components/social-accounts src/routes/authed/tenant/settings
just react-doctor   # HARD gate: no findings in changed files
```

- [ ] **Step 8: Commit**

```bash
git add apps/front/src/components/social-accounts \
  apps/front/src/i18n/locales/en/social-accounts.json \
  apps/front/src/i18n/locales/fr/social-accounts.json \
  apps/front/src/i18n/locales/en.ts apps/front/src/i18n/locales/fr.ts \
  apps/front/src/lib/i18n.namespaces.ts \
  apps/front/src/routes/authed/tenant/settings
git commit -m "feat(front): needs-reconnect banner on integrations (C4)"
---

## Task 3: Extend the D1 transition contract (map edit + instant-preserving resume)

**Branch note:** these edits land on `origin/lane/wt-644` or its merge successor; if D1 has already merged to develop, edit develop instead. Gate: requires D1 (see Global Constraints).

**Files:**
- Modify: `apps/api/Modules/Publishing/Services/PublicationStatusTransitionService.cs` — one `AllowedSources` entry, one interface member, one Args record, one implementation
- Modify (conditional): `apps/api/Lib/Architecture/ServiceArgsRecordConvention.Spec.cs` — register the new Args record

**Why:** `Paused → Scheduled` is already legal in the map but the only existing method that performs it (`RescheduleToNowAsync`) stamps `ScheduledAtUtc = DateTime.UtcNow` and wipes external fields — wrong for resume. And `Scheduled → Paused` (pausing a publication before its first run because its account broke) is not legal yet. This task makes both possible with the smallest contract change.

- [ ] **Step 1 (RED): Add failing tests to `PublicationStatusTransitionService.Spec.cs`**

Reuse that spec's seeding helper (fresh tenant/user/post/account/publication per test, `GetRequiredId()` everywhere):

```csharp
[Fact]
public async Task ItShouldPauseAScheduledPublicationAndPreserveItsInstant() {
	var seeded = await SeedAsync(db, PublicationStatus.Scheduled);

	var ok = await service.MarkPausedAsync(
		new MarkPublicationPausedArgs(
			seeded.PublicationId,
			seeded.TenantId,
			"the social account needs reconnecting"
		),
		CancellationToken.None
	);

	ok.Should().BeTrue();
	var reloaded = await db.Publication.AsNoTracking()
		.SingleAsync(p => p.Id == seeded.PublicationId);
	reloaded.Status.Should().Be(PublicationStatus.Paused);
	reloaded.ScheduledAtUtc.Should().BeCloseTo(
		seeded.ScheduledAtUtc, TimeSpan.FromSeconds(5)
	); // instant preserved so a later resume can restore it
	reloaded.LastError.Should().Contain("reconnecting");
}

[Fact]
public async Task ItShouldResumeAPausedPublicationKeepingItsOriginalInstant() {
	var seeded = await SeedAsync(db, PublicationStatus.Paused);

	var ok = await service.MarkScheduledAsync(
		new MarkPublicationScheduledArgs(seeded.PublicationId, seeded.TenantId),
		CancellationToken.None
	);

	ok.Should().BeTrue();
	var reloaded = await db.Publication.AsNoTracking()
		.SingleAsync(p => p.Id == seeded.PublicationId);
	reloaded.Status.Should().Be(PublicationStatus.Scheduled);
	reloaded.ScheduledAtUtc.Should().BeCloseTo(
		seeded.ScheduledAtUtc, TimeSpan.FromSeconds(5)
	); // NOT DateTime.UtcNow — resume must never fire work late
	reloaded.LastError.Should().BeNull();
}

[Fact]
public async Task ItShouldThrowWhenMarkScheduledIsCalledOnAnAlreadyScheduledRow() {
	var seeded = await SeedAsync(db, PublicationStatus.Scheduled);

	var act = async () => await service.MarkScheduledAsync(
		new MarkPublicationScheduledArgs(seeded.PublicationId, seeded.TenantId),
		CancellationToken.None
	);

	await act.Should().ThrowAsync<InvalidOperationException>();
}
```

Note the deliberate asymmetry this locks in: `[Scheduled] ← [Failed]` stays as D1 shipped it (manual reschedule-after-failure remains possible via `RescheduleToNowAsync`), while resume goes exclusively through the new instant-preserving method. Update any existing spec that pins the exact `AllowedSources` contents (check the wt-644 spec when implementing).

- [ ] **Step 2: Verify RED**

Run: `cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~PublicationStatusTransitionServiceSpec"`

Expected: FAIL — `MarkScheduledAsync` does not exist (compile error counts as RED) and/or `Scheduled → Paused` currently throws.

- [ ] **Step 3: Make the edits**

Edit 1 — exactly one map change (everything else byte-identical to wt-644):

```csharp
[PublicationStatus.Paused] = [
	PublicationStatus.InProgress,
	PublicationStatus.Scheduled,   // NEW (C4): pause-on-account-failure before first run
],
```

Edit 2 — Args record next to the existing ones:

```csharp
public sealed record MarkPublicationScheduledArgs(Guid PublicationId, Guid TenantId);
```

Edit 3 — interface member:

```csharp
public Task<bool> MarkScheduledAsync(
	MarkPublicationScheduledArgs args,
	CancellationToken cancellationToken
);
```

Edit 4 — implementation mirroring `RescheduleToNowAsync`, minus everything resume must NOT do (no instant stamp, no external-field wipe):

```csharp
public async Task<bool> MarkScheduledAsync(
	MarkPublicationScheduledArgs args,
	CancellationToken cancellationToken
) {
	var publication = await LoadAsync(args.PublicationId, args.TenantId, cancellationToken);
	if (publication is null) {
		return false;
	}

	TransitionOrThrow(publication.Status, PublicationStatus.Scheduled);
	publication.Status = PublicationStatus.Scheduled;
	publication.LastError = null;
	await _db.SaveChangesAsync(cancellationToken);
	return true;
}
```

- [ ] **Step 4: Args-record convention**

Open `apps/api/Lib/Architecture/ServiceArgsRecordConvention.Spec.cs`. If it enumerates Args records explicitly, add `MarkPublicationScheduledArgs` following its pattern; if it discovers them by convention, confirm it passes unchanged. Do not hand-edit without checking which mode it uses.

- [ ] **Step 5: Verify GREEN + guards**

```bash
cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test \
	--filter "FullyQualifiedName~PublicationStatusTransitionServiceSpec|FullyQualifiedName~ServiceArgsRecordConvention"
```

The `PublicationArchitectureSpec` writer-scan stays green automatically: writes inside `PublicationStatusTransitionService.cs` are exempt by path.

- [ ] **Step 6: Commit**

```bash
git add apps/api/Modules/Publishing/Services/PublicationStatusTransitionService.cs \
  apps/api/Lib/Architecture/ServiceArgsRecordConvention.Spec.cs
git commit -m "feat(api): transition gains Scheduled-to-Paused and instant-preserving resume (C4)"
```

---

## Task 4: Sibling-pause sweep in the job handler

Gate: requires D1 + Task 3 (the sweep pauses `Scheduled` rows).

**Files:**
- Modify: `apps/api/Modules/Publishing/Jobs/PublishPublicationJobHandler.cs` — extend `PauseForAccountAsync`
- Modify: `apps/api/Modules/Publishing/Jobs/PublishPublicationJobHandler.Spec.cs` — cover the sweep

**Reality check (verified on wt-644):** the handler already classifies credential failures and calls its private `PauseForAccountAsync`, which (a) pauses the failing publication via `_transitions.MarkPausedAsync` and (b) flags the account via private `FlagAccountNeedsReconnectAsync` (a direct `account.Status = SocialAccountStatus.NeedsReconnect` write — safe under the architecture scan because the line mentions neither "publication" nor "pub."). What it does **not** do today: pause the account's **other** `Scheduled` publications. C4 adds exactly that, inside the same private method, so failure classification stays untouched. The handler orchestrating multiple transition calls is boundary-legal (it is a job handler, not a domain service).

- [ ] **Step 1 (RED): Add sweep tests to `PublishPublicationJobHandler.Spec.cs`**

Reuse the spec's existing `SeedAsync(AppDbContext, PublicationStatus)` helper. New cases:

1. `ItShouldPauseAllOtherScheduledPublicationsOfTheSameAccountOnCredentialFailure` — seed account A with the failing run plus Scheduled siblings S1, S2 on A, and a Scheduled S3 on a *different* account of the same tenant. Drive the credential-failure path. Assert: failing row → Paused; S1/S2 → Paused with the same sanitised cause; S3 still Scheduled; account row `Status == NeedsReconnect`.
2. `ItShouldKeepSweepCausesSanitised` — feed a raw cause containing `'app-password-hunter2'`; assert stored causes contain `[redacted]` and never the raw secret (Epic C §4 + repo transparent-failure rule).

- [ ] **Step 2: Verify RED**

Run: `cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~PublishPublicationJobHandlerSpec"`

Expected: FAIL — S1/S2 remain Scheduled today.

- [ ] **Step 3: Implement inside `PauseForAccountAsync`**

Start from the wt-644 file and append the marked block; the two existing calls stay byte-identical:

```csharp
private async Task PauseForAccountAsync(
	Publication publication,
	string rawCause,
	CancellationToken cancellationToken
) {
	var cause =
		$"the social account needs reconnecting: "
			+ $"{LastErrorSanitiser.Sanitize(rawCause) ?? rawCause}";
	await _transitions.MarkPausedAsync(
		new MarkPublicationPausedArgs(
			publication.GetRequiredId(),
			publication.TenantId,
			cause
		),
		cancellationToken
	);
	await FlagAccountNeedsReconnectAsync(publication.SocialAccountId, cause, cancellationToken);

	// C4: sibling-pause sweep — the account's other scheduled rows must not sit
	// queued behind broken credentials. Same sanitised cause everywhere. All moves
	// go through the transition service, so the architecture writer-scan stays green.
	var siblingIds = await _db.Publication
		.Where(p => p.SocialAccountId == publication.SocialAccountId
			&& p.TenantId == publication.TenantId
			&& p.Status == PublicationStatus.Scheduled)
		.Select(p => p.Id)
		.ToListAsync(cancellationToken);
	foreach (var siblingId in siblingIds) {
		await _transitions.MarkPausedAsync(
			new MarkPublicationPausedArgs(siblingId, publication.TenantId, cause),
			cancellationToken
		);
	}
}
```

Guard interaction: do not introduce any direct `.Status =` write here; the sweep deliberately loops through `_transitions`.

- [ ] **Step 4: Verify GREEN including the ratchet**

Run:
```bash
cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test \
	--filter "FullyQualifiedName~PublishPublicationJobHandlerSpec|FullyQualifiedName~PublicationArchitectureSpec"
```

Expected: PASS, including `ItShouldLetOnlyTheTransitionServiceWritePublicationStatus`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/Modules/Publishing/Jobs
git commit -m "feat(api): pause all scheduled publications of a broken social account (C4)"
```

---

## Task 5: Resume-on-reconnect & pause-on-disconnect (handler orchestration)

Gate: requires D1 + Task 3 (+ C2 merged, for the handlers being modified).

**Files:**
- Create: `apps/api/Modules/Publishing/Services/PublicationQueueService.cs` (+ `.Spec.cs`)
- Modify: `apps/api/Modules/SocialAccounts/Handlers/Tenant/ReconnectSocialAccountForTenant.cs` — append resume step
- Modify: `apps/api/Modules/SocialAccounts/Handlers/Tenant/DisconnectSocialAccountForTenant.cs` — append pause-all step

**Design (boundary-compliant):**

New read-only finder service, AppDbContext-only constructor (passes `ServiceDependencyBoundaryGuard.Spec.cs`; handlers orchestrate, services implement; handlers never touch `DbContext` directly):

```csharp
namespace PublyApp.Api.Modules.Publishing.Services;

public sealed record FindPublicationsOfAccountArgs(Guid TenantId, Guid SocialAccountId);

public interface IPublicationQueueService {
	/// <summary>
	/// Non-terminal rows (Scheduled + Paused) of one account, with their instants.
	/// Tenant-scoped load: a foreign tenant's rows are invisible.
	/// </summary>
	public Task<IReadOnlyList<(Guid Id, DateTime ScheduledAtUtc)>>
		FindNonTerminalForAccountAsync(
			FindPublicationsOfAccountArgs args,
			CancellationToken cancellationToken
		);
}
```

Implementation: `[Service]`-attributed class over `AppDbContext`, `AsNoTracking`, filter `TenantId + SocialAccountId + Status in {Scheduled, Paused}`, project `(Id, ScheduledAtUtc)`.

**Resume policy (Epic C §5):** on reconnect, rows with a **future** instant are resumed via `MarkScheduledAsync` (legal from both Paused and Scheduled). Rows whose instant has **passed** are re-paused via `MarkPausedAsync` with a cause telling the user to pick a new time (legal from both Paused and Scheduled after Task 3). Nothing late ever fires. The `wasPaused` distinction is unnecessary once both sources are legal — the instant alone decides.

- [ ] **Step 1: PublicationQueueService TDD**

Spec follows the `PublishPublicationJobHandler.Spec.cs` seeding idiom. Cases: returns only the calling tenant's rows; returns only Scheduled+Paused rows (Published/Failed excluded); empty result when none match; foreign-tenant invisibility.

- [ ] **Step 2 (RED): Extend ReconnectSocialAccountForTenant.Spec.cs**

C2's reconnect spec asserts `SocialAccountService.ReconnectAsync` flips the account back to `Active`. Add: after reconnect, a Paused future-instant publication of that account becomes `Scheduled` with its original instant preserved, and a past-due Paused row stays `Paused` with an updated cause mentioning choosing a new time. Seed publications using the D1 idiom.

- [ ] **Step 3: Wire resume into the reconnect handler**

After C2's success path in `ReconnectSocialAccountForTenant.Handle` (inject both services via `[FromServices]` alongside C2's existing parameters):

```csharp
var queueRows = await publicationQueueService.FindNonTerminalForAccountAsync(
	new FindPublicationsOfAccountArgs(tenantId, socialAccountId),
	cancellationToken
);
foreach (var (publicationId, scheduledAtUtc) in queueRows) {
	if (scheduledAtUtc > DateTime.UtcNow) {
		await transitions.MarkScheduledAsync(
			new MarkPublicationScheduledArgs(publicationId, tenantId),
			cancellationToken
		);
	} else {
		await transitions.MarkPausedAsync(
			new MarkPublicationPausedArgs(
				publicationId,
				tenantId,
				"its scheduled time passed while the account needed reconnection"
					+ "; choose a new time to publish it"
			),
			cancellationToken
		);
	}
}
```

Loop-of-single-transactions is acceptable at banner scale (a tenant's queued publications for one account); note it in the handler comment.

- [ ] **Step 4 (RED→GREEN): Wire pause-all into DisconnectSocialAccountForTenant**

Add a spec case: after disconnect, all non-terminal publications of the account end up `Paused` with cause mentioning disconnection (both future and past instants — everything stops). Implementation mirrors Step 3 but calls `MarkPausedAsync` unconditionally with cause `"its social account was disconnected"`.

- [ ] **Step 5: Full gates + client regen**

```bash
just build-api && just generate-client && pnpm --filter front typecheck
cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test \
	--filter "FullyQualifiedName~PublicationQueueServiceSpec|FullyQualifiedName~ReconnectSocialAccountForTenantSpec|FullyQualifiedName~DisconnectSocialAccountForTenantSpec|FullyQualifiedName~ServiceDependencyBoundaryGuard"
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/Modules/Publishing/Services/PublicationQueueService.cs \
  apps/api/Modules/Publishing/Services/PublicationQueueService.Spec.cs \
  apps/api/Modules/SocialAccounts/Handlers/Tenant packages/client-ts
git commit -m "feat(api): resume on reconnect, pause on disconnect (C4)"
```

---

## Task 6: E2E coverage decision + final gates

**Files:** possibly one new e2e spec under the repo's e2e suite; otherwise documentation-only.

- [ ] **Step 1: Apply the five-criteria test** from [`docs/guides/e2e-coverage.md`](../../guides/e2e-coverage.md) to each C4 behavior. Expected outcome: the pause/resume/sweep machinery is fully covered by API integration specs (real Postgres, real HTTP); the banner render + gating is covered by component tests. The one candidate that may meet all five criteria is "tenant admin sees the reconnect banner and can start reconnection" — seedable entirely server-side (set an account to `NeedsReconnect`), observable through real UI. If it qualifies, add it with the tag vocabulary from [`docs/guides/e2e-tags.md`](../../guides/e2e-tags.md); if not, record the reasoning in the PR description instead of forcing a low-value e2e.
- [ ] **Step 2: Run the local CI gate**

```bash
just ci
```

(CI itself never runs the API suite; `just ci` is the stronger backend signal and includes `ci-front`, design-token and z-index guards.)

- [ ] **Step 3: Commit any e2e addition**

```bash
git add <e2e paths>
git commit -m "test(e2e): reconnect banner visible to tenant admin (C4)"   # only if Step 1 added a test
```

---

## Open Questions (flagged for the reviewer, none block implementation)

1. **Banner home:** develop has no `authed/tenant/workspace/index.tsx`; the integrations settings page is where accounts actually live today, so Wave 1 puts the banner there. When the workspace shell ships (Epic C §3 "Workspace banner"), moving the slot is a one-component relocation.
2. **Past-due UX after resume-block:** a past-due paused row needs a "choose a new time" affordance. Epic D §3 item 6 owns rescheduling UX; until it lands, the banner + publication list show the stored cause (transparent-failure rule satisfied).
3. **Due-scan vs NeedsReconnect accounts:** whether D3's due scan filters by account status. Either way C4 is correct — a claimed row on a broken account hits the credential-failure classifier and lands in `PauseForAccountAsync` — but confirming the predicate sharpens the reconnect-handler comment in Task 5 Step 3.
4. **Multi-account banners:** the endpoint returns all needs-reconnect accounts; the banner shows the first + "+N more". If product wants per-account rows with individual buttons, that is a Task 2 prop-shape change only.

---

## Appendix A: Verification ledger (every load-bearing symbol)

| Symbol / fact | Verified at |
|---|---|
| `IPublicationStatusTransitionService`: five `Task<bool>` members taking Args records | `git show origin/lane/wt-644:apps/api/Modules/Publishing/Services/PublicationStatusTransitionService.cs` |
| `AllowedSources` map contents (incl. `Paused ← InProgress` only; `Scheduled ← [Scheduled, Paused, Failed]`) | same file |
| `RescheduleToNowAsync` stamps `DateTime.UtcNow`, clears LastError/external fields | same file |
| No `MarkScheduledAsync`, no `SwitchToNeedsReconnectAsync`, no `ResumeForReconnectAsync`, no `SocialAccountStatusService` anywhere | exhaustive grep across all remote refs (only hits were this plan's own drafts) |
| `PublicationArchitectureSpec` = CK constraint/index assertions + line-scan for `.Status =` writes outside the transition service, offender lines must mention "publication"/"pub." | `origin/lane/wt-644:apps/api/Lib/Architecture/PublicationArchitecture.Spec.cs` |
| `ServiceDependencyBoundaryGuard.Spec.cs` forbids domain-service→domain-service injection | develop, `apps/api/Lib/Architecture/` |
| `PublishPublicationJobHandler.PauseForAccountAsync` / `FlagAccountNeedsReconnectAsync` exist; account flagged directly | `origin/lane/wt-644:apps/api/Modules/Publishing/Jobs/PublishPublicationJobHandler.cs` |
| `Publication` entity fields incl. `required SocialAccountId`, `ScheduledTimeZone`, `IdempotencyKey` | `origin/lane/wt-644:apps/api/Modules/Publishing/Entities/Publication.cs` |
| `SocialAccount` entity fields incl. `required ExternalAccountId/DisplayHandle/ProtectedCredentials`, `LastError` | `origin/lane/wt-641:apps/api/Modules/SocialAccounts/Entities/SocialAccount.cs` |
| `Routes.SocialAccounts.ForTenant` partial + `MapSocialAccountEndpointsForTenant` group + Program registration | `origin/lane/wt-641:apps/api/Modules/SocialAccounts/Routes.SocialAccounts.cs`, `Endpoints/SocialAccountEndpointsForTenant.cs`, `Program.cs` L321 |
| `FindSocialAccountsForTenant` handler shape (auth-context parse, concrete service injection, wire mapping `Provider = "bluesky"`) | `origin/lane/wt-641:.../FindSocialAccountsForTenant.cs` |
| `LastErrorSanitiser.Sanitize(string?) : string?`, 2 KB cap, `[redacted]` placeholders | `origin/lane/wt-641:apps/api/Modules/SocialAccounts/Lib/LastErrorSanitiser.cs` |
| Test infra: `ApiFixture.Factory/.HttpClient`, `TestAuthClient.LoginAsync/LoginAsStaffAdminAsync`, `WithSessionToken/.WithTenantId`, `TenantTestHelper.GetTenantIdByNameAsync`, `SeedConstants.Tenants.AcmeName/GlobalName`, `TestConstants.SeedPassword/AcmeAdminEmail`, `BaseAttributes.GetRequiredId()` | develop, `apps/api/Lib/Testing/**`, `apps/api/Data/BaseAttributes.cs` |
| Front: no jest-dom; `statusPillTone` tones; `Button` wraps Base UI with `data-icon="inline-start"` icon convention; `--publy-alert-warning-*` tokens; kebab-case i18n JSON bundles registered in `locales/en.ts` + `FEATURE_I18N_NAMESPACES`; `routes/authed/tenant/settings/integrations.tsx` exists; no `components/ui/alert.tsx` | develop, `apps/front/src/**` |

## Appendix B: Red-proof protocol (applies to Tasks 3–5)

Every behavioral change proves its test bites, mutation-style, before the fix is trusted:

1. Write the new spec; run it; confirm it fails.
2. Temporarily revert only the production edit (remove the map entry / comment out the sweep loop / skip the resume branch).
3. Confirm the spec fails for the *right reason* (the assertion that encodes the requirement, not setup noise).
4. Restore the edit; confirm green; leave the tree clean — planted mutations are never committed.

This satisfies the round-1 finding that demanded red-first evidence rather than asserted coverage.
