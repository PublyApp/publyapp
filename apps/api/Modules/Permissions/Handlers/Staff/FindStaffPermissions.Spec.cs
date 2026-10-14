
using System.Net;

using FluentAssertions;

using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;

using Xunit;

namespace PublyApp.Api.Modules.Permissions.Handlers.Staff;

public sealed class FindStaffPermissionsSpec
	: IClassFixture<ApiFixture> {
	private static readonly string _FindUrl = PathUtils.Join(
		Routes.Staff.Root,
		Routes.Permissions.ForStaff.Root,
		Routes.Permissions.ForStaff.Scopes.Root,
		Routes.Permissions.ForStaff.Scopes.Staff
	);

	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public FindStaffPermissionsSpec(
		ApiFixture fixture
	) {
		this._Http = fixture.HttpClient;
		this._AuthClient = new TestAuthClient(this._Http);
	}

	[Fact]
	public async Task
	ItShouldReturnUnauthorizedWithoutToken() {
		var request = new HttpRequestMessage(
			HttpMethod.Get,
			FindStaffPermissionsSpec._FindUrl
		);

		using var response = await this._Http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task
	ItShouldReturnOkWithValidToken() {
		var sessionToken =
			await this._AuthClient.LoginAsStaffAdminAsync();

		var request = new HttpRequestMessage(
			HttpMethod.Get,
			FindStaffPermissionsSpec._FindUrl
		).WithSessionToken(sessionToken);

		using var response = await this._Http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.OK);
	}

	[Fact]
	public async Task
	ItShouldReturnUnauthorizedWithInvalidToken() {
		var request = new HttpRequestMessage(
			HttpMethod.Get,
			FindStaffPermissionsSpec._FindUrl
		).WithSessionToken("invalid-token");

		using var response = await this._Http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Unauthorized);
	}
}
