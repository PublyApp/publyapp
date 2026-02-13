namespace MainApi.Src.Modules.Permissions.Handlers.Staff;

using System.Net;

using FluentAssertions;

using MainApi.Src.Lib.Routes;
using MainApi.Src.Lib.Testing.Fixtures;
using MainApi.Src.Lib.Testing.Helpers;
using MainApi.Src.Lib.Utils;

using Xunit;

public sealed class FindStaffPermissionsSpec
	: IClassFixture<ApiFixture> {
	private static readonly string FindUrl = PathUtils.Join(
		Routes.Staff.Root,
		Routes.Permissions.ForStaff.Root,
		Routes.Permissions.ForStaff.Find
	);

	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public FindStaffPermissionsSpec(
		ApiFixture fixture
	) {
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	[Fact]
	public async Task
	ItShouldReturnUnauthorizedWithoutToken() {
		var request = new HttpRequestMessage(
			HttpMethod.Get,
			FindUrl
		);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task
	ItShouldReturnOkWithValidToken() {
		var sessionToken =
			await _authClient.LoginAsStaffAdminAsync();

		var request = new HttpRequestMessage(
			HttpMethod.Get,
			FindUrl
		).WithSessionToken(sessionToken);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.OK);
	}

	[Fact]
	public async Task
	ItShouldReturnUnauthorizedWithInvalidToken() {
		var request = new HttpRequestMessage(
			HttpMethod.Get,
			FindUrl
		).WithSessionToken("invalid-token");

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Unauthorized);
	}
}
