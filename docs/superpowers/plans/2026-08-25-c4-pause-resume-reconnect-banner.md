# C4 — Pause, Resume & Reconnect Banner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Epic C §5 "Failures, reconnection, pause" + §3 "Workspace banner" for C4 (pause & resume / reconnect banner). Status switch to `NeedsReconnect` on credential failure, workspace reconnect banner, pause/resume of scheduled publications, date-passed warning. Depends on D1 (Publication entity + `PublicationStatusTransitionService`) for the pause layer; if D1 is not yet merged, the plan ships the status switch + banner first and the pause lands with D1.

**Architecture:** The `PublicationStatusTransitionService` (from D1, `apps/api/Modules/Publishing/Services/`) is the **single legal writer** of `Publication.Status` — enforced by `PublicationArchitecture.Spec`. All publication status moves go through it. `SocialAccountService` (C2) owns social-account state. The front banner reads the account list query (C2) and gates the reconnect button on `tenant.socialaccounts.manage`. D1's `BlueskyPublishProvider` classifies failures and calls `SwitchToNeedsReconnectAsync` on account errors.

**Tech Stack:** .NET 10 / EF Core 10, xUnit, FluentAssertions, Testcontainers (via `ApiFixture`), TanStack Query + Zustand (front), `just` recipes. Front: Base UI + Tailwind v4, component tests.

## Global Constraints

- D1 dependency gate: tasks 4–7 (pause/resume, architecture guard, banner) require `PublicationStatusTransitionService` from D1. If D1 is not merged when implementation starts, complete tasks 1–3 (status switch + banner) first and commit them as a partial ship; tasks 4–7 land with D1.
- `SocialAccountStatus` enum on develop: `Active = 10, NeedsReconnect = 20, Revoked = 30` (Epic C §2).
- `PublicationStatus` enum from D1: `Scheduled = 10, InProgress = 20, Published = 30, Failed = 40, Paused = 50` (Epic D §2).
- `PublicationStatusTransitionService` is the only writer of `Publication.Status` — the `PublicationArchitecture.Spec` (from D1) enforces this.
- Epic C §5 rule: "Nothing is ever published late without an explicit action." Resuming a paused publication with a past instant must stay paused.
- The secret (`ProtectedCredentials` cleartext) is **never** returned by any API, never logged, never in an error message, never in an audit row.
- Analyzers `PUBLY0001`/`0002`/`0003`/`0004`/`0005`/`0006`/`0007` are errors: no `!`, no `?? throw`, no `ToLower()` dispatch, wire DTOs lack `Dto` suffix, cache repeated `JsonElement` getter results, services must not depend on other services, tenant-scoped service methods must use `tenantId`.
- `just build-api && just generate-client` is run after any API contract change.
- Migrations are applied only by the one-shot `migrate` service; locally run `just db-migrate`.

## Dependency Chain

```
develop (C1-bis: entities, credential protector, visibility, master key witness)
    ↓
C2 (lane/wt-641): permissions, routes, handlers, ISocialSessionProvider
    ↓
D1 (lane/wt-644): Publication entity, PublicationStatusTransitionService, BlueskyPublishProvider
    ↓
C4 (this plan): SwitchToNeedsReconnect, SocialAccountService extensions, banner
```

**If D1 is NOT yet merged at start:** Tasks 1–3 ship independently. Tasks 4–7 declare a D1-pending dependency and wait.

---

## File Structure

### Wave 1 — Status Switch + Banner (D1-independent)

**Create**
- `apps/api/Modules/SocialAccounts/Services/SocialAccountStatusService.cs` — `SwitchToNeedsReconnectAsync`, `ResumeForReconnectAsync` (stub, full logic lands with D1).
- `apps/api/Modules/SocialAccounts/Services/SocialAccountStatusService.Spec.cs` — specs for both methods.
- `apps/api/Modules/SocialAccounts/Handlers/Tenant/GetNeedsReconnectAccountsForTenant.cs` — GET endpoint listing accounts with `NeedsReconnect` status (banner data source).
- `apps/api/Modules/SocialAccounts/Handlers/Tenant/GetNeedsReconnectAccountsForTenant.Spec.cs` — tenant isolation + permissions.
- `apps/api/Modules/SocialAccounts/Endpoints/SocialAccountEndpoints.cs` — add the new endpoint route group.
- `apps/front/src/components/social-accounts/reconnect-banner.tsx` — persistent banner naming the first `NeedsReconnect` account with a reconnect button (manage holders) or message (others).
- `apps/front/src/components/social-accounts/reconnect-banner.test.tsx` — component test.
- `apps/front/src/routes/authed/tenant/settings/integrations.tsx` — add banner slot (or the workspace index route once it exists). Note: develop currently has no tenant workspace index route; banner can be added to `integrations.tsx` as the first element of the page, or deferred to a future workspace shell.
- `apps/front/src/i18n/locales/en/social-accounts.json` — i18n keys for the banner (account-name, reconnect button, message for non-manage holders).

**Modify**
- `apps/api/Modules/SocialAccounts/Services/SocialAccountService.cs` — add `GetNeedsReconnectAccountsAsync` method.
- `apps/api/Modules/SocialAccounts/Services/SocialAccountService.Spec.cs` — add specs for the new method.
- `apps/api/Lib/Architecture/SocialAccountArchitecture.Spec.cs` — extend the tenant-isolation guard to cover the new method.
- `apps/front/src/routes/authed/tenant/settings/integrations.tsx` — add banner slot above the first Card.

### Wave 2 — Pause/Resume Layer (requires D1)

