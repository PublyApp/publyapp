# Lane #366 — Tenant-side settings self-service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close #366 by replacing the deferred, coming-later tenant `Settings > General / Members / Roles` surfaces with real tenant self-service functionality backed by real tenant-scoped APIs — or, where a surface cannot yet be real, keeping its explicit gate. Today only `GET/PATCH /settings/general` is real; Members and Roles render `StateSurface` placeholders (#429 locked the mock versions away), and the tenant self-service route constants `Routes.Users.ForTenant` / `Routes.Invitations.ForTenant` exist but are mapped nowhere.

**Architecture:** Three vertical slices reusing the existing fine-grained tenant permission catalog (no new permission keys, no migration):

1. **Phase 1 — Members & invitations read API + real Members page.** Two new root-scope tenant endpoint groups: `FindTenantUsersForTenant` (`GET /users`, cursor keyset pagination, `q` + `status` filters) and `FindTenantInvitationsForTenant` (`GET /invitations`, cursor keyset pagination, pending-first). Both reuse the existing query services proven by the staff slices (`TenantUserQueryService.FindTenantUsersAsync`, `InvitationQueryService.FindTenantInvitationsAsync`) instead of new parallel services. `Settings > Members` swaps its two coming-later cards for real `QueryDisplay`-driven tables fed by new TanStack Query hooks; empty rosters keep honest empty states.
2. **Phase 2 — Profiles (roles) read API + real Roles page.** `FindTenantProfilesForTenant` (`GET /profiles`) over the existing `Profile` entities, gated by `AppPermissions.Tenant.Profiles.VIEW`. `Settings > Roles` renders the real profile list with its permission count; the permission matrix stays read-only (profile editing remains a staff-side act in this phase).
3. **Phase 3 — Member lifecycle mutations.** `InviteTenantUserForTenant` (`POST /users/invite`, reusing the invitation creation pipeline incl. email outbox), `UpdateTenantMemberLevelForTenant` (`PATCH /users/{userId}` level change), `SuspendTenantMemberForTenant` / `ReactivateTenantMemberForTenant` / `RemoveTenantMemberForTenant`. Every mutation writes an audit row through `IAuditLogService.LogAsync` and returns typed RFC 7807 failures naming the cause. The front Members page gains gated row actions behind `members.manage` / `members.suspend` / `members.remove`.
4. **Explicitly deferred (tracked, not silent):** the General-page danger zone (workspace delete/transfer needs a product decision on ownership transfer semantics) and billing/security/integrations/workspaces tabs stay gated exactly as #429 left them. This plan does not un-gate them.

**Tech stack:** .NET 10 minimal APIs, EF Core 10, xUnit + FluentAssertions + Testcontainers via `ApiFixture`, React 19 (TanStack Start, Base UI, Tailwind v4), TanStack Query + the auto-generated Kiota client, `react-i18next` using the existing `settings` namespace.

## Design decisions and alternatives

