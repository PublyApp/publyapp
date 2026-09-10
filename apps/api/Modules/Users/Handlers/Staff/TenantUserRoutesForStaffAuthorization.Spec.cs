
using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Profiles.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Users.Handlers.Staff;

public sealed class TenantUserRoutesForStaffAuthorizationSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public TenantUserRoutesForStaffAuthorizationSpec(ApiFixture fixture) {
		_Fixture = fixture;
		_Http = fixture.HttpClient;
		_AuthClient = new TestAuthClient(_Http);
	}

	[Fact]
	public async Task
	ItShouldReturnUnauthorizedWithoutSessionForEveryIntroducedTenantUserRoute() {
		var routeSet = _CreateRouteSet();

		foreach (var route in routeSet) {
			using var request = _CreateRequest(route, sessionToken: null);

			using var response = await _Http.SendAsync(request);

			response.StatusCode.Should().Be(
				HttpStatusCode.Unauthorized,
				route.Name
			);
		}
	}

	[Fact]
	public async Task
	ItShouldReturnForbiddenForTenantUserForEveryIntroducedTenantUserRoute() {
		var tenantToken = await _AuthClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);
		var routeSet = _CreateRouteSet();

		foreach (var route in routeSet) {
			using var request = _CreateRequest(route, tenantToken);

			using var response = await _Http.SendAsync(request);

			response.StatusCode.Should().Be(
				HttpStatusCode.Forbidden,
				route.Name
			);
		}
	}

	[Fact]
	public async Task
	ItShouldReturnForbiddenForStaffWithoutPermissionForEveryIntroducedRoute() {
		var staffToken = await _AuthClient.LoginAsync(
			TestConstants.StaffUserEmail,
			TestConstants.SeedPassword
		);
		var routeSet = _CreateRouteSet();

		foreach (var route in routeSet) {
			using var request = _CreateRequest(route, staffToken);

			using var response = await _Http.SendAsync(request);

			response.StatusCode.Should().Be(
				HttpStatusCode.Forbidden,
				route.Name
			);
		}
	}

	[Fact]
	public async Task
	ItShouldRequireTheExpectedPermissionForEveryIntroducedTenantUserRoute() {
		var getToken = await _CreateStaffUserTokenWithPermissionAsync(
			"tenant-user-auth-get",
			AppPermissions.Staff.Users.GET_FOR_TENANT.Key
		);
		var updateToken = await _CreateStaffUserTokenWithPermissionAsync(
			"tenant-user-auth-update",
			AppPermissions.Staff.Users.UPDATE_FOR_TENANT.Key
		);
		var deleteToken = await _CreateStaffUserTokenWithPermissionAsync(
			"tenant-user-auth-delete",
			AppPermissions.Staff.Users.DELETE_FOR_TENANT.Key
		);
		var routeSet = _CreateRouteSet();

		foreach (var route in routeSet) {
			var allowedToken = _GetTokenForPermission(
				route.RequiredPermissionKey,
				getToken,
				updateToken,
				deleteToken
			);
			var rejectedToken = _GetTokenForPermission(
				route.AlternatePermissionKey,
				getToken,
				updateToken,
				deleteToken
			);

			using var allowedRequest = _CreateRequest(route, allowedToken);
			using var allowedResponse = await _Http.SendAsync(allowedRequest);
			allowedResponse.StatusCode.Should().NotBe(
				HttpStatusCode.Forbidden,
				route.Name
			);
			allowedResponse.StatusCode.Should().NotBe(
				HttpStatusCode.Unauthorized,
				route.Name
			);

			using var rejectedRequest = _CreateRequest(route, rejectedToken);
			using var rejectedResponse = await _Http.SendAsync(rejectedRequest);
			rejectedResponse.StatusCode.Should().Be(
				HttpStatusCode.Forbidden,
				route.Name
			);
		}
	}

	private async Task<string> _CreateStaffUserTokenWithPermissionAsync(
		string emailPrefix,
		string permissionKey
	) {
		var email = $"{emailPrefix}-{Guid.NewGuid():N}@example.com";
		var userId = await StaffUserTestHelper.SeedStaffUserAsync(
			_Fixture,
			email
		);

		await using var scope =
			_Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

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

		return await _AuthClient.LoginAsync(
			email,
			TestConstants.SeedPassword
		);
	}

	private static string _GetTokenForPermission(
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

	private static IReadOnlyList<ProtectedTenantUserRoute> _CreateRouteSet() {
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
				_GetStaffTenantUserUrl(tenantId, userId),
				Body: null,
				RequiredPermissionKey: getPermission,
				AlternatePermissionKey: updatePermission
			),
			new ProtectedTenantUserRoute(
				"first-class-get-by-id",
				HttpMethod.Get,
				_GetTenantUserUrl(userId),
				Body: null,
				RequiredPermissionKey: getPermission,
				AlternatePermissionKey: updatePermission
			),
			new ProtectedTenantUserRoute(
				"find-companies",
				HttpMethod.Get,
				_GetTenantUserCompaniesUrl(userId),
				Body: null,
				RequiredPermissionKey: getPermission,
				AlternatePermissionKey: updatePermission
			),
			new ProtectedTenantUserRoute(
				"assign-companies",
				HttpMethod.Post,
				_GetTenantUserCompaniesUrl(userId),
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
				_GetTenantUserCompaniesActionUrl(userId, "bulk-suspend"),
				new { tenantIds = new[] { companyId } },
				RequiredPermissionKey: updatePermission,
				AlternatePermissionKey: getPermission
			),
			new ProtectedTenantUserRoute(
				"bulk-reactivate-companies",
				HttpMethod.Post,
				_GetTenantUserCompaniesActionUrl(userId, "bulk-reactivate"),
				new { tenantIds = new[] { companyId } },
				RequiredPermissionKey: updatePermission,
				AlternatePermissionKey: getPermission
			),
			new ProtectedTenantUserRoute(
				"bulk-remove-companies",
				HttpMethod.Post,
				_GetTenantUserCompaniesActionUrl(userId, "bulk-remove"),
				new { tenantIds = new[] { companyId } },
				RequiredPermissionKey: deletePermission,
				AlternatePermissionKey: updatePermission
			),
			new ProtectedTenantUserRoute(
				"update-identity",
				HttpMethod.Patch,
				_GetTenantUserUrl(userId),
				new { firstName = "Route Auth" },
				RequiredPermissionKey: updatePermission,
				AlternatePermissionKey: getPermission
			),
			new ProtectedTenantUserRoute(
				"update-email",
				HttpMethod.Patch,
				PathUtils.Join(_GetTenantUserUrl(userId), "/email"),
				new {
					email = $"route-auth-{Guid.NewGuid():N}@example.com",
				},
				RequiredPermissionKey: updatePermission,
				AlternatePermissionKey: getPermission
			),
			new ProtectedTenantUserRoute(
				"suspend-identity",
				HttpMethod.Post,
				PathUtils.Join(_GetTenantUserUrl(userId), "/suspend"),
				Body: null,
				RequiredPermissionKey: updatePermission,
				AlternatePermissionKey: getPermission
			),
			new ProtectedTenantUserRoute(
				"reactivate-identity",
				HttpMethod.Post,
				PathUtils.Join(_GetTenantUserUrl(userId), "/reactivate"),
				Body: null,
				RequiredPermissionKey: updatePermission,
				AlternatePermissionKey: getPermission
			),
		];
	}

	private static HttpRequestMessage _CreateRequest(
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

	private static string _GetStaffTenantUserUrl(
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

	private static string _GetTenantUserUrl(Guid userId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForTenantUsersAsStaff.GetByIdFn(userId.ToString())
		);
	}

	private static string _GetTenantUserCompaniesUrl(Guid userId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForTenantUsersAsStaff.FindCompaniesFn(
				userId.ToString()
			)
		);
	}

	private static string _GetTenantUserCompaniesActionUrl(
		Guid userId,
		string action
	) {
		return PathUtils.Join(
			_GetTenantUserCompaniesUrl(userId),
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