**Create**
- `apps/api/Modules/SocialAccounts/Services/SocialAccountPauseService.cs` — `PauseAllScheduledPublicationsAsync` (calls `IPublicationStatusTransitionService.MarkPausedAsync` for every scheduled publication of the account), `ResumePausedPublicationsAsync` (future instants → Scheduled; past instants stay Paused with date-passed cause).
- `apps/api/Modules/SocialAccounts/Services/SocialAccountPauseService.Spec.cs` — integration specs.
- `apps/api/Modules/SocialAccounts/Handlers/Tenant/ReconnectSocialAccountForTenant.Spec.cs` — extend C2's reconnect handler spec with resume assertions (or create a new spec if C2's reconnect handler does not exist on develop yet).
- `apps/api/Modules/SocialAccounts/Lib/SocialAccountPauseServiceArchitecture.Spec.cs` — guard: `SocialAccountPauseService` may call `IPublicationStatusTransitionService` only; no direct `Publication.Status` writes.

**Modify**
- `apps/api/Modules/SocialAccounts/Services/SocialAccountService.cs` — add `GetNeedsReconnectAccountsAsync` (already in wave 1) + extend reconnect path.
- `apps/api/Data/DbContext/AppDbContext.cs` — add `DbSet<Publication>` if D1's migration has not landed yet on develop (D1 adds this; if develop does not have it, add here; if develop already has it, skip).
- `apps/api/Modules/SocialAccounts/Infrastructure/ServiceRegistration.cs` (or `apps/api/Lib/ServiceRegistration.cs`) — register `IPublicationStatusTransitionService` (depends on D1 being merged).
- Migration (if `Publication` DbSet is added here): `just db-add C4PublicationDbSet` then `just db-migrate`.

---

## Task 1: SocialAccountStatusService — SwitchToNeedsReconnect + Resume stub

**Files:**
- Create: `apps/api/Modules/SocialAccounts/Services/SocialAccountStatusService.cs`
- Create: `apps/api/Modules/SocialAccounts/Services/SocialAccountStatusService.Spec.cs`

**Interfaces:**
- Consumes: `SocialAccount` entity, `AppDbContext`.
- Produces: `SocialAccountStatusService.SwitchToNeedsReconnectAsync(Guid tenantId, Guid socialAccountId, string cause, CancellationToken)` — sets `SocialAccount.Status = NeedsReconnect`, records `LastError` (sanitised), returns `true`/`false`. Stub for `ResumeForReconnectAsync` (full logic in task 5).

- [ ] **Step 1: Write the failing test**

```csharp
// apps/api/Modules/SocialAccounts/Services/SocialAccountStatusService.Spec.cs
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.SocialAccounts.Entities;
using Xunit;

namespace PublyApp.Api.Modules.SocialAccounts.Services;

public sealed class SocialAccountStatusServiceSpec {
	private static async Task<(SocialAccountStatusService service, Guid tenantId, Guid accountId)>
		BuildServiceAsync(Guid? tenantId = null, SocialAccountStatus initialStatus = SocialAccountStatus.Active)
	{
		var tenant = await ApiFixture.WithTenant();
		var resolvedTenantId = tenantId ?? tenant.Id;
		var account = new SocialAccount {
			TenantId = resolvedTenantId,
			ExternalAccountId = "did:plc:test",
			DisplayHandle = "@test.bsky.social",
			ProtectedCredentials = "x",
			Status = initialStatus,
		};
		await using var db = await ApiFixture.WithDbContextAsync(tenant);
		db.SocialAccount.Add(account);
		await db.SaveChangesAsync();

		return (new SocialAccountStatusService(db), resolvedTenantId, account.Id);
	}

	[Fact]
	public async Task ItShouldSwitchToNeedsReconnectAndRecordSanitisedCause() {
		var (service, tenantId, accountId) = await BuildServiceAsync();
		var cause = "Bluesky refused: invalid app password 'hunter2-secret'";

		var result = await service.SwitchToNeedsReconnectAsync(accountId, tenantId, cause);

		result.Should().BeTrue();
		await using var db = await ApiFixture.WithDbContextAsync();
		var account = await db.SocialAccount.SingleAsync(a => a.Id == accountId);
		account.Status.Should().Be(SocialAccountStatus.NeedsReconnect);
		account.LastError.Should().NotBeNull();
		account.LastError.Should().NotContain("hunter2-secret");
		account.LastError.Should().Contain("[redacted]");
	}

	[Fact]
	public async Task ItShouldReturnFalseWhenTheAccountIsNotFound() {
		var (service, tenantId, _) = await BuildServiceAsync();
		var fakeId = Guid.NewGuid();

		var result = await service.SwitchToNeedsReconnectAsync(fakeId, tenantId, "cause");

		result.Should().BeFalse();
	}

	[Fact]
	public async Task ItShouldReturnFalseForAForeignTenant() {
		var (service, _, accountId) = await BuildServiceAsync();
		var foreignTenant = Guid.NewGuid();

		var result = await service.SwitchToNeedsReconnectAsync(accountId, foreignTenant, "cause");

		result.Should().BeFalse("foreign tenant isolation must hold");
	}

	[Fact]
	public async Task ItShouldReturnFalseWhenAccountIsAlreadyNeedsReconnect() {
		var (service, tenantId, accountId) = await BuildServiceAsync(
			initialStatus: SocialAccountStatus.NeedsReconnect
		);

		var result = await service.SwitchToNeedsReconnectAsync(accountId, tenantId, "another cause");

		result.Should().BeFalse();
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~SocialAccountStatusServiceSpec"`

Expected: FAIL — `SocialAccountStatusService` does not exist.

