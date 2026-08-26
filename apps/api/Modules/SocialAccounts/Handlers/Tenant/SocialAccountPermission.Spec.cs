using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;

using Xunit;

namespace PublyApp.Api.Modules.SocialAccounts.Handlers.Tenant;

// Proof 4 (plan Task 5): permission verbs on all five routes. A seeded tenant user
// without the socialaccounts permissions gets 403 everywhere; a missing session
// gets 401; 403 never logs out.
public sealed class SocialAccountPermissionSpec : IClassFixture<ApiFixture> {
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public SocialAccountPermissionSpec(ApiFixture fixture) {
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	[Fact]
	public async Task ItShouldReturn403OnEveryRouteWithoutTheVerb() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await TenantTestHelper.GetTenantIdByNameAsync(
			_http, staffToken, SeedConstants.Tenants.AcmeName
		);
		var token = await _authClient.LoginAsync(
			TestConstants.AcmeUserEmail, TestConstants.SeedPassword
		);

		var probes = new (string Url, HttpMethod Method, object? Payload)[] {
			("/social-accounts/", HttpMethod.Get, null),
			("/social-accounts/connect", HttpMethod.Post, new {
				identifier = "x@example.com",
				appPassword = "app-password-000",
			}),
			($"/social-accounts/{Guid.NewGuid()}/reconnect",
				HttpMethod.Post, new { appPassword = "app-password-000" }),
			($"/social-accounts/{Guid.NewGuid()}/disconnect",
				HttpMethod.Post, null),
			($"/social-accounts/{Guid.NewGuid()}/projects",
				HttpMethod.Put, new { projectIds = Array.Empty<Guid>() }),
		};

		foreach (var (url, method, payload) in probes) {
			using var request = new HttpRequestMessage(method, url)
				.WithSessionToken(token)
				.WithTenantId(tenantId);
			if (payload is not null) {
				request.Content = JsonContent.Create(payload);
			}
			using var response = await _http.SendAsync(request);
			response.StatusCode.Should().Be(
				HttpStatusCode.Forbidden,
				$"no-permission user hitting {method} {url} must be 403"
			);
			var problem = await response.Content
				.ReadFromJsonAsync<AppProblemDetails>();
			Assert.NotNull(problem);
			problem.TranslationKey.Should().NotBeNullOrWhiteSpace();
		}
	}

	[Fact]
	public async Task ItShouldReturn401WithoutASession() {
		using var request = new HttpRequestMessage(HttpMethod.Get, "/social-accounts/");
		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}
}