1. **Route shape: root resources, not `/settings/...` nesting.** `Routes.Tenant.Root` is `/`; tenant self-service keeps the guide's symmetry with staff routes (`/tenants/{tenantId}/users` ↔ `/users`, `/tenants/{tenantId}/invitations` ↔ `/invitations`). *Alternative rejected:* nesting under `/settings/members` — it would fork the resource names between staff and tenant APIs and put user resources inside a page-shaped path. The `Routes.Users.ForTenant` / `Routes.Invitations.ForTenant` constants already exist for exactly this.
2. **Permissions: reuse the seeded catalog.** `members.view/manage/suspend/remove`, `invitations.view/create/revoke`, `profiles.view` already exist as tenant-scope keys, are seeded by reflection over `AppPermissions` (`PermissionSeeder.GetPermissionsPool`), and are configurable in staff-managed tenant profiles today. *Alternative rejected:* fresh `settings.members.*` keys — duplicates in the catalog would force a data migration and confuse the staff profile permission matrix, which renders one group per slice KeyPrefix.
3. **Services: reuse the existing query services.** `TenantUserQueryService` and `InvitationQueryService` are DbContext-only services (legal for any actor); their find methods carry no staff-only semantics (PUBLY0007 constrains staff handlers, not these methods). *Alternative rejected:* new `*ForTenant*` service copies — duplicated filters drift. New code is limited to handlers + wire types; Phase 3 mutation logic goes into small new services in the owning domain (`Users/Services`, `Invitations/Services`) because handlers must not hold `DbContext`.
4. **Self-service visibility semantics.** A tenant member sees the roster including suspended rows *with their status shown* (honest roster, matches the staff table), but never sees deleted rows (soft-delete filter) and never sees another tenant's rows (the tenant id comes from `X-Tenant-Id` via the session auth chain, never from the client body). Invitations default to `status=pending` so the Members page's "Pending invitations" card answers its actual question; explicit `status=` filters are allowed exactly as the staff endpoint validates them (`InvitationEffectiveStatus` set).
5. **Pagination: cursor keyset everywhere**, `CursorPaginatedQueryValidator<T>` base, snake_case query params (`q`, `status`, `cursor`, `size`, `sort_id`, `sort_order`), malformed id → 400 via `Guid.TryParse`, unknown sort_id → typed 400. No offset pagination, no `[FromQuery] List<T>?`.
6. **Rate limiting: `ApiRateLimitPolicies.AuthenticatedDefault`** for every new route — the same bucket the existing `tenantGroup` self-service settings endpoints use. *Alternative considered:* `HeavySearchList` (staff list pages) — rejected for tenant lists: they are small per-tenant rosters, and a quieter bucket than the surface next door would be a regression in consistency, not a feature.
7. **Audit: reads do not audit; every Phase 3 mutation audits.** New `AuditActions` constants: `member.invited`, `member.level_updated`, `member.suspended`, `member.reactivated`, `member.removed` (target = the affected `user_accounts.id` or `invitations.id`, details = email + prior/new value). Auto-discovered by `AuditActionsRegistry` via reflection — only the constants and one registry assertion are added.
8. **Transparent failure causes.** Every typed failure names the cause in plain words: inviting an existing active member → 409 "this person is already a member of this workspace"; removing yourself → 409 "you cannot remove your own account"; suspending yourself or the last admin → 409 naming the reason. Never a bare 500 or an empty `Failed` reason (owner product rule 2026-08-22).
9. **Front rendering strategy.** Authenticated CSR pages fetch in the browser via TanStack Query + Kiota client; no server loader touches these endpoints. Errors flow through `ApiFailure` + `getFailureMessage(toApiFailure(error))` — never hand-translated `response-message` keys. Loading/error/empty states use `QueryDisplay` + the `state-view`/`state-surface` components. URL state stays snake_case if/when search lands on the Members page.
10. **i18n.** All new copy lives in `apps/front/src/i18n/locales/{en,fr}/settings.json` (the namespace these routes already load via `staticData.i18nNamespaces`). EN/FR shapes identical; `i18n-key-coverage.test.ts` enforces parity automatically. Response-message keys for backend failures go in `packages/shared-ts/src/lib/i18n/json/response-message.{en,fr}.json` + regenerated `ResponseKeys.g.cs` via `just generate-response-keys`.
11. **No schema changes.** Phases 1–2 are read-only over existing tables. Phase 3 writes rows that already exist as concepts (invitations, membership status) with existing columns; if implementation proves otherwise, `just db-add TenantSelfServiceP3 && just db-migrate` and run `just ci-migration-expand-contract`.

## Global constraints (from AGENTS.md and the guides)