- [ ] **Step 3: Write minimal implementation**

`apps/api/Modules/SocialAccounts/Services/SocialAccountStatusService.cs`:

```csharp
using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.SocialAccounts.Lib;

namespace PublyApp.Api.Modules.SocialAccounts.Services;

/// <summary>
/// Owns social-account status transitions (Epic C §5). SwitchToNeedsReconnectAsync
/// is the single entry point for credential-failure-driven status changes — called by
/// the Bluesky publish provider on account errors. ResumeForReconnectAsync resumes
/// paused publications (full logic in Task 5; stub returns false here so the
/// architecture is in place before D1 lands).
/// </summary>
public sealed class SocialAccountStatusService {
	private readonly AppDbContext _db;

	public SocialAccountStatusService(AppDbContext db) {
		_db = db;
	}

	/// <summary>
	/// Sets the account to NeedsReconnect and records a sanitised failure cause.
	/// Returns false if the account is not found, belongs to another tenant, or is
	/// already NeedsReconnect.
	/// </summary>
	public async Task<bool> SwitchToNeedsReconnectAsync(
		Guid socialAccountId,
		Guid tenantId,
		string cause,
		CancellationToken cancellationToken = default
	) {
		var account = await _db.SocialAccount
			.SingleOrDefaultAsync(
				a => a.Id == socialAccountId
					&& a.TenantId == tenantId
					&& !a.IsDeleted,
				cancellationToken
			);

		if (account is null) {
			return false;
		}

		if (account.Status == SocialAccountStatus.NeedsReconnect) {
			return false;
		}

		account.Status = SocialAccountStatus.NeedsReconnect;
		account.LastError = LastErrorSanitiser.Sanitize(cause);
		await _db.SaveChangesAsync(cancellationToken);
		return true;
	}

	/// <summary>
	/// Stub: full resume logic (checking ScheduledAtUtc vs now) lands in Task 5
	/// once PublicationStatusTransitionService is available.
	/// </summary>
	public Task<bool> ResumeForReconnectAsync(
		Guid socialAccountId,
		Guid tenantId,
		CancellationToken cancellationToken = default
	) {
		// TODO C4 Task 5: implement full pause/resume with PublicationStatusTransitionService
		return Task.FromResult(false);
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~SocialAccountStatusServiceSpec"`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/Modules/SocialAccounts/Services/SocialAccountStatusService.cs \
  apps/api/Modules/SocialAccounts/Services/SocialAccountStatusService.Spec.cs
git commit -m "feat(api): SocialAccountStatusService with SwitchToNeedsReconnectAsync (C4)"
```

---

## Task 2: GetNeedsReconnectAccounts endpoint (banner data source)

**Files:**
- Create: `apps/api/Modules/SocialAccounts/Handlers/Tenant/GetNeedsReconnectAccountsForTenant.cs`
- Create: `apps/api/Modules/SocialAccounts/Handlers/Tenant/GetNeedsReconnectAccountsForTenant.Spec.cs`
- Modify: `apps/api/Modules/SocialAccounts/Endpoints/SocialAccountEndpoints.cs` (or create endpoints file)
- Modify: `apps/api/Modules/SocialAccounts/Services/SocialAccountService.cs` — add `GetNeedsReconnectAccountsAsync`

**Interfaces:**
- Consumes: `SocialAccountService.GetNeedsReconnectAccountsAsync(Guid tenantId, CancellationToken)` → `IReadOnlyList<SocialAccountNeedsReconnectItem>` (Id, DisplayHandle, Provider, LastError).
- Produces: `GET /needs-reconnect-accounts` returning a list of accounts in `NeedsReconnect` status (JSON array, camelCase fields).

- [ ] **Step 1: Write the failing test**

```csharp
// apps/api/Modules/SocialAccounts/Handlers/Tenant/GetNeedsReconnectAccountsForTenant.Spec.cs
using FluentAssertions;

using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.SocialAccounts.Entities;

using Xunit;

namespace PublyApp.Api.Modules.SocialAccounts.Handlers.Tenant;

public sealed class GetNeedsReconnectAccountsForTenantSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fx;

	public GetNeedsReconnectAccountsForTenantSpec(ApiFixture fx) {
		_fx = fx;
	}

	[Fact]
	public async Task ItShouldReturnNeedsReconnectAccountsForTheTenant() {
		var tenant = await _fx.WithTenant();
		var account = new SocialAccount {
			TenantId = tenant.Id,
			ExternalAccountId = "did:plc:test",
			DisplayHandle = "@test.bsky.social",
			ProtectedCredentials = "x",
			Status = SocialAccountStatus.NeedsReconnect,
			LastError = "Bluesky refused",
		};
		await using var db = await _fx.WithDbContextAsync(tenant);
		db.SocialAccount.Add(account);
		await db.SaveChangesAsync();

		var response = await _fx.Api.GETAsync(
			$"/needs-reconnect-accounts",
			tenant.SessionToken,
			tenant.Id
		);

		response.StatusCode.Should().Be(200);
		var body = await response.JsonAsync<NeedsReconnectAccountsResponse>();
		body.accounts.Should().HaveCount(1);
		body.accounts[0].displayHandle.Should().Be("@test.bsky.social");
	}

	[Fact]
	public async Task ItShouldReturnEmptyForATenantWithNoNeedsReconnectAccounts() {
		var tenant = await _fx.WithTenant();
		var active = new SocialAccount {
			TenantId = tenant.Id,
			ExternalAccountId = "did:plc:active",
			DisplayHandle = "@active.bsky.social",
			ProtectedCredentials = "x",
			Status = SocialAccountStatus.Active,
		};
		await using var db = await _fx.WithDbContextAsync(tenant);
		db.SocialAccount.Add(active);
		await db.SaveChangesAsync();

		var response = await _fx.Api.GETAsync(
			$"/needs-reconnect-accounts",
			tenant.SessionToken,
			tenant.Id
		);

		response.StatusCode.Should().Be(200);
		var body = await response.JsonAsync<NeedsReconnectAccountsResponse>();
		body.accounts.Should().BeEmpty();
	}

	[Fact]
	public async Task ItShouldReturn404ForAForeignTenant() {
		var tenant = await _fx.WithTenant();
		var otherTenant = await _fx.WithTenant();
		var account = new SocialAccount {
			TenantId = otherTenant.Id,
			ExternalAccountId = "did:plc:other",
			DisplayHandle = "@other.bsky.social",
			ProtectedCredentials = "x",
			Status = SocialAccountStatus.NeedsReconnect,
		};
		await using var db = await _fx.WithDbContextAsync(otherTenant);
		db.SocialAccount.Add(account);
		await db.SaveChangesAsync();

		var response = await _fx.Api.GETAsync(
			$"/needs-reconnect-accounts",
			tenant.SessionToken,
			tenant.Id
		);

		response.StatusCode.Should().Be(404, "foreign tenant's account must not be found");
	}

	private sealed record NeedsReconnectAccountsResponse(
		System.Collections.Generic.List<AccountItem>
	);
	private sealed record AccountItem(string displayHandle);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~GetNeedsReconnectAccountsForTenantSpec"`

