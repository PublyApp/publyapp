
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
using PublyApp.Api.Modules.Tenants.Handlers.Staff;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Roles.Handlers.Staff;

public sealed class BulkDeleteStaffRolesSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;
	private static readonly string[] _MalformedRoleIds = ["not-a-guid"];

	public BulkDeleteStaffRolesSpec(ApiFixture fixture) {
		this._Fixture = fixture;
		this._Http = fixture.HttpClient;
		this._AuthClient = new TestAuthClient(this._Http);
	}

	private static string _GetCreateRoleUrl() {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Roles.ForStaff.Root,
			Routes.Roles.ForStaff.Create
		);
	}

	private static string _GetBulkDeleteUrl() {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Roles.ForStaff.Root,
			Routes.Roles.ForStaff.BulkDelete
		);
	}

	[Fact]
	public async Task ItShouldReturnUnauthorizedWithoutSession() {
		using var response = await this._BulkDeleteAsync(
			sessionToken: null,
			new { roleIds = new[] { Guid.NewGuid() } }
		);

		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task ItShouldReturnUnauthorizedForInvalidSession() {
		using var response = await this._BulkDeleteAsync(
			"invalid-session-token",
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

		using var response = await this._BulkDeleteAsync(
			tenantToken,
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
				"bulk-delete-staff-role-no-permission"
			);

		using var response = await this._BulkDeleteAsync(
			staffToken,
			new { roleIds = new[] { Guid.NewGuid() } }
		);

		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldAllowPermissionedStaffUserToBulkDeleteStaffRoles() {
		var staffToken = await TenantBulkActionSpecSupport
			.CreateStaffUserTokenWithPermissionAsync(
				this._Fixture,
				this._AuthClient,
				"bulk-delete-staff-role-permissioned",
				AppPermissions.Staff.Roles.DELETE_FOR_STAFF.Key
			);
		var roleId = await this._SeedStaffRoleAsync();

		using var response = await this._BulkDeleteAsync(
			staffToken,
			new { roleIds = new[] { roleId } }
		);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<BulkRoleActionResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.SucceededCount.Should().Be(1);
		result.FailedCount.Should().Be(0);

		await this._AssertStaffRoleDeletedAsync(roleId);
	}

	[Fact]
	public async Task ItShouldReturnValidationProblemForMalformedRoleIds() {
		var staffToken = await this._AuthClient.LoginAsStaffAdminAsync();

		using var response = await this._BulkDeleteAsync(
			staffToken,
			new { roleIds = BulkDeleteStaffRolesSpec._MalformedRoleIds }
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
	[MemberData(nameof(BulkDeleteStaffRolesSpec.InvalidBodies))]
	public async Task ItShouldReturnValidationProblemWhenBodyIsInvalid(string body) {
		var staffToken = await this._AuthClient.LoginAsStaffAdminAsync();

		using var response = await this._BulkDeleteRawJsonAsync(staffToken, body);

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
		var body =
			$$"""{ "roleIds": [{{BulkDeleteStaffRolesSpec._CreateRoleIdsJson(count: 100)}}] }""";

		using var response = await this._BulkDeleteRawJsonAsync(staffToken, body);

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
	public async Task ItShouldDeleteStaffRolesInOneBulkRequest() {
		var staffToken = await this._AuthClient.LoginAsStaffAdminAsync();
		var firstRoleId = await this._CreateStaffRoleAsync(staffToken);
		var secondRoleId = await this._CreateStaffRoleAsync(staffToken);
		await this._AttachStaffRoleUserLinkAsync(firstRoleId);
		await this._AttachStaffRoleUserLinkAsync(secondRoleId);
		var startedAt = DateTime.UtcNow;

		using var response = await this._BulkDeleteAsync(
			staffToken,
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

		await this._AssertStaffRoleDeletedAsync(firstRoleId);
		await this._AssertStaffRoleDeletedAsync(secondRoleId);
		await this._AssertRoleRelationsRemovedAsync(firstRoleId);
		await this._AssertRoleRelationsRemovedAsync(secondRoleId);
		await this._AssertLatestBulkDeleteAuditLogAsync(
			startedAt,
			expectedRequestedCount: 2,
			expectedSucceededCount: 2,
			expectedFailedCount: 0,
			expectedRoleIds: [firstRoleId, secondRoleId]
		);
	}

	[Fact]
	public async Task ItShouldDeduplicateRepeatedStaffRoleIdsBeforeDeleting() {
		var staffToken = await this._AuthClient.LoginAsStaffAdminAsync();
		var roleId = await this._CreateStaffRoleAsync(staffToken);
		var startedAt = DateTime.UtcNow;

		using var response = await this._BulkDeleteAsync(
			staffToken,
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

		await this._AssertStaffRoleDeletedAsync(roleId);
		await this._AssertRoleRelationsRemovedAsync(roleId);
		await this._AssertLatestBulkDeleteAuditLogAsync(
			startedAt,
			expectedRequestedCount: 1,
			expectedSucceededCount: 1,
			expectedFailedCount: 0,
			expectedRoleIds: [roleId]
		);
	}

	[Fact]
	public async Task ItShouldReturnPartialResultForMissingStaffRole() {
		var staffToken = await this._AuthClient.LoginAsStaffAdminAsync();
		var roleId = await this._CreateStaffRoleAsync(staffToken);
		var missingRoleId = Guid.NewGuid();
		var startedAt = DateTime.UtcNow;

		using var response = await this._BulkDeleteAsync(
			staffToken,
			new { roleIds = new[] { roleId, missingRoleId } }
		);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<BulkRoleActionResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.SucceededCount.Should().Be(1);
		result.FailedCount.Should().Be(1);
		result.FailedItems.Should().ContainSingle(item =>
			item.RoleId == missingRoleId
			&& item.Error == "Role not found"
		);

		await this._AssertStaffRoleDeletedAsync(roleId);
		await this._AssertLatestBulkDeleteAuditLogAsync(
			startedAt,
			expectedRequestedCount: 2,
			expectedSucceededCount: 1,
			expectedFailedCount: 1,
			expectedRoleIds: [roleId, missingRoleId],
			expectedFailedItems: new Dictionary<Guid, string> {
				[missingRoleId] = "Role not found",
			}
		);
	}

	[Fact]
	public async Task ItShouldReportAlreadyDeletedStaffRolesAsNotFound() {
		var staffToken = await this._AuthClient.LoginAsStaffAdminAsync();
		var roleId = await this._CreateStaffRoleAsync(staffToken);

		using var firstResponse = await this._BulkDeleteAsync(
			staffToken,
			new { roleIds = new[] { roleId } }
		);
		firstResponse.StatusCode.Should().Be(HttpStatusCode.OK);

		var startedAt = DateTime.UtcNow;
		using var secondResponse = await this._BulkDeleteAsync(
			staffToken,
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

		await this._AssertStaffRoleDeletedAsync(roleId);
		await this._AssertLatestBulkDeleteAuditLogAsync(
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

	// #1408 r1: the response must account for EVERY requested id — an id the
	// service refuses for any reason (missing, wrong scope, or otherwise
	// undeletable) is a per-item failure with a plain-language reason, never a
	// silent drop. SucceededCount + FailedCount always equals the requested
	// count.
	[Fact]
	public async Task ItShouldAccountForEveryRequestedStaffRoleId() {
		var staffToken = await this._AuthClient.LoginAsStaffAdminAsync();
		var deletableRoleId = await this._CreateStaffRoleAsync(staffToken);
		var notFoundRoleId = Guid.NewGuid();
		var startedAt = DateTime.UtcNow;

		using var response = await this._BulkDeleteAsync(
			staffToken,
			new { roleIds = new[] { deletableRoleId, notFoundRoleId } }
		);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<BulkRoleActionResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.SucceededCount.Should().Be(1);
		result.FailedCount.Should().Be(1);
		(result.SucceededCount + result.FailedCount).Should()
			.Be(2, "every requested id is either succeeded or failed");
		result.FailedItems.Should().ContainSingle(item =>
			item.RoleId == notFoundRoleId
			&& item.Error == "Role not found"
		);

		await this._AssertStaffRoleDeletedAsync(deletableRoleId);
		await this._AssertLatestBulkDeleteAuditLogAsync(
			startedAt,
			expectedRequestedCount: 2,
			expectedSucceededCount: 1,
			expectedFailedCount: 1,
			expectedRoleIds: [deletableRoleId, notFoundRoleId],
			expectedFailedItems: new Dictionary<Guid, string> {
				[notFoundRoleId] = "Role not found",
			}
		);
	}

	// #1408 r1: the service must never drop a requested id silently. A
	// default role is not deletable on any scope, so it must come back as a
	// per-item failure with a plain-language reason — not as a phantom success.
	// The staff scope cannot create one through its API surface
	// (`Role.CreateStaffRole` hardcodes IsDefault=false), so this seeds
	// the row directly to pin the accounting invariant at the boundary.
	[Fact]
	public async Task ItShouldReportDefaultStaffRoleAsFailedInsteadOfDroppingIt() {
		var staffToken = await this._AuthClient.LoginAsStaffAdminAsync();
		var deletableRoleId = await this._CreateStaffRoleAsync(staffToken);
		var defaultRoleId = await this._SeedStaffDefaultRoleAsync();
		var startedAt = DateTime.UtcNow;

		using var response = await this._BulkDeleteAsync(
			staffToken,
			new { roleIds = new[] { deletableRoleId, defaultRoleId } }
		);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<BulkRoleActionResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.SucceededCount.Should().Be(1);
		result.FailedCount.Should().Be(1);
		(result.SucceededCount + result.FailedCount).Should()
			.Be(2, "every requested id is either succeeded or failed");
		result.FailedItems.Should().ContainSingle(item =>
			item.RoleId == defaultRoleId
			&& item.Error == "Default roles cannot be deleted"
		);

		await this._AssertStaffRoleDeletedAsync(deletableRoleId);
		await this._AssertRoleNotDeletedAsync(defaultRoleId);
		await this._AssertLatestBulkDeleteAuditLogAsync(
			startedAt,
			expectedRequestedCount: 2,
			expectedSucceededCount: 1,
			expectedFailedCount: 1,
			expectedRoleIds: [deletableRoleId, defaultRoleId],
			expectedFailedItems: new Dictionary<Guid, string> {
				[defaultRoleId] = "Default roles cannot be deleted",
			}
		);
	}

	[Fact]
	public async Task ItShouldRejectTenantRolesInStaffRoleBulkDelete() {
		var staffToken = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetTenantIdAsync();
		var tenantRoleId = await this._SeedTenantRoleAsync(tenantId);
		var startedAt = DateTime.UtcNow;

		using var response = await this._BulkDeleteAsync(
			staffToken,
			new { roleIds = new[] { tenantRoleId } }
		);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<BulkRoleActionResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.SucceededCount.Should().Be(0);
		result.FailedCount.Should().Be(1);
		result.FailedItems.Should().ContainSingle(item =>
			item.RoleId == tenantRoleId
			&& item.Error == "Role not found"
		);

		await this._AssertRoleNotDeletedAsync(tenantRoleId);
		await this._AssertLatestBulkDeleteAuditLogAsync(
			startedAt,
			expectedRequestedCount: 1,
			expectedSucceededCount: 0,
			expectedFailedCount: 1,
			expectedRoleIds: [tenantRoleId],
			expectedFailedItems: new Dictionary<Guid, string> {
				[tenantRoleId] = "Role not found",
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
					{{BulkDeleteStaffRolesSpec._CreateRoleIdsJson(count: 101)}}
				]
			}
			""",
		};
	}

	private async Task<Guid> _CreateStaffRoleAsync(string staffToken) {
		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			BulkDeleteStaffRolesSpec._GetCreateRoleUrl()
		).WithSessionToken(staffToken);

		request.Content = JsonContent.Create(new {
			name = "Bulk Delete Staff Role " + Guid.NewGuid().ToString("N")[..8],
			description = "Role created for bulk delete tests",
			permissions = new[] { AppPermissions.Staff.Roles.GET_FOR_STAFF.Key },
			emails = Array.Empty<string>()
		});

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Created);

		var created = await response.Content.ReadFromJsonAsync<StaffRoleCreated>();
		created.Should().NotBeNull();
		Assert.NotNull(created);
		return created.RoleId;
	}

	private async Task<Guid> _SeedStaffRoleAsync() {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var role = Role.CreateStaffRole(
			"Seeded Staff Bulk Delete " + Guid.NewGuid().ToString("N")[..8],
			"Role seeded for permission-only bulk delete tests"
		);

		await dbContext.Role.AddAsync(role);
		await dbContext.SaveChangesAsync();

		return role.GetRequiredId();
	}

	private async Task<Guid> _GetTenantIdAsync() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		return await TenantTestHelper.GetTenantIdByNameAsync(
			this._Http,
			token,
			SeedConstants.Tenants.AcmeName
		);
	}

	// The staff scope cannot hold a default role through any API or seeder
	// path (CreateStaffRole hardcodes IsDefault=false and
	// ValidateRoleType rejects the combination), but the bulk-delete
	// boundary must still account for one if it ever reaches the database.
	// Seeding directly is what lets the spec pin that accounting contract.
	private async Task<Guid> _SeedStaffDefaultRoleAsync() {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var role = Role.CreateStaffRole(
			"Seeded Staff Default " + Guid.NewGuid().ToString("N")[..8],
			"Default-flagged role seeded for bulk delete accounting tests"
		);
		role.IsDefault = true;

		await dbContext.Role.AddAsync(role);
		await dbContext.SaveChangesAsync();

		return role.GetRequiredId();
	}

	private async Task<Guid> _SeedTenantRoleAsync(Guid tenantId) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var role = Role.CreateTenantRole(
			tenantId,
			"Wrong Scope Bulk Delete " + Guid.NewGuid().ToString("N")[..8]
		);

		await dbContext.Role.AddAsync(role);
		await dbContext.SaveChangesAsync();

		return role.GetRequiredId();
	}

	private async Task _AttachStaffRoleUserLinkAsync(Guid roleId) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var userAccountId = await BulkDeleteStaffRolesSpec._GetStaffAccountIdByEmailAsync(
			dbContext,
			TestConstants.StaffAdminEmail
		);

		// Create only the join row here because the API-created staff role already
		// carries a RolePermission row from its request permissions.
		await dbContext.UserAccountRole.AddAsync(new UserAccountRole {
			UserAccountId = userAccountId,
			RoleId = roleId,
		});
		await dbContext.SaveChangesAsync();
	}

	private async Task<HttpResponseMessage> _BulkDeleteAsync(
		string? sessionToken,
		object body
	) {
		var request = new HttpRequestMessage(
			HttpMethod.Post,
			BulkDeleteStaffRolesSpec._GetBulkDeleteUrl()
		);

		if (sessionToken is not null) {
			request.WithSessionToken(sessionToken);
		}

		request.Content = JsonContent.Create(body);
		return await this._Http.SendAsync(request);
	}

	private async Task<HttpResponseMessage> _BulkDeleteRawJsonAsync(
		string sessionToken,
		string body
	) {
		var request = new HttpRequestMessage(
			HttpMethod.Post,
			BulkDeleteStaffRolesSpec._GetBulkDeleteUrl()
		).WithSessionToken(sessionToken);

		request.Content = new StringContent(
			body,
			Encoding.UTF8,
			"application/json"
		);

		return await this._Http.SendAsync(request);
	}

	private async Task _AssertStaffRoleDeletedAsync(Guid roleId) {
		var role = await this._GetRoleIgnoringFiltersAsync(roleId);
		role.Should().NotBeNull();
		if (role is null) {
			throw new InvalidOperationException("Seeded role could not be loaded.");
		}

		role.Scope.Should().Be(RoleScope.Staff);
		role.IsDeleted.Should().BeTrue();
		role.DeletedAt.Should().NotBeNull();
	}

	private async Task _AssertRoleNotDeletedAsync(Guid roleId) {
		var role = await this._GetRoleIgnoringFiltersAsync(roleId);
		role.Should().NotBeNull();
		if (role is null) {
			throw new InvalidOperationException("Seeded role could not be loaded.");
		}

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
			where log.Action == AuditActions.StaffRoleBulkDeleted
				&& log.CreatedAt >= startedAt
			orderby log.CreatedAt descending
			select log
		).FirstOrDefaultAsync();

		auditLog.Should().NotBeNull();
		if (auditLog is null) {
			throw new InvalidOperationException("Bulk delete audit log was not written.");
		}

		var expectedUserId = await BulkDeleteStaffRolesSpec._GetUserIdByEmailAsync(
			dbContext,
			TestConstants.StaffAdminEmail
		);
		auditLog.UserId.Should().Be(expectedUserId);
		auditLog.Details.Should().NotBeNull();
		Assert.NotNull(auditLog.Details);
		using var document = JsonDocument.Parse(auditLog.Details);
		var details = document.RootElement;

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

	private static async Task<Guid> _GetStaffAccountIdByEmailAsync(
		AppDbContext dbContext,
		string email
	) {
		var accountId = await (
			from account in dbContext.UserAccount
			where account.User.Email == email
				&& account.Scope == AccountScope.Staff
				&& !account.IsDeleted
			select account.Id
		).FirstOrDefaultAsync();

		if (accountId is null) {
			throw new InvalidOperationException("Seeded staff account was not found.");
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
