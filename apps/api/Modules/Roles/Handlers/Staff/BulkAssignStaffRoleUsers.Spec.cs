
using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Auth.Utils;
using PublyApp.Api.Modules.Permissions.Entities;
using PublyApp.Api.Modules.Roles.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Roles.Handlers.Staff;

public sealed class BulkAssignStaffRoleUsersSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public BulkAssignStaffRoleUsersSpec(ApiFixture fixture) {
		this._Fixture = fixture;
		this._Http = fixture.HttpClient;
		this._AuthClient = new TestAuthClient(this._Http);
	}

	// Wire value of the audit action written for every user newly given the
	// role (pinned by literal so the spec cannot drift with the constant).
	private const string _StaffRoleUserAssignedAuditAction = "staff.role.user.assigned";

	private static string _GetAssignUrl(string roleId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Roles.ForStaff.Root,
			Routes.Roles.ForStaff.Users.AssignFn(roleId)
		);
	}

	private static string _GetFindUsersUrl(string roleId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Roles.ForStaff.Root,
			Routes.Roles.ForStaff.Users.FindFn(roleId)
		);
	}

	private async Task<HttpResponseMessage> _AssignAsync(
		string token,
		string roleId,
		params Guid[] userIds
	) {
		var request = new HttpRequestMessage(
			HttpMethod.Post,
			BulkAssignStaffRoleUsersSpec._GetAssignUrl(roleId)
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new {
			userIds = userIds.Select(id => id.ToString()).ToArray(),
		});

		return await this._Http.SendAsync(request);
	}

	[Fact]
	public async Task ItShouldReturnUnauthorizedWithoutSession() {
		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			BulkAssignStaffRoleUsersSpec._GetAssignUrl(Guid.NewGuid().ToString())
		);
		request.Content = JsonContent.Create(new { userIds = new[] { Guid.NewGuid() } });

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForTenantUser() {
		var token = await this._AuthClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		using var response = await this._AssignAsync(token, Guid.NewGuid().ToString(), Guid.NewGuid());
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForStaffWithoutPermission() {
		var (token, _) = await this._SeedActorAsync();
		var roleId = await this._SeedStaffRoleAsync();

		using var response = await this._AssignAsync(token, roleId.ToString(), Guid.NewGuid());
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForMalformedRoleId() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();

		using var response = await this._AssignAsync(token, "not-a-guid", Guid.NewGuid());
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
	}

	[Fact]
	public async Task ItShouldReturnValidationProblemWhenUserIdListIsEmpty() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();

		using var response = await this._AssignAsync(token, Guid.NewGuid().ToString());
		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);

		var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.RequestBodyValidationFailed);
	}

	[Fact]
	public async Task ItShouldReturnUnprocessableEntityWhenTooManyUserIdsAreSubmitted() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var userIds = Enumerable.Range(0, 101).Select(_ => Guid.NewGuid()).ToArray();

		using var response = await this._AssignAsync(token, Guid.NewGuid().ToString(), userIds);
		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
	}

	[Fact]
	public async Task ItShouldReturnNotFoundForUnknownRole() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();

		using var response = await this._AssignAsync(token, Guid.NewGuid().ToString(), Guid.NewGuid());
		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task ItShouldReturnNotFoundForATenantRole() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		Guid tenantRoleId;
		await using (var scope = this._Fixture.Factory.Services.CreateAsyncScope()) {
			var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
			tenantRoleId = await dbContext.Role
				.Where(role => role.Scope == RoleScope.Tenant && !role.IsDeleted)
				.Select(role => role.Id ?? Guid.Empty)
				.FirstAsync();
		}

		using var response = await this._AssignAsync(token, tenantRoleId.ToString(), Guid.NewGuid());
		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task ItShouldAssignUsersReportCountsAndAuditEachOne() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var roleId = await this._SeedStaffRoleAsync();
		var firstId = await this._SeedStaffUserAsync();
		var secondId = await this._SeedStaffUserAsync();

		using var response = await this._AssignAsync(token, roleId.ToString(), firstId, secondId);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<BulkAssignResponse>();
		Assert.NotNull(result);
		result.SucceededCount.Should().Be(2);
		result.FailedCount.Should().Be(0);
		result.FailedItems.Should().BeEmpty();

		(await this._FindUserIdsAsync(token, roleId.ToString()))
			.Should().Contain([firstId.ToString(), secondId.ToString()]);
		(await this._CountAuditRowsAsync(firstId, roleId)).Should().Be(1);
		(await this._CountAuditRowsAsync(secondId, roleId)).Should().Be(1);
	}

	[Fact]
	public async Task ItShouldReportPerUserSkipReasonsOnMixedAssign() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var roleId = await this._SeedStaffRoleAsync();
		var newId = await this._SeedStaffUserAsync();
		var alreadyId = await this._SeedStaffUserAsync();
		await this._AttachAsync(alreadyId, roleId);
		var missingId = Guid.NewGuid();

		using var response = await this._AssignAsync(token, roleId.ToString(), newId, alreadyId, missingId);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<BulkAssignResponse>();
		Assert.NotNull(result);
		result.SucceededCount.Should().Be(1);
		result.FailedCount.Should().Be(2);
		result.FailedItems.Should().HaveCount(2);
		result.FailedItems[0].UserId.Should().Be(alreadyId);
		result.FailedItems[0].Reason.Should().Be("already_assigned");
		result.FailedItems[1].UserId.Should().Be(missingId);
		result.FailedItems[1].Reason.Should().Be("not_found");

		// Only the member who actually changed is audited.
		(await this._CountAuditRowsAsync(newId, roleId)).Should().Be(1);
		(await this._CountAuditRowsAsync(alreadyId, roleId)).Should().Be(0);
		(await this._CountAuditRowsAsync(missingId, roleId)).Should().Be(0);
	}

	[Fact]
	public async Task ItShouldBeIdempotentWhenTheSameRequestIsRepeated() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var roleId = await this._SeedStaffRoleAsync();
		var userId = await this._SeedStaffUserAsync();

		using (var first = await this._AssignAsync(token, roleId.ToString(), userId)) {
			first.StatusCode.Should().Be(HttpStatusCode.OK);
		}

		using var second = await this._AssignAsync(token, roleId.ToString(), userId);
		second.StatusCode.Should().Be(HttpStatusCode.OK);
		var result = await second.Content.ReadFromJsonAsync<BulkAssignResponse>();
		Assert.NotNull(result);
		result.SucceededCount.Should().Be(0);
		result.FailedItems.Should().ContainSingle()
			.Which.Reason.Should().Be("already_assigned");

		// One junction row, one audit row: the repeat changed nothing.
		(await this._CountLinksAsync(userId, roleId)).Should().Be(1);
		(await this._CountAuditRowsAsync(userId, roleId)).Should().Be(1);
	}

	[Fact]
	public async Task ItShouldStayIdempotentWhenTheSameAssignRacesItself() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var roleId = await this._SeedStaffRoleAsync();
		var userId = await this._SeedStaffUserAsync();

		var responses = await Task.WhenAll(
			Enumerable.Range(0, 4).Select(_ => this._AssignAsync(token, roleId.ToString(), userId))
		);

		foreach (var response in responses) {
			using (response) {
				// A lost race is reported as already assigned, never a 500.
				response.StatusCode.Should().Be(HttpStatusCode.OK);
			}
		}

		(await this._CountLinksAsync(userId, roleId)).Should().Be(1);
		(await this._CountAuditRowsAsync(userId, roleId)).Should().Be(1);
	}

	[Fact]
	public async Task ItShouldDedupeDuplicateUserIds() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var roleId = await this._SeedStaffRoleAsync();
		var userId = await this._SeedStaffUserAsync();

		using var response = await this._AssignAsync(token, roleId.ToString(), userId, userId);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<BulkAssignResponse>();
		Assert.NotNull(result);
		result.SucceededCount.Should().Be(1);
		result.FailedCount.Should().Be(0);
		(await this._CountAuditRowsAsync(userId, roleId)).Should().Be(1);
	}

	[Fact]
	public async Task ItShouldAssignToASuspendedStaffUser() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var roleId = await this._SeedStaffRoleAsync();
		var userId = await this._SeedStaffUserAsync(UserStatus.Suspended);

		using var response = await this._AssignAsync(token, roleId.ToString(), userId);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<BulkAssignResponse>();
		Assert.NotNull(result);
		result.SucceededCount.Should().Be(1);
	}

	[Fact]
	public async Task ItShouldRefuseAUserWhoWouldExceedTheMaxRolesPerMember() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var roleId = await this._SeedStaffRoleAsync();
		var fullUserId = await this._SeedStaffUserAsync();
		var roomUserId = await this._SeedStaffUserAsync();
		var max = AppEnvironment.Instance.MAX_ROLES_PER_USER;
		for (var i = 0; i < max; i++) {
			await this._AttachAsync(fullUserId, await this._SeedStaffRoleAsync());
		}

		using var response = await this._AssignAsync(token, roleId.ToString(), fullUserId, roomUserId);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<BulkAssignResponse>();
		Assert.NotNull(result);
		result.SucceededCount.Should().Be(1);
		result.FailedItems.Should().ContainSingle()
			.Which.Should().Match<BulkAssignFailedItem>(item =>
				item.UserId == fullUserId && item.Reason == "max_roles_exceeded");
		(await this._CountLinksAsync(fullUserId, roleId)).Should().Be(0);
		(await this._CountLinksAsync(roomUserId, roleId)).Should().Be(1);
	}

	[Fact]
	public async Task ItShouldRefuseToHandOutTheFullAccessRoleWithoutHoldingIt() {
		// The actor holds exactly the route permission, so a 403 can only come from
		// the full-access assignment guard (self-grant of every permission).
		var (token, actorId) = await this._SeedActorAsync(AppPermissions.Staff.Roles.UPDATE_FOR_STAFF);
		var fullAccessRoleId = await this._GetFullAccessRoleIdAsync();

		using var response = await this._AssignAsync(token, fullAccessRoleId.ToString(), actorId);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.Forbidden);
		(await this._CountLinksAsync(actorId, fullAccessRoleId)).Should().Be(0);
	}

	[Fact]
	public async Task ItShouldAllowAFullAccessActorToHandOutTheFullAccessRole() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var fullAccessRoleId = await this._GetFullAccessRoleIdAsync();
		var userId = await this._SeedStaffUserAsync();

		using var response = await this._AssignAsync(token, fullAccessRoleId.ToString(), userId);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<BulkAssignResponse>();
		Assert.NotNull(result);
		result.SucceededCount.Should().Be(1);
		(await this._CountLinksAsync(userId, fullAccessRoleId)).Should().Be(1);
	}

	private async Task<Guid> _GetFullAccessRoleIdAsync() {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		return await FullAccessRoleTestHelper.EnsureStaffRoleAsync(dbContext);
	}

	private async Task<Guid> _SeedStaffRoleAsync() {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var role = Role.CreateStaffRole($"Bulk Assign {Guid.NewGuid():N}");
		role.ValidateRoleType();
		_ = dbContext.Role.Add(role);
		_ = await dbContext.SaveChangesAsync();
		return role.GetRequiredId();
	}

	private async Task<Guid> _SeedStaffUserAsync(UserStatus status = UserStatus.Active) {
		return await StaffUserTestHelper.SeedStaffUserAsync(
			this._Fixture,
			$"bulk-assign-{Guid.NewGuid():N}@example.com",
			status: status
		);
	}

	private async Task _AttachAsync(Guid userId, Guid roleId) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var account = await dbContext.UserAccount.FirstAsync(a =>
			a.UserId == userId && a.Scope == AccountScope.Staff
		);
		_ = dbContext.UserAccountRole.Add(new UserAccountRole {
			UserAccountId = account.GetRequiredId(),
			RoleId = roleId,
		});
		_ = await dbContext.SaveChangesAsync();
	}

	private async Task<int> _CountLinksAsync(Guid userId, Guid roleId) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		return await (
			from uap in dbContext.UserAccountRole
			join ua in dbContext.UserAccount on uap.UserAccountId equals ua.Id
			where ua.UserId == userId && uap.RoleId == roleId
			select uap
		).CountAsync();
	}

	private async Task<int> _CountAuditRowsAsync(Guid userId, Guid roleId) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		return await dbContext.AuditLog
			.Where(log =>
				log.TargetId == userId
				&& log.Action == BulkAssignStaffRoleUsersSpec._StaffRoleUserAssignedAuditAction
				&& log.Details != null
				&& log.Details.Contains(roleId.ToString())
			)
			.CountAsync();
	}

	private async Task<List<string>> _FindUserIdsAsync(string token, string roleId) {
		var url = BulkAssignStaffRoleUsersSpec._GetFindUsersUrl(roleId)
			+ "?page=1&limit=50&sort_id=created_at&sort_order=desc";
		using var request = new HttpRequestMessage(HttpMethod.Get, url).WithSessionToken(token);
		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<FindRoleUsersResponse>();
		Assert.NotNull(result);
		return result.Users.Select(u => u.Id.ToString()).ToList();
	}

	private async Task<(string Token, Guid UserId)> _SeedActorAsync(params Permission[] permissions) {
		var email = $"bulk-assign-actor-{Guid.NewGuid():N}@example.com";

		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var user = new User {
			Email = email,
			Password = PasswordUtils.HashPassword(TestConstants.SeedPassword),
			FirstName = "Bulk",
			LastName = "Actor",
			IsVerified = true,
			Status = UserStatus.Active,
		};
		_ = dbContext.User.Add(user);
		_ = await dbContext.SaveChangesAsync();

		var account = UserAccount.CreateStaffAccount(user.GetRequiredId());
		account.ValidateAccountType();
		_ = dbContext.UserAccount.Add(account);
		_ = await dbContext.SaveChangesAsync();

		if (permissions.Length > 0) {
			var role = Role.CreateStaffRole($"bulk-assign-actor-role-{Guid.NewGuid():N}");
			role.ValidateRoleType();
			_ = dbContext.Role.Add(role);
			_ = await dbContext.SaveChangesAsync();

			foreach (var permission in permissions) {
				_ = dbContext.RolePermission.Add(new RolePermission {
					RoleId = role.GetRequiredId(),
					PermissionKey = permission.Key,
				});
			}
			_ = dbContext.UserAccountRole.Add(new UserAccountRole {
				UserAccountId = account.GetRequiredId(),
				RoleId = role.GetRequiredId(),
			});
			_ = await dbContext.SaveChangesAsync();
		}

		var token = await this._AuthClient.LoginAsync(email, TestConstants.SeedPassword);
		return (token, user.GetRequiredId());
	}

	private sealed record BulkAssignResponse {
		public int SucceededCount { get; init; }
		public int FailedCount { get; init; }
		public List<BulkAssignFailedItem> FailedItems { get; init; } = [];
	}

	private sealed record BulkAssignFailedItem {
		public Guid UserId { get; init; }
		public string Reason { get; init; } = string.Empty;
	}

	private sealed record FindRoleUsersResponse {
		public List<RoleUserItem> Users { get; init; } = [];
	}

	private sealed record RoleUserItem {
		public Guid Id { get; init; }
	}
}