- C# analyzer rules PUBLY0001–0008: no `!`, no `?? throw`, no `ToLower()` dispatch, cached JsonElement getters, no `Dto` suffix on wire types, `Handle` entrypoint, top-level sibling contract types, no `DbContext` in handlers.
- No disable/suppression comments, no guard/allowlist loosening, class methods never arrows, boring SOLID/DDD code.
- Every endpoint attaches `.WithTenantPermission([...])`; no route constraints on ids; errors via `TypedProblems.*` (`AppProblemDetails`/`ValidationProblemDetails`).
- After any contract change: `just build-api && just generate-client && pnpm --filter front typecheck`; commit the regenerated client; second regen is zero diff.
- CI never runs the API suite: full `just test-api` under `heavy.sh` is mandatory evidence per implementation lane, quoted as totals in that PR.
- e2e specs: tag vocabulary requires `@domain` + `@ticket` on every top-level describe — use `@tenant-workspace` + `@366` (`docs/guides/e2e-tags.md`).
- Paired RED proof per implementation lane: `.dump/proof-red.md` (disable the mechanism under test → new test RED → restore, md5 before/after) and one adversarial mutation named in that PR body.
- Do not run the local e2e stack locally; CI runs front-e2e on the PR and that is the evidence.

## File structure

**Create — Phase 1 (API)**

- `apps/api/Modules/Users/Routes.Users.cs` — **reuse, do not re-add:** the existing `Routes.Users.ForTenant` class (`apps/api/Modules/Users/Routes.Users.cs:193-198`) already declares `Root = "/users"`, `Find = "/"`, `GetById = "/{userId}"`, `Invite = "/invite"`. Only ADD the Phase 3 mutation constants it still lacks (e.g. an `Update`, `Suspend`, `Reactivate`, `Delete` family under `/{userId}`, mirroring the naming of the sibling `ForTenantUsersAsStaff` class). Constants only; no behavior; no duplicate constant names.
- `apps/api/Modules/Users/Handlers/Tenant/FindTenantUsersForTenant.cs` + `.Spec.cs` — `GET /users`. Result `FindTenantUsersForTenantResult : CursorPaginatedResult<TenantUserItem>`, reusing the exact staff item shape from `FindTenantUsersAsStaff.cs` (`TenantUserItem`: `Id`, `UserAccountId`, `Email`, `FirstName`, `LastName`, `AvatarUrl`, `Status`, `Level`) so the Kiota client sees one canonical member row shape across actors. Query: `q`, `status`, cursor quartet; validator inherits `CursorPaginatedQueryValidator<T>`; statuses validated against `AccountStatus`/`AccountLevel` name sets (OrdinalIgnoreCase, display strings pre-lowercased at init).
- `apps/api/Modules/Users/Endpoints/UserEndpointsForTenant.cs` — new group at `Routes.Users.ForTenant.Root` with `RequireRateLimiting(AuthenticatedDefault)`, `WithTags("Users")`, both GETs carrying `.WithTenantPermission([AppPermissions.Tenant.Members.VIEW])`.
- `apps/api/Program.cs` wiring — `tenantGroup.MapUserEndpointsForTenant();` next to `MapSettingsEndpointsForTenant()` (`apps/api/Program.cs:318`).

**Create — Phase 1 (API, invitations)**

- `apps/api/Modules/Invitations/Routes.Invitations.cs` — **reuse, do not re-add:** `Routes.Invitations.ForTenant` already declares everything Phase 1 needs (`Root = "/invitations"`, `Create = "/"`, `Find = "/"`, `RevokeById = "/{invitationId}"`, at `apps/api/Modules/Invitations/Routes.Invitations.cs:85-90`). No constant changes required for this phase.
- `apps/api/Modules/Invitations/Handlers/Tenant/FindTenantInvitationsForTenant.cs` + `.Spec.cs` — `GET /invitations`; same shape as `FindInvitationsForTenantAsStaff` minus tenant-id-in-path (implicit from auth); default status filter `pending` when the caller omits `status`.
- `apps/api/Modules/Invitations/Endpoints/InvitationEndpointsForTenant.cs` + Program wiring, `.WithTenantPermission([AppPermissions.Tenant.Invitations.VIEW])`.

**Modify — Phase 1 (front)**