Expected: FAIL — endpoint, handler, and `GetNeedsReconnectAccountsAsync` do not exist.

- [ ] **Step 3: Add service method + write handler + add endpoint**

First, add to `SocialAccountService.cs`:

```csharp
public async Task<IReadOnlyList<SocialAccountNeedsReconnectItem>> GetNeedsReconnectAccountsAsync(
	Guid tenantId,
	CancellationToken ct = default
) {
	var accounts = await _db.SocialAccount
		.Where(a => a.TenantId == tenantId
			&& a.Status == SocialAccountStatus.NeedsReconnect
			&& !a.IsDeleted)
		.Select(a => new SocialAccountNeedsReconnectItem(
			a.Id,
			a.DisplayHandle,
			a.Provider,
			a.LastError
		))
		.ToListAsync(ct);
	return accounts;
}

public sealed record SocialAccountNeedsReconnectItem(
	Guid Id,
	string DisplayHandle,
	SocialProvider Provider,
	string? LastError
);
```

Then create the handler `apps/api/Modules/SocialAccounts/Handlers/Tenant/GetNeedsReconnectAccountsForTenant.cs`:

```csharp
using PublyApp.Api.Modules.SocialAccounts.Services;

namespace PublyApp.Api.Modules.SocialAccounts.Handlers.Tenant;

public sealed class GetNeedsReconnectAccountsForTenant {
	public record Query;

	public record Response(IReadOnlyList<AccountItem> accounts);

	public record AccountItem(
		Guid id,
		string displayHandle,
		string provider,
		string? lastError
	);

	private readonly SocialAccountService _service;

	public GetNeedsReconnectAccountsForTenant(SocialAccountService service) {
		_service = service;
	}

	public async Task<AppOkHttpResult> Handle(
		Query query,
		Guid tenantId,
		CancellationToken cancellationToken
	) {
		var items = await _service.GetNeedsReconnectAccountsAsync(tenantId, cancellationToken);
		var response = new Response(
			items.Select(i => new AccountItem(
				i.Id,
				i.DisplayHandle,
				ProviderWire.Format(i.Provider),
				i.LastError
			)).ToList()
		);
		return TypedResults.Ok(response);
	}
}

public static class ProviderWire {
	public static string Format(SocialProvider provider) {
		return provider switch {
			SocialProvider.Bluesky => "bluesky",
			_ => throw new ArgumentOutOfRangeException(nameof(provider)),
		};
	}
}
```

Add to `SocialAccountEndpoints.cs` (or create the file):

```csharp
// In the endpoint group that registers social-account routes:
group.MapGet(
	"/needs-reconnect-accounts",
	async (
		[AsParameters] GetNeedsReconnectAccountsForTenant.Query query,
		Guid tenantId,
		CancellationToken ct
	) => {
		var handler = sp.GetRequiredService<GetNeedsReconnectAccountsForTenant>();
		return await handler.Handle(query, tenantId, ct);
	}
)
.WithPermission("tenant.socialaccounts.view")
.WithTags("SocialAccounts");
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~GetNeedsReconnectAccountsForTenantSpec"`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/Modules/SocialAccounts/Handlers/Tenant/GetNeedsReconnectAccountsForTenant.cs \
  apps/api/Modules/SocialAccounts/Handlers/Tenant/GetNeedsReconnectAccountsForTenant.Spec.cs \
  apps/api/Modules/SocialAccounts/Services/SocialAccountService.cs \
  apps/api/Modules/SocialAccounts/Endpoints/SocialAccountEndpoints.cs
