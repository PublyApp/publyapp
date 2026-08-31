using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;

using Xunit;

using AppRoutes = PublyApp.Api.Lib.Routes.Routes;

namespace PublyApp.Api.Modules.Auth.Handlers;

public sealed class RevokeSessionForTokenSpec
	: IClassFixture<ApiFixture> {
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public RevokeSessionForTokenSpec(
		ApiFixture fixture
	) {
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
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
}
