# Remove Expired Session Record Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove an expired session row from the database when that expired token is presented to an authenticated API endpoint.

**Architecture:** Keep the behavior inside `SessionService`, because all authenticated endpoint filters already depend on it. Load a session by token without filtering by expiry first, hard-delete the row if it is expired, and still return `null` so `SessionAuthFilter` preserves the current `401 Unauthorized` response.

**Tech Stack:** .NET 10 minimal APIs, EF Core, PostgreSQL, xUnit integration tests, FluentAssertions.

---

## Scope

This plan implements GitHub issue #261. It does not add scheduled cleanup for expired sessions that are never presented again; that is tracked separately in issue #389 and should wait for background jobs infrastructure.

## File Structure

- Modify `apps/api/Src/Modules/Auth/Services/SessionService.cs`
  - Keep session lookup and expiry handling in the auth domain service.
  - Use `MainApiDbContext.ForceHardDelete()` for expired rows so the token is physically removed instead of soft-deleted.
  - Preserve `null` return semantics for invalid, expired, suspended, deleted, or unverified users.
- Create `apps/api/Src/Modules/Auth/Handlers/GetUserAuthData.Spec.cs`
  - Add endpoint-level integration coverage that proves an expired presented token receives `401` and is removed from `sessions`.
  - Use `Routes.Auth.GetUserAuthData` because it is a small authenticated endpoint behind `SessionAuthFilter`.

## Tasks

### Task 1: Add Failing Integration Test

**Files:**
- Create: `apps/api/Src/Modules/Auth/Handlers/GetUserAuthData.Spec.cs`

- [ ] **Step 1: Create the spec with an expired-session deletion test**

Add this file:

```csharp
namespace MainApi.Src.Modules.Auth.Handlers;

using System.Net;

using FluentAssertions;

using MainApi.Src.Data.DbContext;
using MainApi.Src.Lib.Routes;
using MainApi.Src.Lib.Testing.Fixtures;
using MainApi.Src.Lib.Testing.Helpers;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using Xunit;

public sealed class GetUserAuthDataSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public GetUserAuthDataSpec(
		ApiFixture fixture
	) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	[Fact]
	public async Task
	ItShouldRemoveExpiredSessionWhenExpiredTokenIsPresented() {
		var token = await _authClient.LoginAsync(
			TestConstants.StaffAdminEmail,
			TestConstants.SeedPassword
		);

		await ExpireSessionAsync(token);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			Routes.Auth.GetUserAuthData
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);

		var sessionCount = await CountSessionsByTokenAsync(token);
		sessionCount.Should().Be(0);
	}

	private async Task ExpireSessionAsync(
		string token
	) {
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<MainApiDbContext>();

		var updatedCount = await dbContext.Session
			.Where(s => s.Token == token)
			.ExecuteUpdateAsync(setters => setters
				.SetProperty(
					s => s.ExpiresAt,
					DateTime.UtcNow.AddMinutes(-1)
				)
				.SetProperty(s => s.UpdatedAt, DateTime.UtcNow));

		updatedCount.Should().Be(1);
	}

	private async Task<int> CountSessionsByTokenAsync(
		string token
	) {
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<MainApiDbContext>();

		return await dbContext.Session
			.CountAsync(s => s.Token == token);
	}
}
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```bash
cd apps/api
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~GetUserAuthDataSpec.ItShouldRemoveExpiredSessionWhenExpiredTokenIsPresented"
```

Expected: the test fails because the response is `401`, but `sessionCount` is still `1`.

- [ ] **Step 3: Commit the failing test**

Run:

```bash
git add apps/api/Src/Modules/Auth/Handlers/GetUserAuthData.Spec.cs
git commit -m "test: cover expired session removal"
```

### Task 2: Hard-Delete Expired Presented Sessions

**Files:**
- Modify: `apps/api/Src/Modules/Auth/Services/SessionService.cs`
- Test: `apps/api/Src/Modules/Auth/Handlers/GetUserAuthData.Spec.cs`

- [ ] **Step 1: Update `GetSessionByToken` to detect expired rows before returning `null`**

Replace the current `GetSessionByToken` method with:

```csharp
public async Task<SessionData?> GetSessionByToken(
	string token,
	CancellationToken cancellationToken = default
) {
	var query =
		from s in _dbContext.Session
		join u in _dbContext.User on s.UserId equals u.Id
		where s.Token == token && !s.IsDeleted
		select new { Session = s, User = u };

	var result = await query.FirstOrDefaultAsync(cancellationToken);

	if (result is null) {
		return null;
	}

	if (result.Session.ExpiresAt <= DateTime.UtcNow) {
		_dbContext.ForceHardDelete(result.Session);
		await _dbContext.SaveChangesAsync(cancellationToken);
		return null;
	}

	// Runtime filtering
	if (result.User.IsDeleted || result.User.IsSuspended() || !result.User.IsVerified) {
		return null;
	}

	return new SessionData {
		Session = result.Session,
		User = result.User,
	};
}
```

This keeps the token out of logs and returns `null`, allowing `SessionAuthFilter` to produce the existing `401`.

- [ ] **Step 2: Run the focused test to verify it passes**

Run:

```bash
cd apps/api
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~GetUserAuthDataSpec.ItShouldRemoveExpiredSessionWhenExpiredTokenIsPresented"
```

Expected: the test passes.

- [ ] **Step 3: Commit the implementation**

Run:

```bash
git add apps/api/Src/Modules/Auth/Services/SessionService.cs
git commit -m "fix: remove expired presented sessions"
```

### Task 3: Verify Auth Session Behavior

**Files:**
- Verify: `apps/api/Src/Modules/Auth/Services/SessionService.cs`
- Verify: `apps/api/Src/Modules/Auth/Handlers/GetUserAuthData.Spec.cs`

- [ ] **Step 1: Run nearby auth tests**

Run:

```bash
cd apps/api
dotnet test Tests/MainApi.Tests.csproj -c Test --filter "FullyQualifiedName~MainApi.Src.Modules.Auth"
```

Expected: all auth module tests pass.

- [ ] **Step 2: Run the API build**

Run:

```bash
just build-api
```

Expected: build succeeds with no C# analyzer errors.

- [ ] **Step 3: Check final diff**

Run:

```bash
git diff --stat HEAD~2..HEAD
git diff HEAD~2..HEAD -- apps/api/Src/Modules/Auth/Services/SessionService.cs apps/api/Src/Modules/Auth/Handlers/GetUserAuthData.Spec.cs
```

Expected:

- `SessionService.GetSessionByToken()` no longer filters out expired rows in the query before it can delete them.
- Expired rows are removed with `ForceHardDelete()`.
- The endpoint still returns `401`.
- No session token value is logged.

- [ ] **Step 4: Commit verification-only changes if needed**

If verification exposes a small compile or formatting issue, fix only that issue and run:

```bash
git add apps/api/Src/Modules/Auth/Services/SessionService.cs apps/api/Src/Modules/Auth/Handlers/GetUserAuthData.Spec.cs
git commit -m "chore: polish expired session cleanup"
```

If no changes are needed, do not create an empty commit.

## Self-Review

- Spec coverage: issue #261 is covered by delete-on-detect for expired presented tokens. Issue #389 covers future scheduled cleanup.
- Red-flag scan: no incomplete task wording remains.
- Type consistency: the plan uses existing `ISessionService.GetSessionByToken`, `MainApiDbContext.Session`, `ForceHardDelete`, `Routes.Auth.GetUserAuthData`, and `TestAuthClient`.
