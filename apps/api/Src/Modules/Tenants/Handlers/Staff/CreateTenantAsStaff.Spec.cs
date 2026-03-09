namespace MainApi.Src.Modules.Tenants.Handlers.Staff;

using System.Net;
using System.Text.Json;

using FluentAssertions;

using MainApi.Src.Lib.Testing.Fixtures;
using MainApi.Src.Lib.Testing.Helpers;

using Xunit;

public sealed class CreateTenantAsStaffSpec
	: IClassFixture<ApiFixture> {
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public CreateTenantAsStaffSpec(ApiFixture fixture) {
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	[Fact]
	public async Task
	ItShouldReturnUnprocessableEntityWhenNameMissing() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();

		var body = JsonDocument.Parse(@"
			{
				""maxUsers"": 10
			}
		");

		var response = await TenantTestHelper.CreateTenantAsync(
			_http,
			token,
			body.RootElement
		);

		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);
	}

	[Fact]
	public async Task
	ItShouldReturnUnprocessableEntityWhenMaxUsersBelowZero() {
		var token =
			await _authClient.LoginAsStaffAdminAsync();

		var body = JsonDocument.Parse(@"
			{
				""name"": ""Test Tenant"",
				""maxUsers"": -1
			}
		");

		var response = await TenantTestHelper.CreateTenantAsync(
			_http,
			token,
			body.RootElement
		);

		response.StatusCode.Should()
			.Be(HttpStatusCode.UnprocessableEntity);
	}

	[Fact]
	public async Task
	ItShouldReturnUnauthorizedWhenNotAuthenticated() {
		var body = JsonDocument.Parse(@"
			{
				""name"": ""Test Tenant"",
				""maxUsers"": 10
			}
		");

		var response = await TenantTestHelper.CreateTenantAsync(
			_http,
			"", // No token
			body.RootElement
		);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Unauthorized);
	}
}
