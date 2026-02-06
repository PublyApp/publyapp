namespace MainApi.Src.Modules.Permissions.Handlers.Staff;

using System.Net;

using FluentAssertions;

using MainApi.Src.Lib.Routes;
using MainApi.Src.Lib.Testing;
using MainApi.Src.Lib.Utils;

using Xunit;

public sealed class FindStaffPermissionsIntegrationTests
	: IClassFixture<ApiFixture> {
	private static readonly string FindUrl = PathUtils.Join(
		Routes.Staff.Root,
		Routes.Permissions.ForStaff.Root,
		Routes.Permissions.ForStaff.Find
	);

	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public FindStaffPermissionsIntegrationTests(
		ApiFixture fixture
	) {
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	[Fact]
	public async Task
	GetPermissions_WithoutToken_ReturnsUnauthorized() {
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
	GetPermissions_WithValidToken_ReturnsOk() {
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
	GetPermissions_WithInvalidToken_ReturnsUnauthorized() {
		var request = new HttpRequestMessage(
			HttpMethod.Get,
			FindUrl
		).WithSessionToken("invalid-token");

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Unauthorized);
	}
}
