using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.Impersonations.Services;

using Xunit;

using AppRoutes = PublyApp.Api.Lib.Routes.Routes;

namespace PublyApp.Api.Modules.Auth.Handlers;

public sealed class RevokeSessionForTokenSpec
	: IClassFixture<ApiFixture> {
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;
	private readonly ApiFixture _fixture;

	public RevokeSessionForTokenSpec(
		ApiFixture fixture
	) {
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
		_fixture = fixture;
	}

	[Fact]
	public async Task
	ItShouldRevokeRegularSessionAndInvalidateToken() {
		// Arrange: log in as a regular (tenant admin) user to obtain
		// a real, non-impersonation session token.
		var acmeAdminToken = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		// Act I: call the revoke endpoint with that session token.
		using var revokeRequest = new HttpRequestMessage(
			HttpMethod.Post,
			AppRoutes.Auth.RevokeSession
		).WithSessionToken(acmeAdminToken);

		using var revokeResponse =
			await _http.SendAsync(revokeRequest);

		// Assert I: the revoke call itself succeeds with 200.
		revokeResponse.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		var revokeBody = await revokeResponse.Content
			.ReadFromJsonAsync<ApiResponse>();
		revokeBody.Should().NotBeNull();
		Assert.NotNull(revokeBody);

		// Act II: reuse the SAME token against a regular authenticated
		// endpoint — it must now be invalid.
		using var authedRequest = new HttpRequestMessage(
			HttpMethod.Get,
			AppRoutes.Auth.GetUserAuthData
		).WithSessionToken(acmeAdminToken);

		using var authedResponse =
			await _http.SendAsync(authedRequest);

		// Assert II: the token no longer authenticates.
		authedResponse.StatusCode.Should()
			.Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task
	ItShouldLeaveSiblingRegularSessionAliveWhenRevokingOne() {
		// Proof #3: revoking one ordinary session must not invalidate a
		// sibling ordinary session for the same user.

		// Arrange: two independent logins produce two distinct session
		// tokens for the same tenant admin user.
		var tokenOne = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);
		var tokenTwo = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		// Tokens must be distinct sessions.
		tokenOne.Should().NotBe(tokenTwo);

		// Act: revoke the first session only.
		using var revokeRequest = new HttpRequestMessage(
			HttpMethod.Post,
			AppRoutes.Auth.RevokeSession
		).WithSessionToken(tokenOne);

		using var revokeResponse =
			await _http.SendAsync(revokeRequest);

		revokeResponse.StatusCode.Should().Be(HttpStatusCode.OK);

		// Assert I: the revoked token is dead.
		using var deadRequest = new HttpRequestMessage(
			HttpMethod.Get,
			AppRoutes.Auth.GetUserAuthData
		).WithSessionToken(tokenOne);

		using var deadResponse =
			await _http.SendAsync(deadRequest);

		deadResponse.StatusCode.Should().Be(HttpStatusCode.Unauthorized);

		// Assert II: the sibling token still authenticates.
		using var liveRequest = new HttpRequestMessage(
			HttpMethod.Get,
			AppRoutes.Auth.GetUserAuthData
		).WithSessionToken(tokenTwo);

		using var liveResponse =
			await _http.SendAsync(liveRequest);

		liveResponse.StatusCode.Should().Be(HttpStatusCode.OK);
	}

	[Fact]
	public async Task
	ItShouldNotRevokeImpersonationSessionAndMustKeepItUsable() {
		// Proof #4: the ordinary-session revoke endpoint must never end an
		// impersonation session. The impersonation token must remain usable,
		// the endpoint must return an honest non-401 result, and no
		// `impersonation.ended` audit action may be emitted.

		// Arrange: an impersonation session is created for the Acme
		// tenant via the IImpersonationService.
		var (_, impersonationToken) =
			await CreateImpersonationSessionViaServiceAsync();

		// Act: call the ordinary-session revoke endpoint with the
		// impersonation token.
		using var revokeRequest = new HttpRequestMessage(
			HttpMethod.Post,
			AppRoutes.Auth.RevokeSession
		).WithSessionToken(impersonationToken);

		using var revokeResponse =
			await _http.SendAsync(revokeRequest);

		// Assert I: honest non-401 RFC 7807 response — the authenticated
		// request reached the handler but no ordinary session could be
		// revoked (the token is an impersonation session, not a regular one).
		revokeResponse.StatusCode.Should().Be(HttpStatusCode.Forbidden);

		var problem = await revokeResponse.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);

		// Assert II: the impersonation token remains usable.
		using var authedRequest = new HttpRequestMessage(
			HttpMethod.Get,
			AppRoutes.Auth.GetUserAuthData
		).WithSessionToken(impersonationToken);

		using var authedResponse =
			await _http.SendAsync(authedRequest);

		authedResponse.StatusCode.Should().Be(HttpStatusCode.OK);

		// Assert III: no impersonation.ended audit action was emitted.
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var impersonationEndedCount = await dbContext.AuditLog
			.CountAsync(a => a.Action == AuditActions.ImpersonationEnded, default);

		impersonationEndedCount.Should().Be(0);
	}

	private async Task<(Guid tenantId, string impersonationToken)>
		CreateImpersonationSessionViaServiceAsync() {
		// Resolve the staff user GUID from the seeded staff admin email.
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var staffUser = await dbContext.User
			.FirstAsync(u => u.Email == TestConstants.StaffAdminEmail);

		var tenant = await dbContext.Tenant
			.FirstAsync(t => t.Code == "acme-corp");

		var impersonationService = scope.ServiceProvider
			.GetRequiredService<IImpersonationService>();

		var session = await impersonationService.CreateImpersonationSessionAsync(
			new CreateImpersonationSessionArgs(
				TenantId: tenant.GetRequiredId(),
				StaffUserId: staffUser.GetRequiredId(),
				Reason: "test impersonation for revoke proof"
			)
		);

		return (tenant.GetRequiredId(), session.Token);
	}
}
