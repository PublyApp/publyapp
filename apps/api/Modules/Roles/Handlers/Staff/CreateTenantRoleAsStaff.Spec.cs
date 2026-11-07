
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

public sealed class CreateTenantRoleAsStaffSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public CreateTenantRoleAsStaffSpec(ApiFixture fixture) {
		this._Fixture = fixture;
		this._Http = fixture.HttpClient;
		this._AuthClient = new TestAuthClient(this._Http);
	}

	private static string _GetUrl(string tenantId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Roles.ForTenantAsStaff.RootFn(tenantId),
			Routes.Roles.ForTenantAsStaff.Create
		);
	}

	[Fact]
	public async Task ItShouldReturnUnauthorizedWithoutSession() {
		var tenantId = await this._GetTenantIdAsync();
		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			CreateTenantRoleAsStaffSpec._GetUrl(tenantId.ToString())
		);
		request.Content = JsonContent.Create(new { name = "New role" });

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
			HttpMethod.Post,
			CreateTenantRoleAsStaffSpec._GetUrl(tenantId.ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { name = "New role" });

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
			HttpMethod.Post,
			CreateTenantRoleAsStaffSpec._GetUrl(tenantId.ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { name = "New role" });

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForMalformedTenantId() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			CreateTenantRoleAsStaffSpec._GetUrl("not-a-guid")
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { name = "New role" });

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.MalformedId);
	}

	[Fact]
	public async Task ItShouldReturnNotFoundForMissingTenant() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var missingTenantId = Guid.NewGuid();

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			CreateTenantRoleAsStaffSpec._GetUrl(missingTenantId.ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { name = "New role" });

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task ItShouldCreateTenantRole() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync();
		var name = "Tenant Role " + Guid.NewGuid().ToString("N")[..8];

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			CreateTenantRoleAsStaffSpec._GetUrl(tenantId.ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new {
			name,
			description = "Created through tenant role CRUD",
		});

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Created);

		var payload = await response.Content.ReadFromJsonAsync<GetTenantRoleByIdResponse>();
		payload.Should().NotBeNull();
		Assert.NotNull(payload);
		payload.Role.Name.Should().Be(name);
		payload.Role.Description.Should().Be("Created through tenant role CRUD");
		payload.Role.Icon.Should().BeNull();
		payload.Role.Tone.Should().BeNull();
		payload.Role.IsDefault.Should().BeFalse();

		var persistedRole = await this._GetTenantRoleByNameAsync(tenantId, name);
		persistedRole.Should().NotBeNull();
		Assert.NotNull(persistedRole);
		persistedRole.Icon.Should().BeNull();
		persistedRole.Tone.Should().BeNull();
		payload.Role.PermissionsCount.Should().Be(0);
		payload.Role.CreatedAt.Should()
			.BeCloseTo(persistedRole.CreatedAt, TimeSpan.FromMicroseconds(1));
		payload.Role.UpdatedAt.Should()
			.BeCloseTo(persistedRole.UpdatedAt, TimeSpan.FromMicroseconds(1));
		payload.Role.CreatedAt.Should().NotBe(default);
		payload.Role.UpdatedAt.Should().NotBe(default);

		var auditLog = await this._GetLatestAuditLogAsync(
			AuditActions.TenantRoleCreated,
			payload.Role.Id
		);
		auditLog.Should().NotBeNull();
		Assert.NotNull(auditLog);
		auditLog.Action.Should().Be(AuditActions.TenantRoleCreated);
		CreateTenantRoleAsStaffSpec._AssertAuditDetails(
			auditLog,
			expectedTenantId: tenantId,
			expectedRoleId: payload.Role.Id,
			expectedRoleName: name,
			expectedIsDefault: false,
			expectedInitialPermissionKeys: [],
			expectedInitialPermissionCount: 0
		);
	}

	[Fact]
	public async Task ItShouldCreateTenantRoleWithIconAndTone() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync();
		var name = "Styled Tenant Role " + Guid.NewGuid().ToString("N")[..8];

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			CreateTenantRoleAsStaffSpec._GetUrl(tenantId.ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new {
			name,
			description = "Created with persisted card style",
			icon = "shield-check",
			tone = "4",
		});

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Created);

		var payload = await response.Content.ReadFromJsonAsync<GetTenantRoleByIdResponse>();
		payload.Should().NotBeNull();
		Assert.NotNull(payload);
		payload.Role.Icon.Should().Be("shield-check");
		payload.Role.Tone.Should().Be("4");

		var persistedRole = await this._GetTenantRoleByNameAsync(tenantId, name);
		persistedRole.Should().NotBeNull();
		Assert.NotNull(persistedRole);
		persistedRole.Icon.Should().Be("shield-check");
		persistedRole.Tone.Should().Be("4");
	}

	[Fact]
	public async Task ItShouldReturnUnprocessableEntityForInvalidTone() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			CreateTenantRoleAsStaffSpec._GetUrl(tenantId.ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new {
			name = "Invalid Tone " + Guid.NewGuid().ToString("N")[..8],
			tone = "8",
		});

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);

		var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.Errors.Should().ContainKey("Tone");
	}

	[Fact]
	public async Task ItShouldReturnUnprocessableEntityForUnsupportedIcon() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			CreateTenantRoleAsStaffSpec._GetUrl(tenantId.ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new {
			name = "Invalid Icon " + Guid.NewGuid().ToString("N")[..8],
			icon = "address-book",
		});

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);

		var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.Errors.Should().ContainKey("Icon");
	}

	[Fact]
	public async Task ItShouldCreateTenantRoleWithInitialPermissions() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync();
		var name = "Tenant Role " + Guid.NewGuid().ToString("N")[..8];
		var permissionKeys = new[] {
			AppPermissions.Tenant.Modules.ACCESS_USERS.Key,
			AppPermissions.Tenant.Modules.ACCESS_BILLING.Key
		};

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			CreateTenantRoleAsStaffSpec._GetUrl(tenantId.ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new {
			name,
			description = "Created with initial permissions",
			permissionKeys
		});

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Created);

		var payload = await response.Content.ReadFromJsonAsync<GetTenantRoleByIdResponse>();
		payload.Should().NotBeNull();

		Assert.NotNull(payload);
		payload.Role.PermissionsCount.Should().Be(permissionKeys.Length);
		payload.Role.CreatedAt.Should().NotBe(default);
		payload.Role.UpdatedAt.Should().NotBe(default);
		var persistedPermissionKeys = await this._GetPermissionKeysAsync(payload.Role.Id);
		persistedPermissionKeys.Should().BeEquivalentTo(permissionKeys);

		var auditLog = await this._GetLatestAuditLogAsync(
			AuditActions.TenantRoleCreated,
			payload.Role.Id
		);
		auditLog.Should().NotBeNull();
		Assert.NotNull(auditLog);
		CreateTenantRoleAsStaffSpec._AssertAuditDetails(
					auditLog,
					expectedTenantId: tenantId,
					expectedRoleId: payload.Role.Id,
					expectedRoleName: name,
					expectedIsDefault: false,
					expectedInitialPermissionKeys: permissionKeys,
					expectedInitialPermissionCount: permissionKeys.Length
				);
	}

	[Fact]
	public async Task ItShouldRejectInvalidPermissionKeysWithoutCreatingRole() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync();
		var name = "Tenant Role " + Guid.NewGuid().ToString("N")[..8];

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			CreateTenantRoleAsStaffSpec._GetUrl(tenantId.ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new {
			name,
			description = "Created with invalid permissions",
			permissionKeys = new[] {
				AppPermissions.Tenant.Modules.ACCESS_USERS.Key,
				"tenant.modules.does_not_exist"
			}
		});

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var role = await this._GetTenantRoleByNameAsync(tenantId, name);
		role.Should().BeNull();

		var auditLogCount = await this._GetAuditLogCountAsync(
			AuditActions.TenantRoleCreated,
			name
		);
		auditLogCount.Should().Be(0);
	}

	[Fact]
	public async Task ItShouldDeduplicateInitialPermissionKeys() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync();
		var name = "Tenant Role " + Guid.NewGuid().ToString("N")[..8];
		var duplicatedPermissionKey = AppPermissions.Tenant.Modules.ACCESS_USERS.Key;

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			CreateTenantRoleAsStaffSpec._GetUrl(tenantId.ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new {
			name,
			description = "Created with duplicate permissions",
			permissionKeys = new[] {
				duplicatedPermissionKey,
				duplicatedPermissionKey
			}
		});

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Created);

		var payload = await response.Content.ReadFromJsonAsync<GetTenantRoleByIdResponse>();
		payload.Should().NotBeNull();

		Assert.NotNull(payload);
		var persistedPermissionKeys = await this._GetPermissionKeysAsync(payload.Role.Id);
		persistedPermissionKeys.Should().Equal(duplicatedPermissionKey);

		var auditLog = await this._GetLatestAuditLogAsync(
			AuditActions.TenantRoleCreated,
			payload.Role.Id
		);
		auditLog.Should().NotBeNull();
		Assert.NotNull(auditLog);
		CreateTenantRoleAsStaffSpec._AssertAuditDetails(
					auditLog,
					expectedTenantId: tenantId,
					expectedRoleId: payload.Role.Id,
					expectedRoleName: name,
					expectedIsDefault: false,
					expectedInitialPermissionKeys: [duplicatedPermissionKey],
					expectedInitialPermissionCount: 1
				);
	}

	[Fact]
	public async Task ItShouldRejectDuplicateNamesWithinTenant() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync();
		var name = "Duplicate Tenant Role " + Guid.NewGuid().ToString("N")[..8];

		await this._CreateRoleAsync(token, tenantId, name);
		var auditLogCountBefore = await this._GetAuditLogCountAsync(
			AuditActions.TenantRoleCreated,
			name
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			CreateTenantRoleAsStaffSpec._GetUrl(tenantId.ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new {
			name,
			description = "Second role with duplicate name",
		});

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.RoleNameAlreadyExists);

		var auditLogCountAfter = await this._GetAuditLogCountAsync(
			AuditActions.TenantRoleCreated,
			name
		);
		auditLogCountAfter.Should().Be(auditLogCountBefore);
	}

	private async Task<Guid> _GetTenantIdAsync() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		return await TenantTestHelper.GetTenantIdByNameAsync(
			this._Http,
			token,
			SeedConstants.Tenants.AcmeName
		);
	}

	private async Task<string> _CreateRoleAsync(
		string staffToken,
		Guid tenantId,
		string name
	) {
		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			CreateTenantRoleAsStaffSpec._GetUrl(tenantId.ToString())
		).WithSessionToken(staffToken);
		request.Content = JsonContent.Create(new {
			name,
			description = "Helper role",
		});

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Created);

		var payload = await response.Content.ReadFromJsonAsync<GetTenantRoleByIdResponse>();
		payload.Should().NotBeNull();
		Assert.NotNull(payload);
		return payload.Role.Id.ToString();
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

	private async Task<int> _GetAuditLogCountAsync(
		string action,
		string? detailsContains = null
	) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		if (detailsContains is null) {
			return await dbContext.AuditLog.CountAsync(log => log.Action == action);
		}

		return await dbContext.AuditLog.CountAsync(log =>
			log.Action == action
			&& log.Details != null
			&& log.Details.Contains(detailsContains)
		);
	}

	private async Task<List<string>> _GetPermissionKeysAsync(Guid roleId) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		// No IsDeleted filter here: role_permissions now stores active grants only.
		return await (
			from pp in dbContext.RolePermission
			where pp.RoleId == roleId
			orderby pp.PermissionKey
			select pp.PermissionKey
		).ToListAsync();
	}

	private async Task<Role?> _GetTenantRoleByNameAsync(
		Guid tenantId,
		string name
	) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		return await (
			from p in dbContext.Role
			where p.TenantId == tenantId
				&& p.Scope == RoleScope.Tenant
				&& !p.IsDeleted
				&& p.Name == name
			select p
		).FirstOrDefaultAsync();
	}

	private static void _AssertAuditDetails(
		AuditLog auditLog,
		Guid expectedTenantId,
		Guid expectedRoleId,
		string expectedRoleName,
		bool expectedIsDefault,
		IReadOnlyCollection<string> expectedInitialPermissionKeys,
		int expectedInitialPermissionCount
	) {
		auditLog.Details.Should().NotBeNull();
		Assert.NotNull(auditLog.Details);
		using var document = JsonDocument.Parse(auditLog.Details);
		var details = document.RootElement;

		details.GetProperty("TenantId").GetGuid().Should().Be(expectedTenantId);
		details.GetProperty("RoleId").GetGuid().Should().Be(expectedRoleId);
		details.GetProperty("RoleName").GetString().Should().Be(expectedRoleName);
		details.GetProperty("IsDefault").GetBoolean().Should().Be(expectedIsDefault);
		details.GetProperty("InitialPermissionCount")
			.GetInt32()
			.Should()
			.Be(expectedInitialPermissionCount);
		details.GetProperty("InitialPermissionKeys")
			.EnumerateArray()
			.Select(x => x.GetString())
			.Should()
			.BeEquivalentTo(expectedInitialPermissionKeys);
	}

	private sealed record GetTenantRoleByIdResponse {
		public required TenantRoleItemResponse Role { get; init; }
	}

	private sealed record TenantRoleItemResponse {
		public Guid Id { get; init; }
		public string Name { get; init; } = string.Empty;
		public string? Description { get; init; }
		public string? Icon { get; init; }
		public string? Tone { get; init; }
		public bool IsDefault { get; init; }
		public int UserAccountCount { get; init; }
		public int PermissionsCount { get; init; }
		public DateTime CreatedAt { get; init; }
		public DateTime UpdatedAt { get; init; }
	}
}