- `packages/client-ts/**` — regenerated, committed.
- `apps/front/src/lib/query/tenant-members.ts` (+ `.test.ts`) — `useTenantMembersQuery`, `useTenantPendingInvitationsQuery`: cursor-aware hooks keyed `['tenant','tenant-members',tenantId]`, mirroring `tenant-settings-general.ts`.
- `apps/front/src/routes/authed/tenant/settings/members.tsx` — replace the two `StateSurface` cards with `QueryDisplay` + real tables (name/email, level badge, status badge; invitations: email, invited-by, expires-at, status). Keep `ReadOnlyBadge` (no mutations until Phase 3). Honest empty states remain when a query returns zero rows.
- `apps/front/src/routes/authed/tenant/settings/members.test.tsx` — rewritten for the data-driven page (see Task 2 test code).
- `apps/front/src/i18n/locales/{en,fr}/settings.json` — members table copy keys.
- `apps/front/e2e/tenant-settings-members.spec.ts` — `test.describe('tenant settings members', { tag: ['@tenant-workspace', '@366'] })`: login as seeded admin, open Settings > Members, assert the seeded member row and the pending invitation row appear; assert the Roles tab is still explicitly gated.

**Create — Phase 2**

- `apps/api/Modules/Profiles/Routes.Profiles.cs` — add `Routes.Profiles.ForTenant { Root = "/profiles"; Find = "/" }`.
- `apps/api/Modules/Profiles/Handlers/Tenant/FindTenantProfilesForTenant.cs` + `.Spec.cs` — `GET /profiles`: id, name, description, permission_count, is_system, created_at; `.WithTenantPermission([AppPermissions.Tenant.Profiles.VIEW])`.
- `apps/front/src/lib/query/tenant-profiles.ts`, `roles.tsx` rewrite (real list, matrix stays read-only), i18n keys, tests.

**Create — Phase 3**

- `apps/api/Modules/AuditLogs/Entities/AuditLog.cs` — five `member.*` action constants after the existing `TenantUser*` family; one new `[Fact]` in `AuditActionsRegistry.Spec.cs`.
- `apps/api/Modules/Users/Services/TenantMemberLifecycleService.cs` + `.Spec.cs` — owns invite/level/suspend/reactivate/remove rules (self-action guard, last-active-admin guard, suspended-target guards) with discriminated-union results; `[Service]`-registered; depends only on `DbContext` + infrastructure.
- `apps/api/Modules/Users/Handlers/Tenant/{InviteTenantUserForTenant,UpdateTenantMemberLevelForTenant,SuspendTenantMemberForTenant,ReactivateTenantMemberForTenant,RemoveTenantMemberForTenant}.cs` + specs — permission gates `members.manage` / `members.suspend` / `members.remove`; bodies via `JsonElement` + `WithReqBodyValidation<T>`; success contracts per convention (create → 201, action/delete → 200 `Ok<ApiResponse>` with message + translationKey).
- Front: row-action menus on Members (bulk conventions apply when bulk arrives), confirm dialogs, mutation hooks, i18n, component tests; e2e extends `tenant-settings-members.spec.ts` with the invite flow.

---

## Task 1 (Phase 1): tenant members + pending invitations read endpoints

**Files:** Create `FindTenantUsersForTenant.cs/.Spec.cs`, `UserEndpointsForTenant.cs`; modify `Program.cs`; create `FindTenantInvitationsForTenant.cs/.Spec.cs`, `InvitationEndpointsForTenant.cs`. No route-constant file changes: `Routes.Users.ForTenant` and `Routes.Invitations.ForTenant` already declare every constant Phase 1 maps.