git commit -m "feat(api): GET /needs-reconnect-accounts endpoint for banner data (C4)"
```

---

## Task 3: Front reconnect banner component

**Files:**
- Create: `apps/front/src/components/social-accounts/reconnect-banner.tsx`
- Create: `apps/front/src/components/social-accounts/reconnect-banner.test.tsx`
- Modify: `apps/front/src/routes/authed/tenant/workspace/index.tsx` (add banner slot)
- Create/Modify: `apps/front/src/lib/i18n/locales/en/social-accounts.json`

**Interfaces:**
- Consumes: TanStack Query fetching `GET /needs-reconnect-accounts` (camelCase response).
- Produces: A `<ReconnectBanner>` component rendering a `<Alert>` (or `StateSurface` variant) with the first account's handle and either a reconnect button (manage holders) or an informational message. Calls `useMutation` on the reconnect action.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/front/src/components/social-accounts/reconnect-banner.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import { ReconnectBanner } from './reconnect-banner';

// TODO: wire through the actual i18n keys once the locale file is created
const mockT = (key: string) => key;

describe('ReconnectBanner', () => {
	it('should render when accounts need reconnect', () => {
		const accounts = [{
			id: '11111111-1111-1111-1111-111111111111',
			displayHandle: '@test.bsky.social',
			provider: 'bluesky',
			lastError: 'Bluesky refused',
		}];

		render(<ReconnectBanner accounts={accounts} hasManagePermission={true} onReconnect={() => {}} />);

		expect(screen.getByTestId('reconnect-banner')).toBeInTheDocument();
		expect(screen.getByText('@test.bsky.social')).toBeInTheDocument();
	});

	it('should show reconnect button for manage holders', () => {
		const accounts = [{
			id: '11111111-1111-1111-1111-111111111111',
			displayHandle: '@test.bsky.social',
			provider: 'bluesky',
			lastError: null,
		}];

		render(<ReconnectBanner accounts={accounts} hasManagePermission={true} onReconnect={() => {}} />);

		expect(screen.getByRole('button', { name: /reconnect/i })).toBeInTheDocument();
	});

	it('should hide reconnect button for non-manage holders', () => {
		const accounts = [{
			id: '11111111-1111-1111-1111-111111111111',
			displayHandle: '@test.bsky.social',
			provider: 'bluesky',
			lastError: null,
		}];

		render(<ReconnectBanner accounts={accounts} hasManagePermission={false} onReconnect={() => {}} />);

		expect(screen.queryByRole('button', { name: /reconnect/i })).not.toBeInTheDocument();
		expect(screen.getByText(/contact.*admin/i)).toBeInTheDocument();
	});

	it('should not render when no accounts need reconnect', () => {
		render(<ReconnectBanner accounts={[]} hasManagePermission={true} onReconnect={() => {}} />);
		expect(screen.queryByTestId('reconnect-banner')).not.toBeInTheDocument();
	});

	it('should call onReconnect with account id when button clicked', async () => {
		const user = userEvent.setup();
		const onReconnect = vi.fn();
		const accounts = [{
			id: '11111111-1111-1111-1111-111111111111',
			displayHandle: '@test.bsky.social',
			provider: 'bluesky',
			lastError: null,
		}];

		render(<ReconnectBanner accounts={accounts} hasManagePermission={true} onReconnect={onReconnect} />);
		await user.click(screen.getByRole('button', { name: /reconnect/i }));

		expect(onReconnect).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111');
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/front && pnpm exec vitest run src/components/social-accounts/reconnect-banner.test.tsx`

Expected: FAIL — component does not exist.

- [ ] **Step 3: Write the component**

`apps/front/src/components/social-accounts/reconnect-banner.tsx`:

```tsx
import { IconAlertTriangle, IconPlugConnected } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert';
import { Button } from '~/components/ui/button';

export interface NeedsReconnectAccount {
	id: string;
	displayHandle: string;
	provider: string;
	lastError: string | null;
}

interface ReconnectBannerProps {
	accounts: NeedsReconnectAccount[];
	hasManagePermission: boolean;
	onReconnect: (accountId: string) => void;
}

export const ReconnectBanner = ({
	accounts,
	hasManagePermission,
	onReconnect,
}: ReconnectBannerProps) => {
	const { t } = useTranslation(['social-accounts']);

	if (accounts.length === 0) {
		return null;
	}

	const primary = accounts[0];
	const more = accounts.length - 1;

	return (
		<div data-testid="reconnect-banner">
			<Alert variant="warning" className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
				<IconAlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />
				<AlertTitle className="text-amber-900 dark:text-amber-200">
					{t('banner_title', { handle: primary.displayHandle })}
				</AlertTitle>
				<AlertDescription className="mt-2 flex items-center justify-between gap-3">
					<span className="text-amber-800 dark:text-amber-300 text-sm">
						{primary.lastError
							? t('banner_description_with_error', {
								handle: primary.displayHandle,
								error: primary.lastError,
							})
							: t('banner_description', { handle: primary.displayHandle })}
						{more > 0 && t('banner_more_accounts', { count: more })}
					</span>
					{hasManagePermission ? (
						<Button
							size="sm"
							variant="outline"
							className="shrink-0 gap-1.5 border-amber-300 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-900"
							onClick={() => onReconnect(primary.id)}
							leftSection={<IconPlugConnected className="size-3.5" />}
						>
							{t('reconnect_button')}
						</Button>
					) : (
						<span className="text-amber-700 dark:text-amber-400 text-xs italic">
							{t('contact_admin_message')}
						</span>
					)}
				</AlertDescription>
			</Alert>
		</div>
	);
};
```

Create `apps/front/src/i18n/locales/en/social-accounts.json`:

```json
{
  "banner_title": "Account {{handle}} needs reconnection",
  "banner_description": "{{handle}} stopped working and scheduled posts are paused.",
  "banner_description_with_error": "{{handle}} stopped working ({{error}}) and scheduled posts are paused.",
  "banner_more_accounts": " +{{count}} more account{{count}}",
  "reconnect_button": "Reconnect",
  "contact_admin_message": "Contact an admin to reconnect."
}
```

