
using System.Net;
using System.Net.Http.Json;
using System.Text;
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
using PublyApp.Api.Modules.Roles.Services;
using PublyApp.Api.Modules.Tenants.Entities;
using PublyApp.Api.Modules.Tenants.Handlers.Staff;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Roles.Handlers.Staff;

public sealed class BulkDeleteTenantRolesAsStaffSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;
	private static readonly string[] _MalformedRoleIds = ["not-a-guid"];

	public BulkDeleteTenantRolesAsStaffSpec(ApiFixture fixture) {
		this._Fixture = fixture;
		this._Http = fixture.HttpClient;
		this._AuthClient = new TestAuthClient(this._Http);
	}

	private static string _GetCreateRoleUrl(string tenantId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Roles.ForTenantAsStaff.RootFn(tenantId),
			Routes.Roles.ForTenantAsStaff.Create
		);
	}

	private static string _GetBulkDeleteUrl(string tenantId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Roles.ForTenantAsStaff.RootFn(tenantId),
			Routes.Roles.ForTenantAsStaff.BulkDelete
		);
	}

	[Fact]
	public async Task ItShouldReturnUnauthorizedWithoutSession() {
		var tenantId = await this._GetTenantIdAsync();

		using var response = await this._BulkDeleteAsync(
			sessionToken: null,
			tenantId.ToString(),
			new { roleIds = new[] { Guid.NewGuid() } }
		);

		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task ItShouldReturnUnauthorizedForInvalidSession() {
		var tenantId = await this._GetTenantIdAsync();

		using var response = await this._BulkDeleteAsync(
			"invalid-session-token",
			tenantId.ToString(),
			new { roleIds = new[] { Guid.NewGuid() } }
		);

		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForTenantUser() {
		var tenantToken = await this._AuthClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);
		var tenantId = await this._GetTenantIdAsync();

		using var response = await this._BulkDeleteAsync(
			tenantToken,
			tenantId.ToString(),
			new { roleIds = new[] { Guid.NewGuid() } }
		);

		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForStaffWithoutPermission() {
		var staffToken = await TenantBulkActionSpecSupport
			.CreateStaffUserTokenWithoutPermissionAsync(
				this._Fixture,
				this._AuthClient,
				"bulk-delete-tenant-role-no-permission"
			);
		var tenantId = await this._GetTenantIdAsync();

		using var response = await this._BulkDeleteAsync(
			staffToken,
			tenantId.ToString(),
			new { roleIds = new[] { Guid.NewGuid() } }
		);

		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldAllowPermissionedStaffUserToBulkDeleteTenantRoles() {
		var staffToken = await TenantBulkActionSpecSupport
			.CreateStaffUserTokenWithPermissionAsync(
				this._Fixture,
				this._AuthClient,
				"bulk-delete-tenant-role-permissioned",
				AppPermissions.Staff.Roles.DELETE_FOR_TENANT.Key
			);
		var tenantId = await this._GetTenantIdAsync();
		var roleId = await this._SeedTenantRoleAsync(tenantId);

		using var response = await this._BulkDeleteAsync(
			staffToken,
			tenantId.ToString(),
			new { roleIds = new[] { roleId } }
		);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<BulkRoleActionResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.SucceededCount.Should().Be(1);
		result.FailedCount.Should().Be(0);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForMalformedTenantId() {
		var staffToken = await this._AuthClient.LoginAsStaffAdminAsync();

		using var response = await this._BulkDeleteAsync(
			staffToken,
			"not-a-guid",
			new { roleIds = new[] { Guid.NewGuid() } }
		);

		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.MalformedId);
	}

	[Fact]
	public async Task ItShouldReturnValidationProblemForMalformedRoleIds() {
		var staffToken = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync();

		using var response = await this._BulkDeleteAsync(
			staffToken,
			tenantId.ToString(),
			new { roleIds = BulkDeleteTenantRolesAsStaffSpec._MalformedRoleIds }
		);

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);

		var problem = await response.Content
			.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.RequestBodyValidationFailed);
		problem.Errors.Keys.Should().Contain("RoleIds");
	}

	[Theory]
	[MemberData(nameof(BulkDeleteTenantRolesAsStaffSpec.InvalidBodies))]
	public async Task ItShouldReturnValidationProblemWhenBodyIsInvalid(string body) {
		var staffToken = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync();

		using var response = await this._BulkDeleteRawJsonAsync(
			staffToken,
			tenantId.ToString(),
			body
		);

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);

		var problem = await response.Content
			.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.RequestBodyValidationFailed);
		problem.Errors.Keys.Should().Contain("RoleIds");
	}

	[Fact]
	public async Task ItShouldAcceptMaximumRoleIdsBoundary() {
		var staffToken = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync();
		var body =
			$$"""{ "roleIds": [{{BulkDeleteTenantRolesAsStaffSpec._CreateRoleIdsJson(count: 100)}}] }""";

		using var response = await this._BulkDeleteRawJsonAsync(
			staffToken,
			tenantId.ToString(),
			body
		);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<BulkRoleActionResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.SucceededCount.Should().Be(0);
		result.FailedCount.Should().Be(100);
		result.FailedItems.Should().HaveCount(100);
	}

	[Fact]
	public async Task ItShouldDeleteTenantRolesInOneBulkRequest() {
		var staffToken = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync();
		var firstRoleId = await this._CreateTenantRoleAsync(staffToken, tenantId);
		var secondRoleId = await this._CreateTenantRoleAsync(staffToken, tenantId);
		await this._AttachTenantRoleRelationsAsync(tenantId, firstRoleId);
		await this._AttachTenantRoleRelationsAsync(tenantId, secondRoleId);
		var startedAt = DateTime.UtcNow;

		using var response = await this._BulkDeleteAsync(
			staffToken,
			tenantId.ToString(),
			new { roleIds = new[] { firstRoleId, secondRoleId } }
		);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<BulkRoleActionResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.SucceededCount.Should().Be(2);
		result.FailedCount.Should().Be(0);
		result.FailedItems.Should().BeEmpty();

		await this._AssertTenantRoleDeletedAsync(tenantId, firstRoleId);
		await this._AssertTenantRoleDeletedAsync(tenantId, secondRoleId);
		await this._AssertRoleRelationsRemovedAsync(firstRoleId);
		await this._AssertRoleRelationsRemovedAsync(secondRoleId);
		await this._AssertLatestBulkDeleteAuditLogAsync(
			tenantId,
			startedAt,
			expectedRequestedCount: 2,
			expectedSucceededCount: 2,
			expectedFailedCount: 0,
			expectedRoleIds: [firstRoleId, secondRoleId]
		);
	}

	[Fact]
	public async Task ItShouldDeduplicateRepeatedTenantRoleIdsBeforeDeleting() {
		var staffToken = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync();
		var roleId = await this._CreateTenantRoleAsync(staffToken, tenantId);
		var startedAt = DateTime.UtcNow;

		using var response = await this._BulkDeleteAsync(
			staffToken,
			tenantId.ToString(),
			new { roleIds = new[] { roleId, roleId } }
		);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<BulkRoleActionResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.SucceededCount.Should().Be(1);
		result.FailedCount.Should().Be(0);
		result.FailedItems.Should().BeEmpty();

		await this._AssertTenantRoleDeletedAsync(tenantId, roleId);
		await this._AssertRoleRelationsRemovedAsync(roleId);
		await this._AssertLatestBulkDeleteAuditLogAsync(
			tenantId,
			startedAt,
			expectedRequestedCount: 1,
			expectedSucceededCount: 1,
			expectedFailedCount: 0,
			expectedRoleIds: [roleId]
		);
	}

	[Fact]
	public async Task ItShouldReturnPartialResultForDefaultAndMissingRoles() {
		var staffToken = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync();
		var deletableRoleId = await this._CreateTenantRoleAsync(staffToken, tenantId);
		var defaultRoleId = await this._GetDefaultTenantRoleIdAsync(tenantId);
		var missingRoleId = Guid.NewGuid();
		var startedAt = DateTime.UtcNow;

		using var response = await this._BulkDeleteAsync(
			staffToken,
			tenantId.ToString(),
			new {
				roleIds = new[] {
					deletableRoleId,
					defaultRoleId,
					missingRoleId
				}
			}
		);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<BulkRoleActionResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.SucceededCount.Should().Be(1);
		result.FailedCount.Should().Be(2);
		result.FailedItems.Should().ContainSingle(item =>
			item.RoleId == defaultRoleId
			&& item.Error == "Default tenant role cannot be deleted"
		);
		result.FailedItems.Should().ContainSingle(item =>
			item.RoleId == missingRoleId
			&& item.Error == "Role not found"
		);

		await this._AssertTenantRoleDeletedAsync(tenantId, deletableRoleId);
		await this._AssertTenantRoleNotDeletedAsync(tenantId, defaultRoleId);
		await this._AssertLatestBulkDeleteAuditLogAsync(
			tenantId,
			startedAt,
			expectedRequestedCount: 3,
			expectedSucceededCount: 1,
			expectedFailedCount: 2,
			expectedRoleIds: [
				deletableRoleId,
				defaultRoleId,
				missingRoleId
			],
			expectedFailedItems: new Dictionary<Guid, string> {
				[defaultRoleId] = "Default tenant role cannot be deleted",
				[missingRoleId] = "Role not found",
			}
		);
	}

	[Fact]
	public async Task ItShouldReportAlreadyDeletedTenantRolesAsNotFound() {
		var staffToken = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync();
		var roleId = await this._CreateTenantRoleAsync(staffToken, tenantId);

		using var firstResponse = await this._BulkDeleteAsync(
			staffToken,
			tenantId.ToString(),
			new { roleIds = new[] { roleId } }
		);
		firstResponse.StatusCode.Should().Be(HttpStatusCode.OK);

		var startedAt = DateTime.UtcNow;
		using var secondResponse = await this._BulkDeleteAsync(
			staffToken,
			tenantId.ToString(),
			new { roleIds = new[] { roleId } }
		);

		secondResponse.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await secondResponse.Content
			.ReadFromJsonAsync<BulkRoleActionResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.SucceededCount.Should().Be(0);
		result.FailedCount.Should().Be(1);
		result.FailedItems.Should().ContainSingle(item =>
			item.RoleId == roleId
			&& item.Error == "Role not found"
		);

		await this._AssertTenantRoleDeletedAsync(tenantId, roleId);
		await this._AssertLatestBulkDeleteAuditLogAsync(
			tenantId,
			startedAt,
			expectedRequestedCount: 1,
			expectedSucceededCount: 0,
			expectedFailedCount: 1,
			expectedRoleIds: [roleId],
			expectedFailedItems: new Dictionary<Guid, string> {
				[roleId] = "Role not found",
			}
		);
	}

	[Fact]
	public async Task ItShouldRejectRolesFromAnotherTenant() {
		var staffToken = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync();
		var otherTenant = await TenantBulkActionSpecSupport.SeedTenantAsync(
			this._Fixture,
			"Bulk Delete Other Tenant Role",
			TenantStatus.Active
		);
		var otherTenantRoleId = await this._SeedTenantRoleAsync(otherTenant.TenantId);
		var startedAt = DateTime.UtcNow;

		using var response = await this._BulkDeleteAsync(
			staffToken,
			tenantId.ToString(),
			new { roleIds = new[] { otherTenantRoleId } }
		);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<BulkRoleActionResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.SucceededCount.Should().Be(0);
		result.FailedCount.Should().Be(1);
		result.FailedItems.Should().ContainSingle(item =>
			item.RoleId == otherTenantRoleId
			&& item.Error == "Role not found"
		);

		await this._AssertTenantRoleNotDeletedAsync(
			otherTenant.TenantId,
			otherTenantRoleId
		);
		await this._AssertLatestBulkDeleteAuditLogAsync(
			tenantId,
			startedAt,
			expectedRequestedCount: 1,
			expectedSucceededCount: 0,
			expectedFailedCount: 1,
			expectedRoleIds: [otherTenantRoleId],
			expectedFailedItems: new Dictionary<Guid, string> {
				[otherTenantRoleId] = "Role not found",
			}
		);
	}

	public static TheoryData<string> InvalidBodies() {
		return new TheoryData<string> {
			"""{}""",
			"""{ "roleIds": null }""",
			"""{ "roleIds": "not-an-array" }""",
			"""{ "roleIds": [null] }""",
			"""{ "roleIds": [123] }""",
			"""{ "roleIds": [{}] }""",
			"""{ "roleIds": [] }""",
		// The validator allows at most 100 role IDs per bulk request.
			$$"""
			{
				"roleIds": [
					{{BulkDeleteTenantRolesAsStaffSpec._CreateRoleIdsJson(count: 101)}}
				]
			}
			""",
		};
	}

	private async Task<Guid> _GetTenantIdAsync() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		return await TenantTestHelper.GetTenantIdByNameAsync(
			this._Http,
			token,
			SeedConstants.Tenants.AcmeName
		);
	}

	private async Task<Guid> _CreateTenantRoleAsync(
		string staffToken,
		Guid tenantId
	) {
		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			BulkDeleteTenantRolesAsStaffSpec._GetCreateRoleUrl(tenantId.ToString())
		).WithSessionToken(staffToken);

		request.Content = JsonContent.Create(new {
			name = "Bulk Delete Tenant Role " + Guid.NewGuid().ToString("N")[..8],
			description = "Role created for bulk delete tests"
		});

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Created);

		var payload = await response.Content.ReadFromJsonAsync<TenantRoleResponse>();
		payload.Should().NotBeNull();
		Assert.NotNull(payload);
		return payload.Role.Id;
	}

	private async Task<Guid> _SeedTenantRoleAsync(Guid tenantId) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var role = Role.CreateTenantRole(
			tenantId,
			"Cross Tenant Bulk Delete " + Guid.NewGuid().ToString("N")[..8]
		);

		await dbContext.Role.AddAsync(role);
		await dbContext.SaveChangesAsync();

		return role.GetRequiredId();
	}

	private async Task _AttachTenantRoleRelationsAsync(
		Guid tenantId,
		Guid roleId
	) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var userAccountId = await BulkDeleteTenantRolesAsStaffSpec._GetTenantAccountIdByEmailAsync(
			dbContext,
			tenantId,
			TestConstants.AcmeAdminEmail
		);

		// Add both relation types so the successful bulk-delete path proves it cleans
		// joins in the same transaction as the role soft delete.
		await dbContext.RolePermission.AddAsync(new RolePermission {
			RoleId = roleId,
			PermissionKey = AppPermissions.Tenant.Modules.ACCESS_USERS.Key,
		});
		await dbContext.UserAccountRole.AddAsync(new UserAccountRole {
			UserAccountId = userAccountId,
			RoleId = roleId,
		});
		await dbContext.SaveChangesAsync();
	}

	private async Task<Guid> _GetDefaultTenantRoleIdAsync(Guid tenantId) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var roleService =
			scope.ServiceProvider.GetRequiredService<ITenantRoleAsStaffService>();
		var role = await roleService.GetOrCreateDefaultTenantRoleAsync(tenantId);

		role.Should().NotBeNull("the seeded tenant should have a default role");
		if (role is null) {
			throw new InvalidOperationException("Default tenant role was not found.");
		}

		return role.GetRequiredId();
	}

	private async Task<HttpResponseMessage> _BulkDeleteAsync(
		string? sessionToken,
		string tenantId,
		object body
	) {
		var request = new HttpRequestMessage(
			HttpMethod.Post,
			BulkDeleteTenantRolesAsStaffSpec._GetBulkDeleteUrl(tenantId)
		);

		if (sessionToken is not null) {
			request.WithSessionToken(sessionToken);
		}

		request.Content = JsonContent.Create(body);
		return await this._Http.SendAsync(request);
	}

	private async Task<HttpResponseMessage> _BulkDeleteRawJsonAsync(
		string sessionToken,
		string tenantId,
		string body
	) {
		var request = new HttpRequestMessage(
			HttpMethod.Post,
			BulkDeleteTenantRolesAsStaffSpec._GetBulkDeleteUrl(tenantId)
		).WithSessionToken(sessionToken);

		request.Content = new StringContent(
			body,
			Encoding.UTF8,
			"application/json"
		);

		return await this._Http.SendAsync(request);
	}

	private async Task _AssertTenantRoleDeletedAsync(
		Guid tenantId,
		Guid roleId
	) {
		var role = await this._GetRoleIgnoringFiltersAsync(roleId);
		role.Should().NotBeNull();
		if (role is null) {
			throw new InvalidOperationException("Seeded role could not be loaded.");
		}

		role.TenantId.Should().Be(tenantId);
		role.Scope.Should().Be(RoleScope.Tenant);
		role.IsDeleted.Should().BeTrue();
		role.DeletedAt.Should().NotBeNull();
	}

	private async Task _AssertTenantRoleNotDeletedAsync(
		Guid tenantId,
		Guid roleId
	) {
		var role = await this._GetRoleIgnoringFiltersAsync(roleId);
		role.Should().NotBeNull();
		if (role is null) {
			throw new InvalidOperationException("Seeded role could not be loaded.");
		}

		role.TenantId.Should().Be(tenantId);
		role.Scope.Should().Be(RoleScope.Tenant);
		role.IsDeleted.Should().BeFalse();
		role.DeletedAt.Should().BeNull();
	}

	private async Task _AssertRoleRelationsRemovedAsync(Guid roleId) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		// Joins are hard-deleted on role removal, so ignore query filters to catch
		// both leftover active rows and accidental soft-deleted leftovers.
		var permissionCount = await (
			from permission in dbContext.RolePermission.IgnoreQueryFilters()
			where permission.RoleId == roleId
			select permission
		).CountAsync();
		var userAccountRoleCount = await (
			from link in dbContext.UserAccountRole.IgnoreQueryFilters()
			where link.RoleId == roleId
			select link
		).CountAsync();

		permissionCount.Should().Be(0);
		userAccountRoleCount.Should().Be(0);
	}

	private async Task<Role?> _GetRoleIgnoringFiltersAsync(Guid roleId) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		return await (
			from role in dbContext.Role.IgnoreQueryFilters()
			where role.Id == roleId
			select role
		).FirstOrDefaultAsync();
	}

	private async Task _AssertLatestBulkDeleteAuditLogAsync(
		Guid tenantId,
		DateTime startedAt,
		int expectedRequestedCount,
		int expectedSucceededCount,
		int expectedFailedCount,
		IReadOnlyCollection<Guid>? expectedRoleIds = null,
		IReadOnlyDictionary<Guid, string>? expectedFailedItems = null
	) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var auditLog = await (
			from log in dbContext.AuditLog
			where log.Action == AuditActions.TenantRoleBulkDeleted
				&& log.CreatedAt >= startedAt
			orderby log.CreatedAt descending
			select log
		).FirstOrDefaultAsync();

		auditLog.Should().NotBeNull();
		if (auditLog is null) {
			throw new InvalidOperationException("Bulk delete audit log was not written.");
		}

		var expectedUserId = await BulkDeleteTenantRolesAsStaffSpec._GetUserIdByEmailAsync(
			dbContext,
			TestConstants.StaffAdminEmail
		);
		auditLog.UserId.Should().Be(expectedUserId);
		auditLog.Details.Should().NotBeNull();
		Assert.NotNull(auditLog.Details);
		using var document = JsonDocument.Parse(auditLog.Details);
		var details = document.RootElement;

		details.GetProperty("TenantId").GetGuid().Should().Be(tenantId);
		details.GetProperty("RequestedCount").GetInt32()
			.Should()
			.Be(expectedRequestedCount);
		details.GetProperty("SucceededCount").GetInt32()
			.Should()
			.Be(expectedSucceededCount);
		details.GetProperty("FailedCount").GetInt32()
			.Should()
			.Be(expectedFailedCount);

		if (expectedRoleIds is not null) {
			var actualRoleIds = details.GetProperty("RoleIds")
				.EnumerateArray()
				.Select(item => item.GetGuid())
				.ToList();

			actualRoleIds.Should().Equal(expectedRoleIds);
		}

		if (expectedFailedItems is not null) {
			var actualFailedItems = details.GetProperty("FailedItems")
				.EnumerateArray()
				.ToDictionary(
					item => item.GetProperty("RoleId").GetGuid(),
					item => item.GetProperty("Error").GetString() ?? string.Empty
				);

			actualFailedItems.Should().BeEquivalentTo(expectedFailedItems);
		}
	}

	private static async Task<Guid> _GetTenantAccountIdByEmailAsync(
		AppDbContext dbContext,
		Guid tenantId,
		string email
	) {
		var accountId = await (
			from account in dbContext.UserAccount
			where account.User.Email == email
				&& account.TenantId == tenantId
				&& account.Scope == AccountScope.Tenant
				&& !account.IsDeleted
			select account.Id
		).FirstOrDefaultAsync();

		if (accountId is null) {
			throw new InvalidOperationException("Seeded tenant account was not found.");
		}

		return accountId.Value;
	}

	private static async Task<Guid> _GetUserIdByEmailAsync(
		AppDbContext dbContext,
		string email
	) {
		var userId = await (
			from user in dbContext.User
			where user.Email == email
				&& !user.IsDeleted
			select user.Id
		).FirstOrDefaultAsync();

		if (userId is null) {
			throw new InvalidOperationException("Seeded user was not found.");
		}

		return userId.Value;
	}

	// Keep large body-shape cases generated locally so invalid/edge tests do not
	// need to seed a hundred database rows.
	private static string _CreateRoleIdsJson(int count) {
		var builder = new StringBuilder();

		for (var i = 0; i < count; i++) {
			if (i > 0) {
				builder.Append(',');
			}

			builder.Append('"');
			builder.Append(Guid.NewGuid());
			builder.Append('"');
		}

		return builder.ToString();
	}

	private sealed record TenantRoleResponse {
		public required TenantRoleItemResponse Role { get; init; }
	}

	private sealed record TenantRoleItemResponse {
		public Guid Id { get; init; }
	}

	private sealed record BulkRoleActionResponse {
		public int SucceededCount { get; init; }
		public int FailedCount { get; init; }
		public required List<BulkRoleActionFailedItemResponse> FailedItems {
			get;
			init;
		}
	}

	private sealed record BulkRoleActionFailedItemResponse {
		public Guid RoleId { get; init; }
		public string Error { get; init; } = string.Empty;
	}
}