- [ ] **Step 1 (RED): write the failing integration specs first.** Mirror the `UpdateTenantSettingsForTenant.Spec.cs` harness exactly (`ApiFixture` via `IClassFixture`, `TestAuthClient`, `PathUtils.Join(Routes.Tenant.Root, ...)`). Seed with EXISTING helpers only — no new seeding infrastructure:
	- Acme admin token + tenant id: copy the private `PrepareAcmeAdminAsync()` helper from `apps/api/Modules/Settings/Handlers/Tenant/UpdateTenantSettingsForTenant.Spec.cs:471-483` — signature `Task<(Guid TenantId, string Token, TenantRow Original)> PrepareAcmeAdminAsync()`, built on `_authClient.LoginAsync(TestConstants.AcmeAdminEmail, TestConstants.SeedPassword)` and `TenantTestHelper.GetTenantIdByNameAsync(_http, staffToken, SeedConstants.Tenants.AcmeName)`.
	- Extra members / other tenants: copy the private `SeedMemberAsync(Guid tenantId, AccountLevel level, bool isDeleted = false)` helper returning `Task<(Guid UserId, Guid UserAccountId)>` from `apps/api/Modules/Users/Services/TenantMembershipLockOrder.Spec.cs:1186-1225` (inserts a `User` + a live `UserAccount` row scoped to the given tenant).

Real-Postgres assertions:

```csharp
[Fact]
public async Task ItShouldListOnlyItsOwnTenantMembersWithCursorPagination() {
	var (acmeId, acmeAdminToken, original) =
		await PrepareAcmeAdminAsync();
	try {
		var (memberUserAccountId, _) = await SeedMemberAsync(
			acmeId,
			AccountLevel.User
		);
		// Resolve the second tenant exactly like TenantPermissionFilter.Spec.cs:184-197.
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var techStartId = await TenantTestHelper.GetTenantIdByNameAsync(
			_http,
			staffToken,
			SeedConstants.Tenants.TechStartName
		);
		var (outsiderUserId, _) = await SeedMemberAsync(
			techStartId,
			AccountLevel.User
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl()
		)
			.WithSessionToken(acmeAdminToken)
			.WithTenantId(acmeId);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var result = await response.Content
			.ReadFromJsonAsync<FindTenantUsersForTenantResult>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		// The caller's own account and the freshly seeded member are visible.
		result.Data.Should().Contain(d =>
			d.UserAccountId == memberUserAccountId);
		// No other tenant's member may leak into this roster: the outsider
		// lives in TechStart; its global User id must not appear here.
		result.Data.Should().NotContain(d => d.Id == outsiderUserId);
	} finally {
		await RestoreTenantAsync(acmeId, original);
	}
}

[Fact]
public async Task ItShouldReturnForbiddenForMemberWithoutMembersView() {
	var staffToken = await _authClient.LoginAsStaffAdminAsync();
	var acmeId = await TenantTestHelper.GetTenantIdByNameAsync(
		_http,
		staffToken,
		SeedConstants.Tenants.AcmeName
	);

	// Acme's seeded non-admin user has no profiles assigned by default,
	// so the admin bypass must not apply to it.
	var acmeUserToken = await _authClient.LoginAsync(
		TestConstants.AcmeUserEmail,
		TestConstants.SeedPassword
	);

	using var request = new HttpRequestMessage(
		HttpMethod.Get,
		GetUrl()
	)
		.WithSessionToken(acmeUserToken)
		.WithTenantId(acmeId);

	using var response = await _http.SendAsync(request);

	response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	var problem = await response.Content
		.ReadFromJsonAsync<AppProblemDetails>();
	problem.Should().NotBeNull();
	Assert.NotNull(problem);
	problem.TranslationKey.Should()
		.Be("user-does-not-have-the-necessary-permissions");
}
```

(`FindTenantUsersForTenantResult : CursorPaginatedResult<TenantUserItem>` reusing the exact staff item shape listed above; `AppProblemDetails` comes from `PublyApp.Api.Lib.ProblemResults`, as imported by `TenantPermissionFilter.Spec.cs`. The `RestoreTenantAsync` call in `finally` mirrors the Acme harness because these specs mutate nothing but must not race the shared Acme row either.)

- [ ] **Step 1b (RED): pin the cross-tenant authorization property explicitly.** A valid session token for one tenant plus a forged `X-Tenant-Id` header for another must be rejected by `TenantAuthFilter`'s membership-first check (`apps/api/Lib/Filters/TenantAuthFilter.cs:84-106`: membership is verified before the tenant row is even loaded, non-members get the generic 403 `ResponseKeys.Forbidden`). This is the exact pattern proven by `ItShouldReturn403ForNonMember` in `apps/api/Lib/Filters/TenantAuthFilter.Spec.cs:147-186` (TechStart admin token + Acme tenant id → 403):

