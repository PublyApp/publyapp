
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.Roles.Services;

using Xunit;

namespace PublyApp.Api.Modules.Roles.Handlers.Staff;

public sealed class DeleteTenantRoleAsStaffSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public DeleteTenantRoleAsStaffSpec(ApiFixture fixture) {
		this._Fixture = fixture;
		this._Http = fixture.HttpClient;
		this._AuthClient = new TestAuthClient(this._Http);
	}

	private static string _GetUrl(string tenantId, string roleId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Roles.ForTenantAsStaff.RootFn(tenantId),
			Routes.Roles.ForTenantAsStaff.DeleteFn(roleId)
		);
	}

	[Fact]
	public async Task ItShouldReturnUnauthorizedWithoutSession() {
		var tenantId = await this._GetTenantIdAsync();
		using var request = new HttpRequestMessage(
			HttpMethod.Delete,
			DeleteTenantRoleAsStaffSpec._GetUrl(tenantId.ToString(), Guid.NewGuid().ToString())
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
			HttpMethod.Delete,
			DeleteTenantRoleAsStaffSpec._GetUrl(tenantId.ToString(), Guid.NewGuid().ToString())
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
			HttpMethod.Delete,
			DeleteTenantRoleAsStaffSpec._GetUrl(tenantId.ToString(), Guid.NewGuid().ToString())
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForMalformedTenantId() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Delete,
			DeleteTenantRoleAsStaffSpec._GetUrl("not-a-guid", Guid.NewGuid().ToString())
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
			HttpMethod.Delete,
			DeleteTenantRoleAsStaffSpec._GetUrl(tenantId.ToString(), "not-a-guid")
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
			HttpMethod.Delete,
			DeleteTenantRoleAsStaffSpec._GetUrl(tenantId.ToString(), Guid.NewGuid().ToString())
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task ItShouldRejectDeletingDefaultRole() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync();
		var defaultRoleId = await this._GetDefaultTenantRoleIdAsync(tenantId);
		var roleGuid = defaultRoleId;

		var auditLogBefore = await this._GetLatestAuditLogAsync(
			AuditActions.TenantRoleDeleted,
			roleGuid
		);
		auditLogBefore.Should().BeNull();

		using var request = new HttpRequestMessage(
			HttpMethod.Delete,
			DeleteTenantRoleAsStaffSpec._GetUrl(tenantId.ToString(), defaultRoleId.ToString())
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(
					ResponseKeys.TenantRoleDefaultDeleteNotAllowed
				);
		problem.Detail.Should().Be("Default tenant role cannot be deleted");

		var auditLogAfter = await this._GetLatestAuditLogAsync(
			AuditActions.TenantRoleDeleted,
			roleGuid
		);
		auditLogAfter.Should().BeNull();
	}

	[Fact]
	public async Task ItShouldDeleteRoleAndRemoveItFromGetById() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync();
		var createdRole = await this._CreateRoleAsync(token, tenantId);
		var roleId = createdRole.RoleId;
		var roleName = createdRole.RoleName;
		var roleGuid = Guid.Parse(roleId);

		using var deleteRequest = new HttpRequestMessage(
			HttpMethod.Delete,
			DeleteTenantRoleAsStaffSpec._GetUrl(tenantId.ToString(), roleId)
		).WithSessionToken(token);

		using var deleteResponse = await this._Http.SendAsync(deleteRequest);
		deleteResponse.StatusCode.Should().Be(HttpStatusCode.OK);

		var auditLog = await this._GetLatestAuditLogAsync(
			AuditActions.TenantRoleDeleted,
			roleGuid
		);
		auditLog.Should().NotBeNull();
		Assert.NotNull(auditLog);
		auditLog.Action.Should().Be(AuditActions.TenantRoleDeleted);
		DeleteTenantRoleAsStaffSpec._AssertAuditDetails(
			auditLog,
			expectedTenantId: tenantId,
			expectedRoleId: roleGuid,
			expectedRoleName: roleName,
			expectedIsDefault: false
		);

		using var getRequest = new HttpRequestMessage(
			HttpMethod.Get,
			PathUtils.Join(
				Routes.Staff.Root,
				Routes.Roles.ForTenantAsStaff.RootFn(tenantId.ToString()),
				Routes.Roles.ForTenantAsStaff.GetFn(roleId)
			)
		).WithSessionToken(token);

		using var getResponse = await this._Http.SendAsync(getRequest);
		getResponse.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	private async Task<Guid> _GetTenantIdAsync() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		return await TenantTestHelper.GetTenantIdByNameAsync(
			this._Http,
			token,
			SeedConstants.Tenants.AcmeName
		);
	}

	private async Task<Guid> _GetDefaultTenantRoleIdAsync(Guid tenantId) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var roleService =
			scope.ServiceProvider.GetRequiredService<ITenantRoleAsStaffService>();
		var role = await roleService.GetOrCreateDefaultTenantRoleAsync(tenantId);

		role.Should().NotBeNull("the seeded tenant should always have a default role");
		Assert.NotNull(role);
		return role.GetRequiredId();
	}

	private async Task<(string RoleId, string RoleName)> _CreateRoleAsync(
		string staffToken,
		Guid tenantId
	) {
		var roleName = "Delete Tenant Role " + Guid.NewGuid().ToString("N")[..8];

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			PathUtils.Join(
				Routes.Staff.Root,
				Routes.Roles.ForTenantAsStaff.RootFn(tenantId.ToString()),
				Routes.Roles.ForTenantAsStaff.Create
			)
		).WithSessionToken(staffToken);

		request.Content = JsonContent.Create(new {
			name = roleName,
			description = "Role created for delete tests",
		});

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Created);

		var payload = await response.Content.ReadFromJsonAsync<GetTenantRoleByIdResponse>();
		payload.Should().NotBeNull();
		Assert.NotNull(payload);
		return (payload.Role.Id.ToString(), roleName);
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
		bool expectedIsDefault
	) {
		auditLog.Details.Should().NotBeNull();
		Assert.NotNull(auditLog.Details);
		using var document = JsonDocument.Parse(auditLog.Details);
		var details = document.RootElement;

		details.GetProperty("TenantId").GetGuid().Should().Be(expectedTenantId);
		details.GetProperty("RoleId").GetGuid().Should().Be(expectedRoleId);
		details.GetProperty("RoleName").GetString().Should().Be(expectedRoleName);
		details.GetProperty("IsDefault").GetBoolean().Should().Be(expectedIsDefault);
	}

	private sealed record GetTenantRoleByIdResponse {
		public required TenantRoleItemResponse Role { get; init; }
	}

	private sealed record TenantRoleItemResponse {
		public Guid Id { get; init; }
		public string Name { get; init; } = string.Empty;
		public string? Description { get; init; }
		public bool IsDefault { get; init; }
		public int UserAccountCount { get; init; }
	}
}
