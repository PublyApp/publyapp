using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;

using Xunit;

namespace PublyApp.Api.Modules.Auth.Handlers;

// Lane 142 — the front-end rail filter (issue #142) hides a navigation item
// when the user lacks its permission key, BUT the brief is explicit: a
// hidden nav item is NOT an authorization. The server must independently
// reject the underlying endpoint, otherwise any user who pastes a URL
// into the address bar (no menu) bypasses the filter.
//
// This spec is the focused proof the brief asks for: a tenant member who
// does NOT have `tenant.posts.view` in their scope-auth-data payload
// (i.e. the front rail would hide the "Posts" item) STILL gets a 403
// when they hit the `/posts` endpoint directly. The endpoint is gated by
// `TenantPermissionFilter` (`apps/api/Lib/Filters/TenantPermissionFilter.cs`)
// independently of any UI; the two defenses do not share state.
public sealed class PermissionBasedNavFilterServerProof
	: IClassFixture<ApiFixture> {
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public PermissionBasedNavFilterServerProof(
		ApiFixture fixture
	) {
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	[Fact]
	public async Task
	ItShouldRejectDirectPostAccessForUserLackingPostsViewPermission() {
		// Arrange: log in as the low-privilege Acme user (no posts.view),
		// discover their Acme tenant, fetch their scope auth data, and
		// confirm the posts.view key is missing (so the front rail would
		// hide Posts for them).
		var userToken = await _authClient.LoginAsync(
			TestConstants.AcmeUserEmail,
			TestConstants.SeedPassword
		);

		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var acmeId = await TenantTestHelper.GetTenantIdByNameAsync(
			_http,
			staffToken,
			SeedConstants.Tenants.AcmeName
		);

		var scopeAuthData = await FetchScopeAuthDataAsync(
			userToken, acmeId.ToString()
		);

		// The hidden-rail user: scope auth data must NOT carry the
		// permission that gates the endpoint. This is the precondition
		// the front-end filter reads to hide the "Posts" rail item.
		scopeAuthData.Permissions.Should().NotContain(
			AppPermissions.Tenant.Posts.VIEW.Key
		);

		// Act: hit the protected endpoint directly (URL bar) — the same
		// call the front would never make because the rail hides the link.
		using var request = new HttpRequestMessage(
				HttpMethod.Get,
				"/posts"
			)
			.WithSessionToken(userToken)
			.WithTenantId(acmeId);

		using var response = await _http.SendAsync(request);

		// Assert: the server rejects with 403 + the standard
		// permission-missing translation key. The rejection does not
		// depend on the front having hidden the rail item — the two
		// gates are independent.
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should()
			.Be("user-does-not-have-the-necessary-permissions");
	}

	private async Task<ScopeAuthDataResponse> FetchScopeAuthDataAsync(
		string sessionToken,
		string scope
	) {
		using var request = new HttpRequestMessage(
				HttpMethod.Get,
				$"{Routes.Auth.GetScopeAuthData}?scope={scope}"
			)
			.WithSessionToken(sessionToken);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var payload = await response.Content
			.ReadFromJsonAsync<ScopeAuthDataResponse>();
		if (payload is null) {
			throw new InvalidOperationException(
				"scope auth data response was empty"
			);
		}

		return payload;
	}

	private sealed record ScopeAuthDataResponse {
		public string Code { get; init; } = string.Empty;
		public string AccountLevel { get; init; } = string.Empty;
		public bool IsAdmin { get; init; }
		public List<string> Permissions { get; init; } = [];
	}
}