```csharp
[Fact]
public async Task ItShouldForbidCrossTenantListingWhenTenantHeaderIsForged() {
	var acmeAdminToken = await _authClient.LoginAsync(
		TestConstants.AcmeAdminEmail,
		TestConstants.SeedPassword
	);
	var staffToken = await _authClient.LoginAsStaffAdminAsync();
	var globalSolutionsId =
		await TenantTestHelper.GetTenantIdByNameAsync(
			_http,
			staffToken,
			SeedConstants.Tenants.GlobalName
		);

	// Acme admin's VALID session token, Global Solutions' tenant id in
	// X-Tenant-Id: the header is the only tenant authority, so the
	// membership-first check must 403 before any roster query runs.
	using var request = new HttpRequestMessage(
		HttpMethod.Get,
		GetUrl()
	)
		.WithSessionToken(acmeAdminToken)
		.WithTenantId(globalSolutionsId);

	using var response = await _http.SendAsync(request);

	response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	var problem = await response.Content
		.ReadFromJsonAsync<AppProblemDetails>();
	problem.Should().NotBeNull();
	Assert.NotNull(problem);
	// Generic forbidden: never reveal whether the forged tenant exists (D9).
	problem.TranslationKey.Should().Be("forbidden");
}
```

Run: `cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~ForTenant.Spec" -v normal`
Expected: FAIL — the routes do not exist (404 ≠ OK). RED.

- [ ] **Step 2 (GREEN):** no route-constant changes needed (all Phase 1 constants exist); add the handlers (thin orchestration over `ITenantUserQueryService.FindTenantUsersAsync(Guid tenantId, FindTenantUsersAsStaffArgs args, CancellationToken)` / `IInvitationQueryService.FindTenantInvitationsAsync(Guid tenantId, FindTenantInvitationsArgs args, CancellationToken)`), validators, endpoint groups, Program wiring. Re-run → green. Add the 400 cases (malformed cursor, bad `status` token) and the anonymous-401 case. The pending-invitations default (`status` omitted → only effective-pending rows returned; an accepted seed row stays invisible) gets its own spec `ItShouldDefaultToPendingInvitationsWhenStatusIsOmitted`, seeding rows directly through `AppDbContext` exactly like `apps/api/Modules/Invitations/Handlers/Staff/FindInvitationsForTenantAsStaff.Spec.cs:1883-1895` does:

```csharp
// Spec-local seeder wrapping the cited pattern; Invitation lives in
// PublyApp.Api.Modules.Invitations.Entities.
private async Task SeedTenantInvitationAsync(
	Guid tenantId,
	Guid invitedByUserId,
	string email,
	InvitationStatus status
) {
	await using var scope = _fixture.Factory.Services.CreateAsyncScope();
	var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
	_ = await dbContext.Invitation.AddAsync(new Invitation {
		Email = email,
		Scope = InvitationScope.Tenant,
		TenantId = tenantId,
		Token = Guid.NewGuid().ToString("N")[..32],
		AccountLevel = AccountLevel.User,
		ExpiresAt = DateTime.UtcNow.AddDays(7),
		InvitedByUserId = invitedByUserId,
		Status = status,
	});
	_ = await dbContext.SaveChangesAsync();
}

[Fact]
public async Task ItShouldDefaultToPendingInvitationsWhenStatusIsOmitted() {
	var (acmeId, acmeAdminToken, original) =
		await PrepareAcmeAdminAsync();
	try {
		// InvitedByUserId: resolve any seeded Acme user id via AppDbContext
		// before seeding; the filter under test is Status, not the inviter.
		var invitedByUserId = await GetAnyAcmeUserIdAsync();
		await SeedTenantInvitationAsync(
			acmeId,
			invitedByUserId,
			"pending@acme.example.com",
			InvitationStatus.Pending
		);
		await SeedTenantInvitationAsync(
			acmeId,
			invitedByUserId,
			"accepted@acme.example.com",
			InvitationStatus.Accepted
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetInvitationsUrl()
		)
			.WithSessionToken(acmeAdminToken)
			.WithTenantId(acmeId); // no status param

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var result = await response.Content
			.ReadFromJsonAsync<FindTenantInvitationsForTenantResult>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.Data.Should().Contain(d =>
			d.Email == "pending@acme.example.com");
		result.Data.Should().NotContain(d =>
			d.Email == "accepted@acme.example.com");
	} finally {
		await RestoreTenantAsync(acmeId, original);
	}
}
```

