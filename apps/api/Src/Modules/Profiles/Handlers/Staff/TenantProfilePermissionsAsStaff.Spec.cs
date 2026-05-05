namespace MainApi.Src.Modules.Profiles.Handlers.Staff;

using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

using FluentAssertions;

using MainApi.Localization;
using MainApi.Src.Data.DbContext;
using MainApi.Src.Data.Seeding;
using MainApi.Src.Lib;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Lib.Routes;
using MainApi.Src.Lib.Testing.Fixtures;
using MainApi.Src.Lib.Testing.Helpers;
using MainApi.Src.Lib.Utils;
using MainApi.Src.Modules.AuditLogs.Entities;
using MainApi.Src.Modules.Profiles.Entities;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using Xunit;

public sealed class TenantProfilePermissionsAsStaffSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public TenantProfilePermissionsAsStaffSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	private static string GetListUrl(string tenantId, string profileId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Profiles.ForTenantAsStaff.RootFn(tenantId),
			Routes.Profiles.ForTenantAsStaff.Permissions.FindFn(profileId)
		);
	}

	private static string GetToggleUrl(string tenantId, string profileId, string permissionKey) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Profiles.ForTenantAsStaff.RootFn(tenantId),
			Routes.Profiles.ForTenantAsStaff.Permissions.UpsertFn(
				profileId,
				permissionKey
			)
		);
	}

	[Fact]
	public async Task ItShouldReturnUnauthorizedWithoutSession() {
		var tenantId = await GetTenantIdAsync();
		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetListUrl(tenantId.ToString(), Guid.NewGuid().ToString())
		);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForNonStaffUser() {
		var tenantId = await GetTenantIdAsync();
		var token = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetListUrl(tenantId.ToString(), Guid.NewGuid().ToString())
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForStaffWithoutPermission() {
		var tenantId = await GetTenantIdAsync();
		var token = await _authClient.LoginAsync(
			TestConstants.StaffUserEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetListUrl(tenantId.ToString(), Guid.NewGuid().ToString())
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnUnauthorizedForAssignWithoutSession() {
		var tenantId = await GetTenantIdAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetToggleUrl(
				tenantId.ToString(),
				Guid.NewGuid().ToString(),
				AppPermissions.Tenant.Modules.ACCESS_USERS.Key
			)
		);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForAssignWithoutPermission() {
		var tenantId = await GetTenantIdAsync();
		var token = await _authClient.LoginAsync(
			TestConstants.StaffUserEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetToggleUrl(
				tenantId.ToString(),
				Guid.NewGuid().ToString(),
				AppPermissions.Tenant.Modules.ACCESS_USERS.Key
			)
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnNotFoundForAssignMissingProfile() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetToggleUrl(
				tenantId.ToString(),
				Guid.NewGuid().ToString(),
				AppPermissions.Tenant.Modules.ACCESS_USERS.Key
			)
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task ItShouldReturnUnauthorizedForUnassignWithoutSession() {
		var tenantId = await GetTenantIdAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Delete,
			GetToggleUrl(
				tenantId.ToString(),
				Guid.NewGuid().ToString(),
				AppPermissions.Tenant.Modules.ACCESS_USERS.Key
			)
		);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForUnassignWithoutPermission() {
		var tenantId = await GetTenantIdAsync();
		var token = await _authClient.LoginAsync(
			TestConstants.StaffUserEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Delete,
			GetToggleUrl(
				tenantId.ToString(),
				Guid.NewGuid().ToString(),
				AppPermissions.Tenant.Modules.ACCESS_USERS.Key
			)
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnNotFoundForUnassignMissingProfile() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Delete,
			GetToggleUrl(
				tenantId.ToString(),
				Guid.NewGuid().ToString(),
				AppPermissions.Tenant.Modules.ACCESS_USERS.Key
			)
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForMalformedTenantId() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetListUrl("not-a-guid", Guid.NewGuid().ToString())
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		problem!.TranslationKey.Should().Be(ResponseKeys.MalformedId);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForMalformedTenantIdOnAssign() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetToggleUrl(
				"not-a-guid",
				Guid.NewGuid().ToString(),
				AppPermissions.Tenant.Modules.ACCESS_USERS.Key
			)
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		problem!.TranslationKey.Should().Be(ResponseKeys.MalformedId);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForUnknownPermissionKeyOnAssign() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();
		var profileId = await CreateProfileAsync(tenantId);
		var auditLogBefore = await GetLatestAuditLogAsync(
			AuditActions.TenantProfilePermissionsAssigned,
			Guid.Parse(profileId)
		);
		auditLogBefore.Should().BeNull();

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetToggleUrl(
				tenantId.ToString(),
				profileId,
				"tenant.this.permission.does.not.exist"
			)
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		problem!.TranslationKey.Should().Be(ResponseKeys.BadRequest);

		var auditLogAfter = await GetLatestAuditLogAsync(
			AuditActions.TenantProfilePermissionsAssigned,
			Guid.Parse(profileId)
		);
		auditLogAfter.Should().BeNull();
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForMalformedProfileIdOnAssign() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetToggleUrl(
				tenantId.ToString(),
				"not-a-guid",
				AppPermissions.Tenant.Modules.ACCESS_USERS.Key
			)
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		problem!.TranslationKey.Should().Be(ResponseKeys.MalformedId);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForMalformedTenantIdOnUnassign() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Delete,
			GetToggleUrl(
				"not-a-guid",
				Guid.NewGuid().ToString(),
				AppPermissions.Tenant.Modules.ACCESS_USERS.Key
			)
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		problem!.TranslationKey.Should().Be(ResponseKeys.MalformedId);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForMalformedProfileIdOnUnassign() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Delete,
			GetToggleUrl(
				tenantId.ToString(),
				"not-a-guid",
				AppPermissions.Tenant.Modules.ACCESS_USERS.Key
			)
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		problem!.TranslationKey.Should().Be(ResponseKeys.MalformedId);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForMalformedProfileId() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetListUrl(tenantId.ToString(), "not-a-guid")
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		problem!.TranslationKey.Should().Be(ResponseKeys.MalformedId);
	}

	[Fact]
	public async Task ItShouldReturnNotFoundForMissingProfile() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetListUrl(tenantId.ToString(), Guid.NewGuid().ToString())
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task ItShouldListPermissionsSorted() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();
		var profileId = await CreateProfileAsync(tenantId);

		await AssignPermissionAsync(
			token,
			tenantId,
			profileId,
			AppPermissions.Tenant.Modules.ACCESS_DASHBOARD.Key
		);
		await AssignPermissionAsync(
			token,
			tenantId,
			profileId,
			AppPermissions.Tenant.Modules.ACCESS_SETTINGS.Key
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetListUrl(tenantId.ToString(), profileId)
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var payload = await response.Content.ReadFromJsonAsync<ListPermissionsResponse>();
		payload.Should().NotBeNull();
		payload!.PermissionKeys.Should().BeInAscendingOrder();
	}

	[Fact]
	public async Task ItShouldAssignAndUnassignPermissions() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();
		var profileId = await CreateProfileAsync(tenantId);
		var profileName = await GetProfileNameAsync(Guid.Parse(profileId));
		var permissionKey = AppPermissions.Tenant.Modules.ACCESS_USERS.Key;

		using (var assignRequest = new HttpRequestMessage(
			HttpMethod.Post,
			GetToggleUrl(tenantId.ToString(), profileId, permissionKey)
		).WithSessionToken(token)) {
			using var assignResponse = await _http.SendAsync(assignRequest);
			assignResponse.StatusCode.Should().Be(HttpStatusCode.NoContent);
		}

		var assignedAuditLog = await GetLatestAuditLogAsync(
			AuditActions.TenantProfilePermissionsAssigned,
			Guid.Parse(profileId)
		);
		assignedAuditLog.Should().NotBeNull();
		assignedAuditLog!.Action.Should()
			.Be(AuditActions.TenantProfilePermissionsAssigned);
		AssertAuditDetails(
			assignedAuditLog,
			expectedTenantId: tenantId,
			expectedProfileId: Guid.Parse(profileId),
			expectedProfileName: profileName,
			expectedIsDefault: false,
			expectedPermissionKey: permissionKey
		);

		using (var unassignRequest = new HttpRequestMessage(
			HttpMethod.Delete,
			GetToggleUrl(tenantId.ToString(), profileId, permissionKey)
		).WithSessionToken(token)) {
			using var unassignResponse = await _http.SendAsync(unassignRequest);
			unassignResponse.StatusCode.Should().Be(HttpStatusCode.NoContent);
		}

		var unassignedAuditLog = await GetLatestAuditLogAsync(
			AuditActions.TenantProfilePermissionsUnassigned,
			Guid.Parse(profileId)
		);
		unassignedAuditLog.Should().NotBeNull();
		unassignedAuditLog!.Action.Should()
			.Be(AuditActions.TenantProfilePermissionsUnassigned);
		AssertAuditDetails(
			unassignedAuditLog,
			expectedTenantId: tenantId,
			expectedProfileId: Guid.Parse(profileId),
			expectedProfileName: profileName,
			expectedIsDefault: false,
			expectedPermissionKey: permissionKey
		);

		var keys = await GetPermissionKeysAsync(token, tenantId, profileId);
		keys.Should().NotContain(permissionKey);
	}

	[Fact]
	public async Task ItShouldTreatUnassignUnknownPermissionKeyAsNoOp() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var tenantId = await GetTenantIdAsync();
		var profileId = await CreateProfileAsync(tenantId);
		var profileGuid = Guid.Parse(profileId);
		var auditLogBefore = await GetLatestAuditLogAsync(
			AuditActions.TenantProfilePermissionsUnassigned,
			profileGuid
		);
		auditLogBefore.Should().BeNull();

		using var request = new HttpRequestMessage(
			HttpMethod.Delete,
			GetToggleUrl(tenantId.ToString(), profileId, "staff.this.does.not.exist")
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NoContent);

		var auditLogAfter = await GetLatestAuditLogAsync(
			AuditActions.TenantProfilePermissionsUnassigned,
			profileGuid
		);
		auditLogAfter.Should().BeNull();
	}

	private async Task<Guid> GetTenantIdAsync() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		return await TenantTestHelper.GetTenantIdByNameAsync(
			_http,
			token,
			SeedConstants.Tenants.AcmeName
		);
	}

	private async Task<string> CreateProfileAsync(Guid tenantId) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<MainApiDbContext>();

		var profile = Profile.CreateTenantProfile(
			tenantId,
			name: "Tenant Profile " + Guid.NewGuid().ToString("N")[..8],
			description: "Profile created for permission tests"
		);
		profile.ValidateProfileType();

		_ = dbContext.Profile.Add(profile);
		_ = await dbContext.SaveChangesAsync();

		return profile.GetRequiredId().ToString();
	}

	private async Task<string> GetProfileNameAsync(Guid profileId) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<MainApiDbContext>();

		var profile = await dbContext.Profile
			.Where(p => p.Id == profileId)
			.Select(p => p.Name)
			.FirstAsync();

		return profile;
	}

	private async Task AssignPermissionAsync(
		string staffToken,
		Guid tenantId,
		string profileId,
		string permissionKey
	) {
		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetToggleUrl(tenantId.ToString(), profileId, permissionKey)
		).WithSessionToken(staffToken);

		using var response = await _http.SendAsync(request);
		response.EnsureSuccessStatusCode();
	}

	private async Task<List<string>> GetPermissionKeysAsync(
		string staffToken,
		Guid tenantId,
		string profileId
	) {
		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetListUrl(tenantId.ToString(), profileId)
		).WithSessionToken(staffToken);

		using var response = await _http.SendAsync(request);
		response.EnsureSuccessStatusCode();

		var payload = await response.Content.ReadFromJsonAsync<ListPermissionsResponse>();
		if (payload is null) {
			throw new InvalidOperationException("Failed to deserialize permission payload");
		}

		return payload.PermissionKeys;
	}

	private async Task<AuditLog?> GetLatestAuditLogAsync(
		string action,
		Guid targetId
	) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<MainApiDbContext>();

		return await dbContext.AuditLog
			.Where(log => log.Action == action && log.TargetId == targetId)
			.OrderByDescending(log => log.CreatedAt)
			.FirstOrDefaultAsync();
	}

	private static void AssertAuditDetails(
		AuditLog auditLog,
		Guid expectedTenantId,
		Guid expectedProfileId,
		string expectedProfileName,
		bool expectedIsDefault,
		string? expectedPermissionKey = null
	) {
		auditLog.Details.Should().NotBeNull();
		using var document = JsonDocument.Parse(auditLog.Details!);
		var details = document.RootElement;

		details.GetProperty("TenantId").GetGuid().Should().Be(expectedTenantId);
		details.GetProperty("ProfileId").GetGuid().Should().Be(expectedProfileId);
		details.GetProperty("ProfileName").GetString().Should().Be(expectedProfileName);
		details.GetProperty("IsDefault").GetBoolean().Should().Be(expectedIsDefault);

		if (expectedPermissionKey is not null) {
			details.GetProperty("PermissionKey").GetString().Should().Be(expectedPermissionKey);
		}
	}

	private sealed record ListPermissionsResponse {
		public List<string> PermissionKeys { get; init; } = [];
	}
}
