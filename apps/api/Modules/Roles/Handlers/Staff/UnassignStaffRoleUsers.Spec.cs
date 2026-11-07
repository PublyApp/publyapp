
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
using PublyApp.Api.Modules.Roles.Services;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Roles.Handlers.Staff;

public sealed class UnassignStaffRoleUsersSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public UnassignStaffRoleUsersSpec(ApiFixture fixture) {
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

	private static string _GetFindUsersUrl(string roleId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Roles.ForStaff.Root,
			Routes.Roles.ForStaff.Users.FindFn(roleId)
		);
	}

	private static string _GetUnassignUrl(string roleId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Roles.ForStaff.Root,
			Routes.Roles.ForStaff.Users.UnassignFn(roleId)
		);
	}

	// Wire value of the audit action written for every successfully unassigned
	// user (pinned here by literal so the spec cannot drift with the constant).
	private const string _StaffRoleUserUnassignedAuditAction =
		"staff.role.user.unassigned";

	private async Task<HttpResponseMessage> _UnassignAsync(
		string token,
		string roleId,
		params Guid[] userIds
	) {
		var request = new HttpRequestMessage(
			HttpMethod.Post,
			UnassignStaffRoleUsersSpec._GetUnassignUrl(roleId)
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
			UnassignStaffRoleUsersSpec._GetUnassignUrl(Guid.NewGuid().ToString())
		);
		request.Content = JsonContent.Create(new { userIds = new[] { Guid.NewGuid() } });

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task ItShouldReturnUnauthorizedWithInvalidSession() {
		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			UnassignStaffRoleUsersSpec._GetUnassignUrl(Guid.NewGuid().ToString())
		).WithSessionToken("invalid-token");
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

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			UnassignStaffRoleUsersSpec._GetUnassignUrl(Guid.NewGuid().ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { userIds = new[] { Guid.NewGuid() } });

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForStaffWithoutPermission() {
		var token = await this._CreateUnprivilegedStaffUserTokenAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			UnassignStaffRoleUsersSpec._GetUnassignUrl(Guid.NewGuid().ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { userIds = new[] { Guid.NewGuid() } });

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForMalformedRoleId() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			UnassignStaffRoleUsersSpec._GetUnassignUrl("not-a-guid")
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { userIds = new[] { Guid.NewGuid() } });

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
	}

	[Fact]
	public async Task ItShouldReturnUnprocessableEntityWhenTooManyUserIdsAreSubmitted() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		// Validator caps the array at 100 (BULK_ACTION_MAX_COUNT parity with the
		// selection UI); 101 valid GUIDs must trip maxCount with a 422.
		var userIds = Enumerable.Range(0, 101)
			.Select(_ => Guid.NewGuid())
			.ToArray();

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			UnassignStaffRoleUsersSpec._GetUnassignUrl(Guid.NewGuid().ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { userIds });

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);

		var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.Errors.Values
			.SelectMany(errors => errors)
			.Should()
			.Contain(error =>
				error.Contains("Maximum 100", StringComparison.OrdinalIgnoreCase)
			);
	}

	[Fact]
	public async Task ItShouldReturnValidationProblemWhenUserIdListIsEmpty() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			UnassignStaffRoleUsersSpec._GetUnassignUrl(Guid.NewGuid().ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { userIds = Array.Empty<string>() });

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);

		var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.RequestBodyValidationFailed);
	}

	// Round-2 hardening (PR #1413 review MEDIUM): one malformed element must
	// yield a 422 naming the offending value in plain words — never a 500 —
	// independently of the validator's rule ordering. The validator still owns
	// empty/>max; the handler's non-throwing parse owns the per-element cause.
	[Fact]
	public async Task ItShouldReturnValidationProblemNamingTheOffendingElementWhenAUserIdIsMalformed() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			UnassignStaffRoleUsersSpec._GetUnassignUrl(Guid.NewGuid().ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new {
			userIds = new[] { Guid.NewGuid().ToString(), "not-a-guid" },
		});

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);

		var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.RequestBodyValidationFailed);
		problem.Errors.Values
			.SelectMany(errors => errors)
			.Should()
			.Contain(error => error.Contains("'not-a-guid'", StringComparison.Ordinal));
	}

	[Fact]
	public async Task ItShouldReturnNotFoundForUnknownRole() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var adminUserId = await this._GetStaffUserIdFromDbAsync(TestConstants.StaffAdminEmail);

		using var response = await this._UnassignAsync(token, Guid.NewGuid().ToString(), adminUserId);
		response.StatusCode.Should().Be(HttpStatusCode.NotFound);

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
	}

	[Fact]
	public async Task ItShouldUnassignUsersAndReportCountsOnHappyPath() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();

		// Create a staff role and assign the seeded staff admin user to it.
		var roleId = await this._CreateStaffRoleAsync(
			token,
			"Bulk Unassign Happy " + Guid.NewGuid().ToString("N")[..8],
			emails: [TestConstants.StaffAdminEmail]
		);
		var adminUserId = await this._GetStaffUserIdFromDbAsync(TestConstants.StaffAdminEmail);

		// Sanity: the user should appear in the role users list.
		(await this._FindUserIdsAsync(token, roleId))
			.Should()
			.Contain(adminUserId.ToString());

		using var response = await this._UnassignAsync(token, roleId, adminUserId);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<BulkStaffRoleUserUnassignResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.SucceededCount.Should().Be(1);
		result.FailedCount.Should().Be(0);
		result.FailedItems.Should().BeEmpty();

		// The user should no longer appear in the role users list.
		(await this._FindUserIdsAsync(token, roleId))
			.Should()
			.NotContain(adminUserId.ToString());

		// One audit row per succeeded user id.
		(await this._HasAuditRowAsync(adminUserId)).Should().BeTrue();
	}

	[Fact]
	public async Task ItShouldReportPerUserSkipReasonsOnMixedUnassign() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();

		var roleId = await this._CreateStaffRoleAsync(
			token,
			"Bulk Unassign Mixed " + Guid.NewGuid().ToString("N")[..8],
			emails: [TestConstants.StaffAdminEmail]
		);
		var assignedUserId = await this._GetStaffUserIdFromDbAsync(TestConstants.StaffAdminEmail);

		// A second staff user who IS assigned, one who is NOT assigned, and one
		// id that does not exist at all.
		var secondAssignedUserId = await this._SeedActiveStaffUserAsync(
			$"bulk-unassign-assigned-{Guid.NewGuid():N}@example.com"
		);
		await this._AttachStaffUserToRoleAsync(Guid.Parse(roleId), secondAssignedUserId);
		var unassignedUserId = await this._SeedActiveStaffUserAsync(
			$"bulk-unassign-detached-{Guid.NewGuid():N}@example.com"
		);
		var missingUserId = Guid.NewGuid();

		using var response = await this._UnassignAsync(
			token,
			roleId,
			assignedUserId,
			secondAssignedUserId,
			unassignedUserId,
			missingUserId
		);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<BulkStaffRoleUserUnassignResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.SucceededCount.Should().Be(2);
		result.FailedCount.Should().Be(2);

		// Skip reasons are reported per id, in requested order, in plain words.
		result.FailedItems.Should().HaveCount(2);
		result.FailedItems[0].UserId.Should().Be(unassignedUserId);
		result.FailedItems[0].Reason.Should().Be("not_assigned");
		result.FailedItems[1].UserId.Should().Be(missingUserId);
		result.FailedItems[1].Reason.Should().Be("not_found");

		(await this._FindUserIdsAsync(token, roleId))
			.Should()
			.NotContain(assignedUserId.ToString())
			.And.NotContain(secondAssignedUserId.ToString());

		(await this._HasAuditRowAsync(assignedUserId)).Should().BeTrue();
		(await this._HasAuditRowAsync(secondAssignedUserId)).Should().BeTrue();
		(await this._HasAuditRowAsync(unassignedUserId)).Should().BeFalse();
		(await this._HasAuditRowAsync(missingUserId)).Should().BeFalse();
	}

	[Fact]
	public async Task ItShouldDedupeDuplicateUserIdsBeforeUnassign() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();

		var roleId = await this._CreateStaffRoleAsync(
			token,
			"Bulk Unassign Dedupe " + Guid.NewGuid().ToString("N")[..8],
			emails: [TestConstants.StaffAdminEmail]
		);
		var adminUserId = await this._GetStaffUserIdFromDbAsync(TestConstants.StaffAdminEmail);

		using var response = await this._UnassignAsync(token, roleId, adminUserId, adminUserId);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<BulkStaffRoleUserUnassignResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.SucceededCount.Should().Be(1);
		result.FailedCount.Should().Be(0);

		// Only one audit-log row despite the duplicated id.
		(await this._CountAuditRowsAsync(adminUserId)).Should().Be(1);
	}

	[Fact]
	public async Task ItShouldRefuseToStripTheLastStaffFullAccessHolder() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();

		// Request every active holder in one call, which is exactly the condition the
		// staff last-admin invariant guards: stripping the full-access role from all of them.
		Guid fullAccessRoleId;
		List<Guid> holderUserIds;
		await using (var scope = this._Fixture.Factory.Services.CreateAsyncScope()) {
			var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
			fullAccessRoleId = await FullAccessRoleTestHelper.EnsureStaffRoleAsync(dbContext);
			holderUserIds = await FullAccessRoleQueries.ActiveStaffFullAccessAccounts(dbContext)
				.Select(account => account.UserId)
				.ToListAsync();
		}
		holderUserIds.Should().NotBeEmpty("the seed leaves at least the staff owner");

		using var response = await this._UnassignAsync(
			token,
			fullAccessRoleId.ToString(),
			[.. holderUserIds]
		);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<BulkStaffRoleUserUnassignResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.SucceededCount.Should().Be(0);
		result.FailedCount.Should().Be(holderUserIds.Count);
		result.FailedItems.Should().OnlyContain(item => item.Reason == "last_full_access");

		// The staff last-admin invariant: every holder keeps the role.
		var remainingUserIds = await this._FindUserIdsAsync(token, fullAccessRoleId.ToString());
		remainingUserIds.Should().Contain(holderUserIds.Select(id => id.ToString()));
	}

	private async Task<string> _CreateStaffRoleAsync(
		string token,
		string name,
		string[] emails
	) {
		using var request = new HttpRequestMessage(HttpMethod.Post, UnassignStaffRoleUsersSpec._GetCreateRoleUrl())
			.WithSessionToken(token);
		request.Content = JsonContent.Create(
			new {
				name,
				description = "Test role for UnassignStaffRoleUsersSpec",
				permissions = new[] { AppPermissions.Staff.Roles.GET_FOR_STAFF.Key },
				emails,
			}
		);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Created);

		var body = await response.Content.ReadFromJsonAsync<StaffRoleCreated>();
		body.Should().NotBeNull();
		Assert.NotNull(body);
		body.RoleId.Should().NotBe(Guid.Empty);

		return body.RoleId.ToString();
	}

	private async Task<Guid> _GetStaffUserIdFromDbAsync(string email) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var user = await dbContext.User
			.Where(u => u.Email == email)
			.FirstAsync();
		return user.GetRequiredId();
	}

	private async Task<Guid> _SeedActiveStaffUserAsync(string email) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var user = new User {
			Email = email,
			Password = PasswordUtils.HashPassword(TestConstants.SeedPassword),
			FirstName = "Bulk",
			LastName = "Unassign",
			IsVerified = true,
			Status = UserStatus.Active,
		};
		_ = dbContext.User.Add(user);
		_ = await dbContext.SaveChangesAsync();

		var staffAccount = UserAccount.CreateStaffAccount(user.GetRequiredId());
		staffAccount.ValidateAccountType();
		_ = dbContext.UserAccount.Add(staffAccount);
		_ = await dbContext.SaveChangesAsync();

		return user.GetRequiredId();
	}

	private async Task _AttachStaffUserToRoleAsync(Guid roleId, Guid userId) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var staffAccount = await dbContext.UserAccount
			.Where(a => a.UserId == userId)
			.FirstAsync();

		await dbContext.UserAccountRole.AddAsync(new UserAccountRole {
			UserAccountId = staffAccount.GetRequiredId(),
			RoleId = roleId,
		});
		await dbContext.SaveChangesAsync();
	}

	private async Task<bool> _HasAuditRowAsync(Guid userId) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		return await dbContext.AuditLog.AnyAsync(log =>
			log.TargetId == userId
			&& log.Action == UnassignStaffRoleUsersSpec._StaffRoleUserUnassignedAuditAction
		);
	}

	private async Task<int> _CountAuditRowsAsync(Guid userId) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		return await dbContext.AuditLog
			.Where(log =>
				log.TargetId == userId
				&& log.Action == UnassignStaffRoleUsersSpec._StaffRoleUserUnassignedAuditAction
			)
			.CountAsync();
	}

	private async Task<List<string>> _FindUserIdsAsync(string token, string roleId) {
		var url = UnassignStaffRoleUsersSpec._GetFindUsersUrl(roleId) + "?page=1&limit=50&sort_id=created_at&sort_order=desc";
		using var request = new HttpRequestMessage(HttpMethod.Get, url).WithSessionToken(token);
		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<FindStaffRoleUsersResult>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		return result.Users.Select(u => u.Id.ToString()).ToList();
	}

	private async Task<string> _CreateUnprivilegedStaffUserTokenAsync() {
		var email = $"no-perms-{Guid.NewGuid():N}@example.com";

		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var user = new User {
			Email = email,
			Password = PasswordUtils.HashPassword(TestConstants.SeedPassword),
			FirstName = "NoPerm",
			LastName = "User",
			IsVerified = true,
			Status = UserStatus.Active,
		};

		_ = dbContext.User.Add(user);
		_ = await dbContext.SaveChangesAsync();

		var userId = user.GetRequiredId();
		var staffAccount = UserAccount.CreateStaffAccount(userId);
		staffAccount.ValidateAccountType();
		_ = dbContext.UserAccount.Add(staffAccount);
		_ = await dbContext.SaveChangesAsync();

		return await this._AuthClient.LoginAsync(email, TestConstants.SeedPassword);
	}

	// Local test response types for the partial-success bulk contract:
	private sealed record BulkStaffRoleUserUnassignResponse {
		public int SucceededCount { get; init; }
		public int FailedCount { get; init; }
		public List<BulkStaffRoleUserUnassignFailedItemResponse> FailedItems { get; init; } =
			[];
	}

	private sealed record BulkStaffRoleUserUnassignFailedItemResponse {
		public Guid UserId { get; init; }
		public string Reason { get; init; } = string.Empty;
	}
}
