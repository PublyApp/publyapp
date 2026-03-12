namespace MainApi.Src.Modules.Auth.Handlers;

using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using MainApi.Src.Lib.Routes;
using MainApi.Src.Lib.Testing.Fixtures;

using Xunit;

public sealed class PasswordLoginSpec
	: IClassFixture<ApiFixture> {
	private readonly HttpClient _http;

	public PasswordLoginSpec(
		ApiFixture fixture
	) {
		_http = fixture.HttpClient;
	}

	[Fact]
	public async Task
	ItShouldReturnSessionTokenWithValidCredentials() {
		var loginRequest = new {
			email = TestConstants.StaffAdminEmail,
			password = TestConstants.SeedPassword
		};

		using var response = await _http.PostAsJsonAsync(
			Routes.Auth.Login,
			loginRequest
		);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<LoginResponse>();
		result.Should().NotBeNull();
		result!.SessionToken.Should().NotBeNullOrEmpty();
		result.UserId.Should().NotBeEmpty();
	}

	[Fact]
	public async Task
	ItShouldReturnSessionTokenWithMixedCaseEmail() {
		var mixedCaseEmail = TestConstants.StaffAdminEmail
			.Replace("staff", "StAfF", StringComparison.Ordinal)
			.Replace("admin", "AdMiN", StringComparison.Ordinal)
			.Replace("example", "ExAmPlE", StringComparison.Ordinal);

		var loginRequest = new {
			email = mixedCaseEmail,
			password = TestConstants.SeedPassword
		};

		using var response = await _http.PostAsJsonAsync(
			Routes.Auth.Login,
			loginRequest
		);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<LoginResponse>();
		result.Should().NotBeNull();
		result!.SessionToken.Should().NotBeNullOrEmpty();
		result.UserId.Should().NotBeEmpty();
	}

	[Fact]
	public async Task
	ItShouldReturnBadRequestWithInvalidPassword() {
		var loginRequest = new {
			email = TestConstants.StaffAdminEmail,
			password = "wrong-password-at-least-6-chars"
		};

		using var response = await _http.PostAsJsonAsync(
			Routes.Auth.Login,
			loginRequest
		);

		response.StatusCode.Should()
			.Be(HttpStatusCode.BadRequest);
	}

	[Fact]
	public async Task
	ItShouldReturnBadRequestForNonexistentUser() {
		var loginRequest = new {
			email = "nonexistent@example.com",
			password = "any-password-at-least-6"
		};

		using var response = await _http.PostAsJsonAsync(
			Routes.Auth.Login,
			loginRequest
		);

		response.StatusCode.Should()
			.Be(HttpStatusCode.BadRequest);
	}

	// Matches PasswordLoginResult in PassWordLogin.cs
	private record LoginResponse(
		Guid UserId,
		string SessionToken,
		DateTime SessionExpiresAt,
		double SessionExpiresInMs
	);
}
