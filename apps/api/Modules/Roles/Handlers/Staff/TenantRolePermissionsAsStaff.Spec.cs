
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.Roles.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Roles.Handlers.Staff;

public sealed class TenantRolePermissionsAsStaffSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public TenantRolePermissionsAsStaffSpec(ApiFixture fixture) {
		this._Fixture = fixture;
		this._Http = fixture.HttpClient;
		this._AuthClient = new TestAuthClient(this._Http);
	}

	private static string _GetListUrl(string tenantId, string roleId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Roles.ForTenantAsStaff.RootFn(tenantId),
			Routes.Roles.ForTenantAsStaff.Permissions.FindFn(roleId)
		);
	}

	private static string _GetToggleUrl(string tenantId, string roleId, string permissionKey) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Roles.ForTenantAsStaff.RootFn(tenantId),
			Routes.Roles.ForTenantAsStaff.Permissions.UpsertFn(
				roleId,
				permissionKey
			)
		);
	}

	[Fact]
	public async Task ItShouldReturnUnauthorizedWithoutSession() {
		var tenantId = await this._GetTenantIdAsync();
		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			TenantRolePermissionsAsStaffSpec._GetListUrl(tenantId.ToString(), Guid.NewGuid().ToString())
		);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForNonStaffUser() {
		var tenantId = await this._GetTenantIdAsync();
		var token = await this._AuthClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			TenantRolePermissionsAsStaffSpec._GetListUrl(tenantId.ToString(), Guid.NewGuid().ToString())
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForStaffWithoutPermission() {
		var tenantId = await this._GetTenantIdAsync();
		var token = await this._AuthClient.LoginAsync(
			TestConstants.StaffUserEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			TenantRolePermissionsAsStaffSpec._GetListUrl(tenantId.ToString(), Guid.NewGuid().ToString())
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnUnauthorizedForAssignWithoutSession() {
		var tenantId = await this._GetTenantIdAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			TenantRolePermissionsAsStaffSpec._GetToggleUrl(
				tenantId.ToString(),
				Guid.NewGuid().ToString(),
				AppPermissions.Tenant.Modules.ACCESS_USERS.Key
			)
		);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForAssignWithoutPermission() {
		var tenantId = await this._GetTenantIdAsync();
		var token = await this._AuthClient.LoginAsync(
			TestConstants.StaffUserEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			TenantRolePermissionsAsStaffSpec._GetToggleUrl(
				tenantId.ToString(),
				Guid.NewGuid().ToString(),
				AppPermissions.Tenant.Modules.ACCESS_USERS.Key
			)
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnNotFoundForAssignMissingRole() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			TenantRolePermissionsAsStaffSpec._GetToggleUrl(
				tenantId.ToString(),
				Guid.NewGuid().ToString(),
				AppPermissions.Tenant.Modules.ACCESS_USERS.Key
			)
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task ItShouldReturnUnauthorizedForUnassignWithoutSession() {
		var tenantId = await this._GetTenantIdAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Delete,
			TenantRolePermissionsAsStaffSpec._GetToggleUrl(
				tenantId.ToString(),
				Guid.NewGuid().ToString(),
				AppPermissions.Tenant.Modules.ACCESS_USERS.Key
			)
		);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForUnassignWithoutPermission() {
		var tenantId = await this._GetTenantIdAsync();
		var token = await this._AuthClient.LoginAsync(
			TestConstants.StaffUserEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Delete,
			TenantRolePermissionsAsStaffSpec._GetToggleUrl(
				tenantId.ToString(),
				Guid.NewGuid().ToString(),
				AppPermissions.Tenant.Modules.ACCESS_USERS.Key
			)
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnNotFoundForUnassignMissingRole() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Delete,
			TenantRolePermissionsAsStaffSpec._GetToggleUrl(
				tenantId.ToString(),
				Guid.NewGuid().ToString(),
				AppPermissions.Tenant.Modules.ACCESS_USERS.Key
			)
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForMalformedTenantId() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			TenantRolePermissionsAsStaffSpec._GetListUrl("not-a-guid", Guid.NewGuid().ToString())
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.MalformedId);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForMalformedTenantIdOnAssign() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			TenantRolePermissionsAsStaffSpec._GetToggleUrl(
				"not-a-guid",
				Guid.NewGuid().ToString(),
				AppPermissions.Tenant.Modules.ACCESS_USERS.Key
			)
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.MalformedId);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForUnknownPermissionKeyOnAssign() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync();
		var roleId = await this._CreateRoleAsync(tenantId);
		var auditLogBefore = await this._GetLatestAuditLogAsync(
			AuditActions.TenantRolePermissionsAssigned,
			Guid.Parse(roleId)
		);
		auditLogBefore.Should().BeNull();

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			TenantRolePermissionsAsStaffSpec._GetToggleUrl(
				tenantId.ToString(),
				roleId,
				"tenant.this.permission.does.not.exist"
			)
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.BadRequest);

		var auditLogAfter = await this._GetLatestAuditLogAsync(
			AuditActions.TenantRolePermissionsAssigned,
			Guid.Parse(roleId)
		);
		auditLogAfter.Should().BeNull();
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForMalformedRoleIdOnAssign() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			TenantRolePermissionsAsStaffSpec._GetToggleUrl(
				tenantId.ToString(),
				"not-a-guid",
				AppPermissions.Tenant.Modules.ACCESS_USERS.Key
			)
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.MalformedId);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForMalformedTenantIdOnUnassign() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Delete,
			TenantRolePermissionsAsStaffSpec._GetToggleUrl(
				"not-a-guid",
				Guid.NewGuid().ToString(),
				AppPermissions.Tenant.Modules.ACCESS_USERS.Key
			)
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.MalformedId);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForMalformedRoleIdOnUnassign() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Delete,
			TenantRolePermissionsAsStaffSpec._GetToggleUrl(
				tenantId.ToString(),
				"not-a-guid",
				AppPermissions.Tenant.Modules.ACCESS_USERS.Key
			)
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.MalformedId);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForMalformedRoleId() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			TenantRolePermissionsAsStaffSpec._GetListUrl(tenantId.ToString(), "not-a-guid")
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.MalformedId);
	}

	[Fact]
	public async Task ItShouldReturnNotFoundForMissingRole() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			TenantRolePermissionsAsStaffSpec._GetListUrl(tenantId.ToString(), Guid.NewGuid().ToString())
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task ItShouldListPermissionsSorted() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync();
		var roleId = await this._CreateRoleAsync(tenantId);

		await this._AssignPermissionAsync(
			token,
			tenantId,
			roleId,
			AppPermissions.Tenant.Modules.ACCESS_DASHBOARD.Key
		);
		await this._AssignPermissionAsync(
			token,
			tenantId,
			roleId,
			AppPermissions.Tenant.Modules.ACCESS_SETTINGS.Key
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			TenantRolePermissionsAsStaffSpec._GetListUrl(tenantId.ToString(), roleId)
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var payload = await response.Content.ReadFromJsonAsync<ListPermissionsResponse>();
		payload.Should().NotBeNull();
		Assert.NotNull(payload);
		payload.PermissionKeys.Should().BeInAscendingOrder();
	}

	[Fact]
	public async Task ItShouldAssignAndUnassignPermissions() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync();
		var roleId = await this._CreateRoleAsync(tenantId);
		var roleName = await this._GetRoleNameAsync(Guid.Parse(roleId));
		var permissionKey = AppPermissions.Tenant.Modules.ACCESS_USERS.Key;

		using (var assignRequest = new HttpRequestMessage(
			HttpMethod.Post,
			TenantRolePermissionsAsStaffSpec._GetToggleUrl(tenantId.ToString(), roleId, permissionKey)
		).WithSessionToken(token)) {
			using var assignResponse = await this._Http.SendAsync(assignRequest);
			assignResponse.StatusCode.Should().Be(HttpStatusCode.NoContent);
		}

		var assignedAuditLog = await this._GetLatestAuditLogAsync(
			AuditActions.TenantRolePermissionsAssigned,
			Guid.Parse(roleId)
		);
		assignedAuditLog.Should().NotBeNull();
		Assert.NotNull(assignedAuditLog);
		assignedAuditLog.Action.Should()
					.Be(AuditActions.TenantRolePermissionsAssigned);
		TenantRolePermissionsAsStaffSpec._AssertAuditDetails(
			assignedAuditLog,
			expectedTenantId: tenantId,
			expectedRoleId: Guid.Parse(roleId),
			expectedRoleName: roleName,
			expectedIsDefault: false,
			expectedPermissionKey: permissionKey
		);

		using (var unassignRequest = new HttpRequestMessage(
			HttpMethod.Delete,
			TenantRolePermissionsAsStaffSpec._GetToggleUrl(tenantId.ToString(), roleId, permissionKey)
		).WithSessionToken(token)) {
			using var unassignResponse = await this._Http.SendAsync(unassignRequest);
			unassignResponse.StatusCode.Should().Be(HttpStatusCode.NoContent);
		}

		var unassignedAuditLog = await this._GetLatestAuditLogAsync(
			AuditActions.TenantRolePermissionsUnassigned,
			Guid.Parse(roleId)
		);
		unassignedAuditLog.Should().NotBeNull();
		Assert.NotNull(unassignedAuditLog);
		unassignedAuditLog.Action.Should()
					.Be(AuditActions.TenantRolePermissionsUnassigned);
		TenantRolePermissionsAsStaffSpec._AssertAuditDetails(
			unassignedAuditLog,
			expectedTenantId: tenantId,
			expectedRoleId: Guid.Parse(roleId),
			expectedRoleName: roleName,
			expectedIsDefault: false,
			expectedPermissionKey: permissionKey
		);

		var keys = await this._GetPermissionKeysAsync(token, tenantId, roleId);
		keys.Should().NotContain(permissionKey);
	}

	[Fact]
	public async Task ItShouldTreatUnassignUnknownPermissionKeyAsNoOp() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync();
		var roleId = await this._CreateRoleAsync(tenantId);
		var roleGuid = Guid.Parse(roleId);
		var auditLogBefore = await this._GetLatestAuditLogAsync(
			AuditActions.TenantRolePermissionsUnassigned,
			roleGuid
		);
		auditLogBefore.Should().BeNull();

		using var request = new HttpRequestMessage(
			HttpMethod.Delete,
			TenantRolePermissionsAsStaffSpec._GetToggleUrl(tenantId.ToString(), roleId, "staff.this.does.not.exist")
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NoContent);

		var auditLogAfter = await this._GetLatestAuditLogAsync(
			AuditActions.TenantRolePermissionsUnassigned,
			roleGuid
		);
		auditLogAfter.Should().BeNull();
	}

	private async Task<Guid> _GetTenantIdAsync() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		return await TenantTestHelper.GetTenantIdByNameAsync(
			this._Http,
			token,
			SeedConstants.Tenants.AcmeName
		);
	}

	private async Task<string> _CreateRoleAsync(Guid tenantId) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var role = Role.CreateTenantRole(
			tenantId,
			name: "Tenant Role " + Guid.NewGuid().ToString("N")[..8],
			description: "Role created for permission tests"
		);
		role.ValidateRoleType();

		_ = dbContext.Role.Add(role);
		_ = await dbContext.SaveChangesAsync();

		return role.GetRequiredId().ToString();
	}

	private async Task<string> _GetRoleNameAsync(Guid roleId) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var role = await dbContext.Role
			.Where(p => p.Id == roleId)
			.Select(p => p.Name)
			.FirstAsync();

		return role;
	}

	private async Task _AssignPermissionAsync(
		string staffToken,
		Guid tenantId,
		string roleId,
		string permissionKey
	) {
		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			TenantRolePermissionsAsStaffSpec._GetToggleUrl(tenantId.ToString(), roleId, permissionKey)
		).WithSessionToken(staffToken);

		using var response = await this._Http.SendAsync(request);
		response.EnsureSuccessStatusCode();
	}

	private async Task<List<string>> _GetPermissionKeysAsync(
		string staffToken,
		Guid tenantId,
		string roleId
	) {
		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			TenantRolePermissionsAsStaffSpec._GetListUrl(tenantId.ToString(), roleId)
		).WithSessionToken(staffToken);

		using var response = await this._Http.SendAsync(request);
		response.EnsureSuccessStatusCode();

		var payload = await response.Content.ReadFromJsonAsync<ListPermissionsResponse>();
		if (payload is null) {
			throw new InvalidOperationException("Failed to deserialize permission payload");
		}

		return payload.PermissionKeys;
	}

	private async Task<AuditLog?> _GetLatestAuditLogAsync(
		string action,
		Guid targetId
	) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		return await dbContext.AuditLog
			.Where(log => log.Action == action && log.TargetId == targetId)
			.OrderByDescending(log => log.CreatedAt)
			.FirstOrDefaultAsync();
	}

	private static void _AssertAuditDetails(
		AuditLog auditLog,
		Guid expectedTenantId,
		Guid expectedRoleId,
		string expectedRoleName,
		bool expectedIsDefault,
		string? expectedPermissionKey = null
	) {
		auditLog.Details.Should().NotBeNull();
		Assert.NotNull(auditLog.Details);
		using var document = JsonDocument.Parse(auditLog.Details);
		var details = document.RootElement;

		details.GetProperty("TenantId").GetGuid().Should().Be(expectedTenantId);
		details.GetProperty("RoleId").GetGuid().Should().Be(expectedRoleId);
		details.GetProperty("RoleName").GetString().Should().Be(expectedRoleName);
		details.GetProperty("IsDefault").GetBoolean().Should().Be(expectedIsDefault);

		if (expectedPermissionKey is not null) {
			details.GetProperty("PermissionKey").GetString().Should().Be(expectedPermissionKey);
		}
	}

	private sealed record ListPermissionsResponse {
		public List<string> PermissionKeys { get; init; } = [];
	}
}