- [ ] **Step 3:** `just build-api && just generate-client && pnpm --filter front typecheck`. Commit the regenerated client. Verify second regen is zero diff. Commit: `feat(tenant): self-service members + invitations read API (part of #366)`.

## Task 2 (Phase 1): real Settings > Members page

**Files:** modify `members.tsx`, `members.test.tsx`, add `lib/query/tenant-members.ts/.test.ts`, i18n `{en,fr}/settings.json`.

- [ ] **Step 1 (RED):** rewrite `members.test.tsx` to require the data-driven UI. Follow the sibling harness in `general.test.tsx` — there is NO shared `QueryStub` wrapper in `apps/front/src`; each test file renders inside its own `<QueryClientProvider client={queryClient}>`, mocks the query module at the hook boundary with `vi.mock('~/lib/query/tenant-members')` + `vi.hoisted`, mocks `@tanstack/react-router`'s `createFileRoute`, imports `{ Route }` after the `vi.mock` calls, resolves the component via `Route.options.component as ComponentType`, and uses an `async` test callback with `await screen.findByText(...)` when content loads asynchronously:

```tsx
const mocks = vi.hoisted(() => ({
	membersQuery: {
		data: undefined as unknown,
		isPending: false,
		isError: false,
		isSuccess: false,
		refetch: vi.fn(),
	},
	pendingInvitationsQuery: {
		data: undefined as unknown,
		isPending: false,
		isError: false,
		isSuccess: false,
		refetch: vi.fn(),
	},
	workspaceTenantId: 'tenant-1',
}));

vi.mock('~/lib/query/tenants-for-picker', async () => ({
	...(await vi.importActual<typeof import('~/lib/query/tenants-for-picker')>(
		'~/lib/query/tenants-for-picker',
	)),
	useResolvedWorkspaceTenantId: () => mocks.workspaceTenantId,
}));
vi.mock('~/lib/query/tenant-members', async () => ({
	...(await vi.importActual<typeof import('~/lib/query/tenant-members')>(
		'~/lib/query/tenant-members',
	)),
	useTenantMembersQuery: () => mocks.membersQuery,
	useTenantPendingInvitationsQuery: () => mocks.pendingInvitationsQuery,
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { Route } from './members';

const TenantSettingsMembersPage = Route.options.component as ComponentType;

const renderPage = () => {
	const queryClient = new QueryClient();
	return render(
		<QueryClientProvider client={queryClient}>
			<TenantSettingsMembersPage />
		</QueryClientProvider>,
	);
};

test('renders real member rows from the query', async () => {
	mocks.membersQuery = {
		data: {
			data: [
				{ id: 'ua-1', email: 'member@acme.example.com', firstName: 'M.', lastName: 'Member', avatarUrl: null, level: 'User', status: 'Active' },
			],
			nextCursor: null,
		},
		isPending: false,
		isError: false,
		isSuccess: true,
		refetch: vi.fn(),
	};
	renderPage();

	expect(await screen.findByText('member@acme.example.com')).toBeTruthy();
	expect(screen.queryByTestId('tenant-settings-team-members-empty')).toBeNull();
});
```

Run: `pnpm --filter front exec vitest run src/routes/authed/tenant/settings/members.test.tsx` → FAIL (page still renders coming-later states). RED.