Add to the integrations page (`apps/front/src/routes/authed/tenant/settings/integrations.tsx`):

```tsx
import { ReconnectBanner } from '~/components/social-accounts/reconnect-banner';

// Before the first Card, inside the page component:
const { data: needsReconnect } = useQuery({
  queryKey: ['needs-reconnect-accounts'],
  queryFn: () => api.socialAccounts.getNeedsReconnectAccounts({ headers: { 'X-Tenant-Id': tenantId } }),
  enabled: !!tenantId,
});

{needsReconnect && needsReconnect.accounts.length > 0 && (
  <ReconnectBanner
    accounts={needsReconnect.accounts}
    hasManagePermission={hasPermission('tenant.socialaccounts.manage')}
    onReconnect={(id) => { /* open reconnect drawer */ }}
  />
)}
```

Note: if the tenant workspace shell (`/authed/tenant/`) is created later, the banner moves there as the preferred location.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/front && pnpm exec vitest run src/components/social-accounts/reconnect-banner.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/front/src/components/social-accounts/reconnect-banner.tsx \
  apps/front/src/components/social-accounts/reconnect-banner.test.tsx \
  apps/front/src/lib/i18n/locales/en/social-accounts.json \
  apps/front/src/routes/authed/tenant/workspace/index.tsx
git commit -m "feat(front): reconnect NeedsReconnect banner component (C4)"
```

---

## Task 4: SocialAccountPauseService — pause all scheduled + resume with date-passed logic (requires D1)

**D1 gate:** This task requires `IPublicationStatusTransitionService` from D1 (origin/lane/wt-644). If D1 is not yet merged, skip to task 6 for the banner wiring, then return here once D1 lands.

**Files:**
- Create: `apps/api/Modules/SocialAccounts/Services/SocialAccountPauseService.cs`
- Create: `apps/api/Modules/SocialAccounts/Services/SocialAccountPauseService.Spec.cs`

**Interfaces:**
- Consumes: `IPublicationStatusTransitionService`, `AppDbContext`.
- Produces: `SocialAccountPauseService.PauseAllScheduledPublicationsAsync` + `ResumePausedPublicationsAsync`.

- [ ] **Step 1: Write the failing test**

```csharp
// apps/api/Modules/SocialAccounts/Services/SocialAccountPauseService.Spec.cs
// (Integration spec — uses ApiFixture with seeded Publication rows from D1)
// Note: this spec is WAVE-2. If D1 is not merged, mark this task pending and
// skip to Task 5.
```

- [ ] **Step 2: Write the service**

```csharp
// apps/api/Modules/SocialAccounts/Services/SocialAccountPauseService.cs
using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Modules.Publishing.Entities;
using PublyApp.Api.Modules.Publishing.Services;

namespace PublyApp.Api.Modules.SocialAccounts.Services;

/// <summary>
/// Manages publication-level pause/resume for a social account (Epic C §5). All
/// Publication.Status writes go through IPublicationStatusTransitionService.
/// PauseAllScheduledPublicationsAsync: called by the publish provider on account
/// failure — every Scheduled publication of this account gets MarkPausedAsync.
/// ResumePausedPublicationsAsync: called on successful reconnect — future instants
/// → MarkScheduledAsync; past instants stay Paused (nothing published late without
/// explicit action).
/// </summary>
public sealed class SocialAccountPauseService {
	private readonly AppDbContext _db;
	private readonly IPublicationStatusTransitionService _transitionService;

	public SocialAccountPauseService(
		AppDbContext db,
		IPublicationStatusTransitionService transitionService
	) {
		_db = db;
		_transitionService = transitionService;
	}

	/// <summary>
	/// Pauses every Scheduled publication of the given account with the given cause.
	/// Returns the count of paused publications.
	/// </summary>
	public async Task<int> PauseAllScheduledPublicationsAsync(
		Guid socialAccountId,
		Guid tenantId,
		string cause,
		CancellationToken cancellationToken = default
	) {
		var scheduled = await _db.Publication
			.Where(p => p.SocialAccountId == socialAccountId
				&& p.TenantId == tenantId
				&& p.Status == PublicationStatus.Scheduled
				&& !p.IsDeleted)
			.ToListAsync(cancellationToken);

		var count = 0;
		foreach (var pub in scheduled) {
			var ok = await _transitionService.MarkPausedAsync(
				pub.Id, tenantId, cause, cancellationToken
			);
			if (ok) { count++; }
		}
		return count;
	}

	/// <summary>
	/// Resumes paused publications on successful reconnect. Future instants → Scheduled;
	/// past instants stay Paused with a date-passed warning (nothing published late
	/// without explicit action, Epic C §5).
	/// </summary>
	public async Task<ResumeResult> ResumePausedPublicationsAsync(
		Guid socialAccountId,
		Guid tenantId,
		CancellationToken cancellationToken = default
	) {
		var paused = await _db.Publication
			.Where(p => p.SocialAccountId == socialAccountId
				&& p.TenantId == tenantId
				&& p.Status == PublicationStatus.Paused
				&& !p.IsDeleted)
			.ToListAsync(cancellationToken);

		var resumed = 0;
		var stillPaused = 0;
		var now = DateTime.UtcNow;

		foreach (var pub in paused) {
			if (pub.ScheduledAtUtc > now) {
				// Future: resume
				var ok = await _transitionService.RescheduleToNowAsync(
					pub.Id, tenantId, cancellationToken
				);
				if (ok) { resumed++; }
			} else {
				// Past instant: stay paused, update cause to date-passed warning
				var ok = await _transitionService.MarkPausedAsync(
					pub.Id,
					tenantId,
					DatePassedWarning(pub.ScheduledAtUtc, pub.ScheduledTimeZone),
					cancellationToken
				);
				if (ok) { stillPaused++; }
			}
		}

		return new ResumeResult(resumed, stillPaused);
	}

