
using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Permissions.Services;

using Xunit;

namespace PublyApp.Api.Modules.Permissions.Handlers.Staff;

public sealed class FindTenantPermissionsSpec
	: IClassFixture<ApiFixture> {
	private static readonly string[] ExpectedTenantPermissionGroups = [
		"posts",
		"projects",
		"media",
		"calendar",
		"channels",
		"approvals",
		"analytics",
		"members",
		"invitations",
		"profiles",
		"settings",
		"socialaccounts",
		"billing",
		"audit_logs",
		"modules"
	];

	private static readonly string[] ExpectedTenantPermissionKeys = [
		"tenant.posts.view",
		"tenant.posts.create",
		"tenant.posts.edit",
		"tenant.posts.publish",
		"tenant.posts.schedule",
		"tenant.posts.delete",
		"tenant.projects.view",
		"tenant.media.view",
		"tenant.media.upload",
		"tenant.media.edit",
		"tenant.media.delete",
		"tenant.calendar.view",
		"tenant.calendar.manage",
		"tenant.channels.view",
		"tenant.channels.connect",
		"tenant.channels.disconnect",
		"tenant.channels.manage",
		"tenant.approvals.request",
		"tenant.approvals.review",
		"tenant.analytics.view",
		"tenant.analytics.export",
		"tenant.members.view",
		"tenant.members.manage",
		"tenant.members.suspend",
		"tenant.members.remove",
		"tenant.invitations.view",
		"tenant.invitations.create",
		"tenant.invitations.revoke",
		"tenant.invitations.resend",
		"tenant.profiles.view",
		"tenant.profiles.create",
		"tenant.profiles.edit",
		"tenant.profiles.delete",
		"tenant.profiles.assign_members",
		"tenant.profiles.manage_permissions",
		"tenant.settings.view",
		"tenant.settings.edit",
		"tenant.socialaccounts.view",
		"tenant.socialaccounts.manage",
		"tenant.socialaccounts.publish",
		"tenant.billing.view",
		"tenant.billing.manage",
		"tenant.audit_logs.view",
		"tenant.modules.access_dashboard",
		"tenant.modules.access_billing",
		"tenant.modules.access_settings",
		"tenant.modules.access_users"
	];

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
		Assert.NotNull(payload);
		payload.TryGetValue("modules", out var modules).Should().BeTrue();
		Assert.NotNull(modules);
		var modulePermissions = modules;
		modulePermissions.Keys.Should().BeEquivalentTo([
			AppPermissions.Tenant.Modules.ACCESS_DASHBOARD.Key,
			AppPermissions.Tenant.Modules.ACCESS_BILLING.Key,
			AppPermissions.Tenant.Modules.ACCESS_SETTINGS.Key,
			AppPermissions.Tenant.Modules.ACCESS_USERS.Key
		]);
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

		Assert.NotNull(payload);
		payload.TryGetValue("modules", out var modules).Should().BeTrue();
		Assert.NotNull(modules);
		var modulePermissions = modules;
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

	[Fact]
	public async Task
	ItShouldReturnTheCompleteTenantCatalogWithEnglishAndFrenchCopy() {
		var sessionToken = await _authClient.LoginAsStaffAdminAsync();
		var catalogsByLanguage = new Dictionary<
			string,
			Dictionary<string, Dictionary<string, PermissionAsStaffItem>>
		>();

		foreach (var language in SupportedLanguage.All) {
			var request = new HttpRequestMessage(
				HttpMethod.Get,
				GetFindUrl(language)
			).WithSessionToken(sessionToken);

			using var response = await _http.SendAsync(request);
			response.StatusCode.Should().Be(HttpStatusCode.OK);

			var payload = await response.Content.ReadFromJsonAsync<
				Dictionary<string, Dictionary<string, PermissionAsStaffItem>>
			>();
			payload.Should().NotBeNull();
			Assert.NotNull(payload);
			catalogsByLanguage.Add(language, payload);
		}

		foreach (var (language, catalog) in catalogsByLanguage) {
			catalog.Keys.Should().BeEquivalentTo(ExpectedTenantPermissionGroups);
			catalog.Should().HaveCount(15);

			var permissions = catalog.Values
				.SelectMany(group => group.Values)
				.ToList();
			var keys = permissions.Select(permission => permission.Key).ToList();

			keys.Should().HaveCount(47);
			keys.Should().OnlyHaveUniqueItems();
			keys.Should().BeEquivalentTo(ExpectedTenantPermissionKeys);
			keys.Should().OnlyContain(key => key.StartsWith(
				"tenant.",
				StringComparison.Ordinal
			));
			permissions.Should().OnlyContain(
				permission => !string.IsNullOrWhiteSpace(permission.Name),
				$"every {language} permission name must be populated"
			);
			permissions.Should().OnlyContain(
				permission => !string.IsNullOrWhiteSpace(permission.Description),
				$"every {language} permission description must be populated"
			);
		}
	}

	private static string GetFindUrl(string? language = null) {
		if (string.IsNullOrEmpty(language)) {
			return FindUrl;
		}

		return FindUrl + "?language=" + language;
	}
}