- [ ] **Step 2 (GREEN):** implement `tenant-members.ts` hooks + rewrite the page (tables, badges, honest empties, error slot with retry, logout only on 401). Component tests green; `pnpm --filter front typecheck`; `just check-write`; `npx -y react-doctor@latest . --verbose --diff`.
- [ ] **Step 3:** i18n keys EN/FR in `settings.json`; the `<Trans>` render guard and `i18n-key-coverage.test.ts` must pass. Commit: `feat(front): real tenant members page from self-service API (part of #366)`.

## Task 3 (Phase 1): e2e proof

- [ ] `apps/front/e2e/tenant-settings-members.spec.ts` tagged `['@tenant-workspace', '@366']`; asserts real rows visible, Roles tab still gated. Push; CI front-e2e green is the evidence (do NOT run the local e2e stack).

## Task 4 (Phase 2): profiles read API + real Roles page

Same TDD loop as Tasks 1–2 with `profiles.view` gating, `FindTenantProfilesForTenant`, `tenant-profiles.ts` hooks, `roles.tsx` real list (read-only matrix kept), i18n, component tests, commit `feat(tenant): self-service profiles read API + real roles page (part of #366)`.

## Task 5 (Phase 3): member lifecycle mutations + audit

- [ ] **Step 1 (RED):** failing registry assertion in `AuditActionsRegistry.Spec.cs` (`member.invited`, `member.level_updated`, `member.suspended`, `member.reactivated`, `member.removed`) + failing service specs for the three guards:

```csharp
// Helpers live in this spec file: CreateTenantAsync / SeedMemberAsync are
// copied per Task 1 Step 1 (mirroring TenantMembershipLockOrder.Spec.cs).
// ITenantMemberLifecycleService, RemoveTenantMemberArgs and
// TenantMemberOperationResult are the NEW symbols this RED step defines —
// until they exist the spec does not compile, which is the RED state.
[Fact]
public async Task ItShouldRefuseRemovingYourOwnAccount() {
	var tenantId = await CreateTenantAsync();
	var (actorUserId, actorAccountId) = await SeedMemberAsync(
		tenantId,
		AccountLevel.Admin
	);

	await using var scope = _fixture.Factory.Services.CreateAsyncScope();
	var service = scope.ServiceProvider
		.GetRequiredService<ITenantMemberLifecycleService>();
	var args = new RemoveTenantMemberArgs(
		TenantId: tenantId,
		TargetUserAccountId: actorAccountId,
		ActorUserId: actorUserId
	);

	var result = await service.RemoveMemberAsync(args);

	result.Should().BeOfType<TenantMemberOperationResult.SelfRemovalForbidden>();
}
```

- [ ] **Step 2 (GREEN):** constants, `TenantMemberLifecycleService` (guards: self-action, last-active-admin, wrong-tenant target → typed results), five handlers with permission gates + audit rows + typed problems (`already-a-member` 409, `last-admin` 409, `cannot-remove-yourself` 409), response-message keys en/fr, `just generate-response-keys`.
- [ ] **Step 3:** front actions (gated menus, confirm dialogs, `getFailureMessage` toasts), component tests, e2e invite flow, full suites. Commits per layer.

## Task 6 (every phase): verification gate before PR

Under `heavy.sh`: targeted files first, then once at the end the full `just test-api` (quote totals) and `pnpm --filter front test` full + typecheck + `pnpm lint` + design-system/knip/zindex guards + react-doctor recipe. Then `just ci`. Paired RED evidence into `.dump/proof-red.md`; one adversarial mutation named in the PR body (e.g. drop the `.WithTenantPermission` gate from one new GET → its 403 spec must go red).

## Out-of-scope / follow-ups (file as `follow-up lv2` during implementation)

- Danger-zone product decision (workspace delete/transfer semantics) — its own record before any code.
- Bulk member actions on the tenant side (waits for the read surfaces to exist).
- Per-member profile assignment from the tenant side (needs `profiles.assign_members` UX decisions).