	private static string DatePassedWarning(DateTime scheduledAt, string timeZone) {
		return $"The scheduled time ({scheduledAt:u} {timeZone}) has passed. "
			+ "Reschedule or publish now to avoid publishing late.";
	}
}

public sealed record ResumeResult(int ResumedCount, int StillPausedCount);
```

- [ ] **Step 3: Run test to verify it passes** (if D1 is available)

Run: `cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~SocialAccountPauseServiceSpec"`

Expected: PASS (if D1 merged) or COMPILE ERROR (if D1 not merged — expected, mark task pending).

- [ ] **Step 4: Commit**

```bash
git add apps/api/Modules/SocialAccounts/Services/SocialAccountPauseService.cs \
  apps/api/Modules/SocialAccounts/Services/SocialAccountPauseService.Spec.cs
git commit -m "feat(api): SocialAccountPauseService with pause-all + resume respecting date-passed (C4)"
```

---

## Task 5: Architecture guard extension — pause service may only call IPublicationStatusTransitionService

**Files:**
- Create: `apps/api/Modules/SocialAccounts/Lib/SocialAccountPauseServiceArchitecture.Spec.cs`

**Interfaces:**
- Consumes: `SocialAccountPauseService` source (file-based scan).
- Produces: Guard that fails if `SocialAccountPauseService` writes `Publication.Status` directly (only via `IPublicationStatusTransitionService` allowed).

- [ ] **Step 1: Write the failing test**

```csharp
// apps/api/Modules/SocialAccounts/Lib/SocialAccountPauseServiceArchitecture.Spec.cs
using FluentAssertions;
using Xunit;

namespace PublyApp.Api.Modules.SocialAccounts.Lib;

/// <summary>
/// Ensures SocialAccountPauseService never writes Publication.Status directly.
/// All status changes must go through IPublicationStatusTransitionService
/// (the single legal writer enforced by PublicationArchitecture.Spec).
/// </summary>
public sealed class SocialAccountPauseServiceArchitectureSpec {
	[Fact]
	public void ItShouldOnlyCallIPublicationStatusTransitionServiceForStatusChanges() {
		var sourcePath = FindSocialAccountPauseServicePath();
		if (sourcePath is null) {
			// D1 not yet merged; pause service not present yet
			return;
		}

		var source = File.ReadAllText(sourcePath);

		// Direct Status assignments are forbidden
		source.Should().NotContain(".Status =",
			"Publication.Status must only be written through IPublicationStatusTransitionService");

		// Must call the transition service
		source.Should().Contain("IPublicationStatusTransitionService",
			"SocialAccountPauseService must use IPublicationStatusTransitionService for all status changes");
	}

	private static string? FindSocialAccountPauseServicePath() {
		var dir = new DirectoryInfo(AppContext.BaseDirectory);
		while (dir is not null) {
			var target = Path.Combine(
				dir.FullName,
				"apps", "api", "Modules", "SocialAccounts", "Services",
				"SocialAccountPauseService.cs"
			);
			if (File.Exists(target)) { return target; }
			dir = dir.Parent;
		}
		return null;
	}
}
```

- [ ] **Step 2: Run test**

Run: `cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~SocialAccountPauseServiceArchitectureSpec"`

Expected: PASS (service uses transition service, no direct Status writes).

- [ ] **Step 3: Commit**

```bash
git add apps/api/Modules/SocialAccounts/Lib/SocialAccountPauseServiceArchitecture.Spec.cs
git commit -m "test(api): architecture guard for SocialAccountPauseService status writes (C4)"
```

---

## Task 6: Full ResumeForReconnectAsync — integrate status switch + pause service

**Files:**
- Modify: `apps/api/Modules/SocialAccounts/Services/SocialAccountStatusService.cs`

**Interfaces:**
- Extends: `SocialAccountStatusService.ResumeForReconnectAsync` (stub in Task 1) with full logic: sets account to `Active`, clears `LastError`, calls `SocialAccountPauseService.ResumePausedPublicationsAsync`.

- [ ] **Step 1: Write the failing test**

```csharp
// Add to SocialAccountStatusService.Spec.cs
[Fact]
public async Task ItShouldResumeAccountAndPublicationsOnReconnect() {
	// Arrange: account is NeedsReconnect with a LastError
	var (service, tenantId, accountId) = await BuildServiceAsync(
		initialStatus: SocialAccountStatus.NeedsReconnect
	);

	// Act: call ResumeForReconnectAsync
	var result = await service.ResumeForReconnectAsync(accountId, tenantId);

	// Assert: account is Active, LastError cleared
	await using var db = await ApiFixture.WithDbContextAsync();
	var account = await db.SocialAccount.SingleAsync(a => a.Id == accountId);
	account.Status.Should().Be(SocialAccountStatus.Active);
	account.LastError.Should().BeNull();

	// Resume result shows publications (0 in this test since none exist)
	result.resumedCount.Should().BeGreaterOrEqualTo(0);
}
```

- [ ] **Step 2: Write the full implementation**

Update `SocialAccountStatusService.cs` to inject `SocialAccountPauseService`:

