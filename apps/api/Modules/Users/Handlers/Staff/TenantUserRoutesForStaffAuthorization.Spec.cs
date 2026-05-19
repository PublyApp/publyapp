namespace MainApi.Modules.Users.Handlers.Staff;

using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using MainApi.Data.DbContext;
using MainApi.Lib;
using MainApi.Lib.Routes;
using MainApi.Lib.Testing.Fixtures;
using MainApi.Lib.Testing.Helpers;
using MainApi.Lib.Utils;
using MainApi.Modules.Profiles.Entities;
using MainApi.Modules.Users.Entities;

using Microsoft.Extensions.DependencyInjection;

using Xunit;

public sealed class TenantUserRoutesForStaffAuthorizationSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public TenantUserRoutesForStaffAuthorizationSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	[Fact]
	public async Task
	ItShouldReturnUnauthorizedWithoutSessionForEveryIntroducedTenantUserRoute() {
		var routeSet = CreateRouteSet();

		foreach (var route in routeSet) {
			using var request = CreateRequest(route, sessionToken: null);

			using var response = await _http.SendAsync(request);

			response.StatusCode.Should().Be(
				HttpStatusCode.Unauthorized,
				route.Name
			);
		}
	}

	[Fact]
	public async Task
	ItShouldReturnForbiddenForTenantUserForEveryIntroducedTenantUserRoute() {
		var tenantToken = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);
		var routeSet = CreateRouteSet();

		foreach (var route in routeSet) {
			using var request = CreateRequest(route, tenantToken);

			using var response = await _http.SendAsync(request);

			response.StatusCode.Should().Be(
				HttpStatusCode.Forbidden,
				route.Name
			);
		}
	}

	[Fact]
	public async Task
	ItShouldReturnForbiddenForStaffWithoutPermissionForEveryIntroducedRoute() {
		var staffToken = await _authClient.LoginAsync(
			TestConstants.StaffUserEmail,
			TestConstants.SeedPassword
		);
		var routeSet = CreateRouteSet();

		foreach (var route in routeSet) {
			using var request = CreateRequest(route, staffToken);

			using var response = await _http.SendAsync(request);

			response.StatusCode.Should().Be(
				HttpStatusCode.Forbidden,
				route.Name
			);
		}
	}

	[Fact]
	public async Task
	ItShouldRequireTheExpectedPermissionForEveryIntroducedTenantUserRoute() {
		var getToken = await CreateStaffUserTokenWithPermissionAsync(
			"tenant-user-auth-get",
			AppPermissions.Staff.Users.GET_FOR_TENANT.Key
		);
		var updateToken = await CreateStaffUserTokenWithPermissionAsync(
			"tenant-user-auth-update",
			AppPermissions.Staff.Users.UPDATE_FOR_TENANT.Key
		);
		var deleteToken = await CreateStaffUserTokenWithPermissionAsync(
			"tenant-user-auth-delete",
			AppPermissions.Staff.Users.DELETE_FOR_TENANT.Key
		);
		var routeSet = CreateRouteSet();

		foreach (var route in routeSet) {
			var allowedToken = GetTokenForPermission(
				route.RequiredPermissionKey,
				getToken,
				updateToken,
				deleteToken
			);
			var rejectedToken = GetTokenForPermission(
				route.AlternatePermissionKey,
				getToken,
				updateToken,
				deleteToken
			);

			using var allowedRequest = CreateRequest(route, allowedToken);
			using var allowedResponse = await _http.SendAsync(allowedRequest);
			allowedResponse.StatusCode.Should().NotBe(
				HttpStatusCode.Forbidden,
				route.Name
			);
			allowedResponse.StatusCode.Should().NotBe(
				HttpStatusCode.Unauthorized,
				route.Name
			);

			using var rejectedRequest = CreateRequest(route, rejectedToken);
			using var rejectedResponse = await _http.SendAsync(rejectedRequest);
			rejectedResponse.StatusCode.Should().Be(
				HttpStatusCode.Forbidden,
				route.Name
			);
		}
	}

	private async Task<string> CreateStaffUserTokenWithPermissionAsync(
		string emailPrefix,
		string permissionKey
	) {
		var email = $"{emailPrefix}-{Guid.NewGuid():N}@example.com";
		var userId = await StaffUserTestHelper.SeedStaffUserAsync(
			_fixture,
			email
		);

		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<MainApiDbContext>();

		var staffAccountQuery =
			from account in dbContext.UserAccount
			where account.UserId == userId
				&& account.Scope == AccountScope.Staff
				&& !account.IsDeleted
			select account;
		var staffAccount = staffAccountQuery.First();

		var profile = Profile.CreateStaffProfile(
			$"{emailPrefix}-permission-{Guid.NewGuid():N}",
			"Test-only staff profile for tenant user route permissions"
		);

		await dbContext.Profile.AddAsync(profile);
		await dbContext.SaveChangesAsync();

		await dbContext.ProfilePermission.AddAsync(
			new ProfilePermission {
				ProfileId = profile.GetRequiredId(),
				PermissionKey = permissionKey,
			}
		);
		await dbContext.UserAccountProfile.AddAsync(
			new UserAccountProfile {
				UserAccountId = staffAccount.GetRequiredId(),
				ProfileId = profile.GetRequiredId(),
			}
		);
		await dbContext.SaveChangesAsync();

		return await _authClient.LoginAsync(
			email,
			TestConstants.SeedPassword
		);
	}

	private static string GetTokenForPermission(
		string permissionKey,
		string getToken,
		string updateToken,
		string deleteToken
	) {
		if (permissionKey == AppPermissions.Staff.Users.GET_FOR_TENANT.Key) {
			return getToken;
		}
		if (permissionKey == AppPermissions.Staff.Users.UPDATE_FOR_TENANT.Key) {
			return updateToken;
		}
		if (permissionKey == AppPermissions.Staff.Users.DELETE_FOR_TENANT.Key) {
			return deleteToken;
		}

		throw new InvalidOperationException(
			$"Unsupported permission key '{permissionKey}'."
		);
	}

	private static IReadOnlyList<ProtectedTenantUserRoute> CreateRouteSet() {
		var tenantId = Guid.NewGuid();
		var userId = Guid.NewGuid();
		var companyId = Guid.NewGuid();
		var getPermission = AppPermissions.Staff.Users.GET_FOR_TENANT.Key;
		var updatePermission = AppPermissions.Staff.Users.UPDATE_FOR_TENANT.Key;
		var deletePermission = AppPermissions.Staff.Users.DELETE_FOR_TENANT.Key;

		return [
			new ProtectedTenantUserRoute(
				"tenant-scoped-get-by-id",
				HttpMethod.Get,
				GetStaffTenantUserUrl(tenantId, userId),
				Body: null,
				RequiredPermissionKey: getPermission,
				AlternatePermissionKey: updatePermission
			),
			new ProtectedTenantUserRoute(
				"first-class-get-by-id",
				HttpMethod.Get,
				GetTenantUserUrl(userId),
				Body: null,
				RequiredPermissionKey: getPermission,
				AlternatePermissionKey: updatePermission
			),
			new ProtectedTenantUserRoute(
				"find-companies",
				HttpMethod.Get,
				GetTenantUserCompaniesUrl(userId),
				Body: null,
				RequiredPermissionKey: getPermission,
				AlternatePermissionKey: updatePermission
			),
			new ProtectedTenantUserRoute(
				"assign-companies",
				HttpMethod.Post,
				GetTenantUserCompaniesUrl(userId),
				new {
					tenantIds = new[] { companyId },
					level = "User",
				},
				RequiredPermissionKey: updatePermission,
				AlternatePermissionKey: getPermission
			),
			new ProtectedTenantUserRoute(
				"bulk-suspend-companies",
				HttpMethod.Post,
				GetTenantUserCompaniesActionUrl(userId, "bulk-suspend"),
				new { tenantIds = new[] { companyId } },
				RequiredPermissionKey: updatePermission,
				AlternatePermissionKey: getPermission
			),
			new ProtectedTenantUserRoute(
				"bulk-reactivate-companies",
				HttpMethod.Post,
				GetTenantUserCompaniesActionUrl(userId, "bulk-reactivate"),
				new { tenantIds = new[] { companyId } },
				RequiredPermissionKey: updatePermission,
				AlternatePermissionKey: getPermission
			),
			new ProtectedTenantUserRoute(
				"bulk-remove-companies",
				HttpMethod.Post,
				GetTenantUserCompaniesActionUrl(userId, "bulk-remove"),
				new { tenantIds = new[] { companyId } },
				RequiredPermissionKey: deletePermission,
				AlternatePermissionKey: updatePermission
			),
			new ProtectedTenantUserRoute(
				"update-identity",
				HttpMethod.Patch,
				GetTenantUserUrl(userId),
				new { firstName = "Route Auth" },
				RequiredPermissionKey: updatePermission,
				AlternatePermissionKey: getPermission
			),
			new ProtectedTenantUserRoute(
				"update-email",
				HttpMethod.Patch,
				PathUtils.Join(GetTenantUserUrl(userId), "/email"),
				new {
					email = $"route-auth-{Guid.NewGuid():N}@example.com",
				},
				RequiredPermissionKey: updatePermission,
				AlternatePermissionKey: getPermission
			),
			new ProtectedTenantUserRoute(
				"suspend-identity",
				HttpMethod.Post,
				PathUtils.Join(GetTenantUserUrl(userId), "/suspend"),
				Body: null,
				RequiredPermissionKey: updatePermission,
				AlternatePermissionKey: getPermission
			),
			new ProtectedTenantUserRoute(
				"reactivate-identity",
				HttpMethod.Post,
				PathUtils.Join(GetTenantUserUrl(userId), "/reactivate"),
				Body: null,
				RequiredPermissionKey: updatePermission,
				AlternatePermissionKey: getPermission
			),
		];
	}

	private static HttpRequestMessage CreateRequest(
		ProtectedTenantUserRoute route,
		string? sessionToken
	) {
		var request = new HttpRequestMessage(route.Method, route.Url);

		if (!string.IsNullOrWhiteSpace(sessionToken)) {
			request = request.WithSessionToken(sessionToken);
		}

		if (route.Body is not null) {
			request.Content = JsonContent.Create(route.Body);
		}

		return request;
	}

	private static string GetStaffTenantUserUrl(
		Guid tenantId,
		Guid userId
	) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForTenantAsStaff.GetByIdFn(
				tenantId.ToString(),
				userId.ToString()
			)
		);
	}

	private static string GetTenantUserUrl(Guid userId) =>
		PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForTenantUsersAsStaff.GetByIdFn(userId.ToString())
		);

	private static string GetTenantUserCompaniesUrl(Guid userId) =>
		PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForTenantUsersAsStaff.FindCompaniesFn(
				userId.ToString()
			)
		);

	private static string GetTenantUserCompaniesActionUrl(
		Guid userId,
		string action
	) {
		return PathUtils.Join(
			GetTenantUserCompaniesUrl(userId),
			$"/{action}"
		);
	}

	private sealed record ProtectedTenantUserRoute(
		string Name,
		HttpMethod Method,
		string Url,
		object? Body,
		string RequiredPermissionKey,
		string AlternatePermissionKey
	);
}
