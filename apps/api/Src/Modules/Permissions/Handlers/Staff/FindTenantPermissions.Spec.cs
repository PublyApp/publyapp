namespace MainApi.Src.Modules.Permissions.Handlers.Staff;

using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using MainApi.Src.Lib;
using MainApi.Src.Lib.Routes;
using MainApi.Src.Lib.Testing.Fixtures;
using MainApi.Src.Lib.Testing.Helpers;
using MainApi.Src.Lib.Utils;
using MainApi.Src.Modules.Permissions.Services;

using Xunit;

public sealed class FindTenantPermissionsSpec
	: IClassFixture<ApiFixture> {
	private static readonly string FindUrl = PathUtils.Join(
		Routes.Staff.Root,
		Routes.Permissions.ForStaff.Root,
		Routes.Permissions.ForStaff.Scopes.Root,
		Routes.Permissions.ForStaff.Scopes.Tenant
	);

	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public FindTenantPermissionsSpec(
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
	ItShouldReturnForbiddenForNonStaffUser() {
		var sessionToken =
			await _authClient.LoginAsync(
				TestConstants.AcmeAdminEmail,
				TestConstants.SeedPassword
			);

		var request = new HttpRequestMessage(
			HttpMethod.Get,
			FindUrl
		).WithSessionToken(sessionToken);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Forbidden);
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

	[Fact]
	public async Task
	ItShouldReturnTenantModulePermissionsWithCanonicalKeys() {
		var sessionToken =
			await _authClient.LoginAsStaffAdminAsync();

		var request = new HttpRequestMessage(
			HttpMethod.Get,
			FindUrl
		).WithSessionToken(sessionToken);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		var payload = await response.Content.ReadFromJsonAsync<
			Dictionary<string, Dictionary<string, PermissionAsStaffItem>>
		>();
		payload.Should().NotBeNull();
		payload!.TryGetValue("modules", out var modules).Should().BeTrue();
		var modulePermissions = modules!;
		modulePermissions.Keys.Should().BeEquivalentTo(new[] {
			AppPermissions.Tenant.Modules.ACCESS_DASHBOARD.Key,
			AppPermissions.Tenant.Modules.ACCESS_BILLING.Key,
			AppPermissions.Tenant.Modules.ACCESS_SETTINGS.Key,
			AppPermissions.Tenant.Modules.ACCESS_USERS.Key
		});
		modulePermissions.Keys.Should().OnlyContain(key => key.StartsWith(
			"tenant.modules.",
			StringComparison.Ordinal
		));
		modulePermissions.Should().NotContainKey("can_access_dashboard");
		modulePermissions.Should().NotContainKey("can_access_billing");
		modulePermissions.Should().NotContainKey("can_access_settings");
		modulePermissions.Should().NotContainKey("can_access_users");
	}

	[Fact]
	public async Task
	ItShouldReturnTranslatedLabelsInFrench() {
		var sessionToken =
			await _authClient.LoginAsStaffAdminAsync();

		var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetFindUrl("fr")
		).WithSessionToken(sessionToken);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		var payload = await response.Content.ReadFromJsonAsync<
			Dictionary<string, Dictionary<string, PermissionAsStaffItem>>
		>();
		payload.Should().NotBeNull();

		payload!.TryGetValue("modules", out var modules).Should().BeTrue();
		var modulePermissions = modules!;
		modulePermissions[AppPermissions.Tenant.Modules.ACCESS_DASHBOARD.Key].Name.Should()
			.Be("Accéder au tableau de bord");
		modulePermissions[AppPermissions.Tenant.Modules.ACCESS_DASHBOARD.Key].Description.Should()
			.Be("Accéder au tableau de bord du tenant");
		modulePermissions[AppPermissions.Tenant.Modules.ACCESS_BILLING.Key].Name.Should()
			.Be("Accéder à la facturation");
		modulePermissions[AppPermissions.Tenant.Modules.ACCESS_BILLING.Key].Description.Should()
			.Be("Accéder à la facturation du tenant");
		modulePermissions[AppPermissions.Tenant.Modules.ACCESS_SETTINGS.Key].Name.Should()
			.Be("Accéder aux paramètres");
		modulePermissions[AppPermissions.Tenant.Modules.ACCESS_SETTINGS.Key].Description.Should()
			.Be("Accéder aux paramètres du tenant");
		modulePermissions[AppPermissions.Tenant.Modules.ACCESS_USERS.Key].Name.Should()
			.Be("Accéder aux utilisateurs");
		modulePermissions[AppPermissions.Tenant.Modules.ACCESS_USERS.Key].Description.Should()
			.Be("Accéder aux utilisateurs du tenant");
	}

	private static string GetFindUrl(string? language = null) {
		if (string.IsNullOrEmpty(language)) {
			return FindUrl;
		}

		return FindUrl + "?language=" + language;
	}
}