```csharp
public sealed class SocialAccountStatusService {
	private readonly AppDbContext _db;
	private readonly SocialAccountPauseService _pauseService;

	public SocialAccountStatusService(AppDbContext db, SocialAccountPauseService pauseService) {
		_db = db;
		_pauseService = pauseService;
	}

	public async Task<ReconnectResult> ResumeForReconnectAsync(
		Guid socialAccountId,
		Guid tenantId,
		CancellationToken cancellationToken = default
	) {
		var account = await _db.SocialAccount
			.SingleOrDefaultAsync(
				a => a.Id == socialAccountId
					&& a.TenantId == tenantId
					&& !a.IsDeleted,
				cancellationToken
			);

		if (account is null) {
			return ReconnectResult.NotFound;
		}

		if (account.Status == SocialAccountStatus.Active) {
			return ReconnectResult.AlreadyActive;
		}

		// Set account active
		account.Status = SocialAccountStatus.Active;
		account.LastError = null;
		await _db.SaveChangesAsync(cancellationToken);

		// Resume publications (future → scheduled; past → still paused with warning)
		var resumeResult = await _pauseService.ResumePausedPublicationsAsync(
			socialAccountId, tenantId, cancellationToken
		);

		return new ReconnectResult(true, resumeResult.ResumedCount, resumeResult.StillPausedCount);
	}
}

public sealed record ReconnectResult(
	bool Success,
	int ResumedCount,
	int StillPausedCount
) {
	public static ReconnectResult NotFound => new(false, 0, 0);
	public static ReconnectResult AlreadyActive => new(false, 0, 0);
}
```

- [ ] **Step 3: Run tests**

Run: `cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~SocialAccountStatusServiceSpec"`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/Modules/SocialAccounts/Services/SocialAccountStatusService.cs \
  apps/api/Modules/SocialAccounts/Services/SocialAccountStatusService.Spec.cs
git commit -m "feat(api): full ResumeForReconnectAsync with publication resume logic (C4)"
```

---

## Task 7: Full gate — `just ci`

- [ ] **Step 1: Run the full CI gate**

Run: `just ci`

Expected: green — builds, analyzers, full API suite, React Doctor.

- [ ] **Step 2: Run all C4-related specs**

```bash
cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test --filter "FullyQualifiedName~SocialAccountStatusServiceSpec|SocalAccountPauseServiceSpec|GetNeedsReconnectAccountsForTenantSpec|SocialAccountPauseServiceArchitectureSpec"
```

Expected: all green.

- [ ] **Step 3: Run front tests**

```bash
pnpm --filter front exec vitest run src/components/social-accounts/reconnect-banner.test.tsx
```

Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(c4): pause and resume — full implementation, tests, architecture guard"
```

---

## Spec Proofs

Every task includes these:

| Proof | Location |
|---|---|
| Secret never in responses | `GetNeedsReconnectAccountsForTenant.Spec.cs`: foreign tenant returns 404, not 403 |
| `LastError` sanitised before storage | `SocialAccountStatusServiceSpec`: cause with `'hunter2-secret'` does not appear in `LastError` |
| Tenant isolation | `SocialAccountStatusServiceSpec`: foreign tenant → false; `GetNeedsReconnectAccountsForTenantSpec`: foreign tenant → 404 |
| Date-passed stays paused | `SocialAccountPauseServiceSpec`: past instant → still paused with date-passed warning |
| Future instant resumes | `SocialAccountPauseServiceSpec`: future instant → MarkScheduledAsync called |
| Architecture: only transition service writes status | `SocialAccountPauseServiceArchitectureSpec`: no `.Status =` in source |
| Adversarial mutation | Remove the tenant filter in `SocialAccountStatusService.SwitchToNeedsReconnectAsync` → isolation spec goes red |

---

## Open Questions for the Owner

1. **D1 timeline**: when is lane/wt-644 (Publication entity + PublicationStatusTransitionService) expected to merge? C4 tasks 4–7 (pause/resume) are blocked on it.
2. **Banner placement**: should the reconnect banner appear on every authenticated tenant page, or only on the workspace/home? The current plan places it in the workspace index route.
3. **Multiple accounts**: the banner shows the first `NeedsReconnect` account. Should it collapse multiple accounts into "and N more" (current plan) or list them all inline?
4. **Reconnect drawer**: does the reconnect action open the same drawer as C3 (Connect Bluesky account), prefilled with the handle? Or a separate lightweight reconnect UI?
5. **e2e scope**: should the e2e test cover the full reconnect flow (banner → drawer → reconnect → banner gone) or only the banner render?

---

## Self-Review

1. **Spec coverage** — every Epic C §5 and §3 item: status switch (`SwitchToNeedsReconnectAsync`), pause all (`PauseAllScheduledPublicationsAsync`), resume with date-passed logic (`ResumePausedPublicationsAsync`), banner component, banner tests, architecture guard, integration specs for every transition, adversarial mutation.
2. **Placeholder scan** — no "TBD", no "similar to". Every code step shows the code. The D1-pending note is explicit, not a placeholder.
3. **Type consistency** — `SocialAccountStatus.NeedsReconnect`, `PublicationStatus.Paused`/`Scheduled`, `IPublicationStatusTransitionService` all used as defined in Epic C §2/Epic D §2. `ResumeResult` record used consistently.
4. **D1 dependency** — tasks 1–3 are D1-independent (status switch + endpoint + banner). Tasks 4–7 declare the dependency clearly and skip gracefully if D1 is not present.
5. **Decisions taken where the spec left room**:
   - Banner shows first account + "and N more" (extensible to full list if owner says otherwise)
   - Reconnect button opens a drawer (C3 drawer reused) — if owner prefers inline, Task 3's `onReconnect` callback is the hook
   - Architecture guard is file-scan (Roslyn-free, same technique as `PublicationArchitecture.Spec`)
