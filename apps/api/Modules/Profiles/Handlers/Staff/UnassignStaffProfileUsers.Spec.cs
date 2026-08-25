
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
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Profiles.Handlers.Staff;

public sealed class UnassignStaffProfileUsersSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public UnassignStaffProfileUsersSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	private static string GetCreateProfileUrl() {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Profiles.ForStaff.Root,
			Routes.Profiles.ForStaff.Create
		);
	}

	private static string GetFindUsersUrl(string profileId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Profiles.ForStaff.Root,
			Routes.Profiles.ForStaff.Users.FindFn(profileId)
		);
	}

	private static string GetUnassignUrl(string profileId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Profiles.ForStaff.Root,
			Routes.Profiles.ForStaff.Users.UnassignFn(profileId)
		);
	}

	// Wire value of the audit action written for every successfully unassigned
	// user (pinned here by literal so the spec cannot drift with the constant).
	private const string StaffProfileUserUnassignedAuditAction =
		"staff.profile.user.unassigned";

	private async Task<HttpResponseMessage> UnassignAsync(
		string token,
		string profileId,
		params Guid[] userIds
	) {
		var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetUnassignUrl(profileId)
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new {
			userIds = userIds.Select(id => id.ToString()).ToArray(),
		});

		return await _http.SendAsync(request);
	}

	[Fact]
	public async Task ItShouldReturnUnauthorizedWithoutSession() {
		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetUnassignUrl(Guid.NewGuid().ToString())
		);
		request.Content = JsonContent.Create(new { userIds = new[] { Guid.NewGuid() } });

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task ItShouldReturnUnauthorizedWithInvalidSession() {
		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetUnassignUrl(Guid.NewGuid().ToString())
		).WithSessionToken("invalid-token");
		request.Content = JsonContent.Create(new { userIds = new[] { Guid.NewGuid() } });

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForTenantUser() {
		var token = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetUnassignUrl(Guid.NewGuid().ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { userIds = new[] { Guid.NewGuid() } });

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForStaffWithoutPermission() {
		var token = await CreateUnprivilegedStaffUserTokenAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetUnassignUrl(Guid.NewGuid().ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { userIds = new[] { Guid.NewGuid() } });

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForMalformedProfileId() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetUnassignUrl("not-a-guid")
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { userIds = new[] { Guid.NewGuid() } });

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
	}

	[Fact]
	public async Task ItShouldReturnUnprocessableEntityWhenTooManyUserIdsAreSubmitted() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		// Validator caps the array at 100 (BULK_ACTION_MAX_COUNT parity with the
		// selection UI); 101 valid GUIDs must trip maxCount with a 422.
		var userIds = Enumerable.Range(0, 101)
			.Select(_ => Guid.NewGuid())
			.ToArray();

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetUnassignUrl(Guid.NewGuid().ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { userIds });

		using var response = await _http.SendAsync(request);
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
		var token = await _authClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetUnassignUrl(Guid.NewGuid().ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { userIds = Array.Empty<string>() });

		using var response = await _http.SendAsync(request);
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
		var token = await _authClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetUnassignUrl(Guid.NewGuid().ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new {
			userIds = new[] { Guid.NewGuid().ToString(), "not-a-guid" },
		});

		using var response = await _http.SendAsync(request);
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
	public async Task ItShouldReturnNotFoundForUnknownProfile() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var adminUserId = await GetStaffUserIdFromDbAsync(TestConstants.StaffAdminEmail);

		using var response = await UnassignAsync(token, Guid.NewGuid().ToString(), adminUserId);
		response.StatusCode.Should().Be(HttpStatusCode.NotFound);

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
	}

	[Fact]
	public async Task ItShouldUnassignUsersAndReportCountsOnHappyPath() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		// Create a staff profile and assign the seeded staff admin user to it.
		var profileId = await CreateStaffProfileAsync(
			token,
			"Bulk Unassign Happy " + Guid.NewGuid().ToString("N")[..8],
			emails: [TestConstants.StaffAdminEmail]
		);
		var adminUserId = await GetStaffUserIdFromDbAsync(TestConstants.StaffAdminEmail);

		// Sanity: the user should appear in the profile users list.
		(await FindUserIdsAsync(token, profileId))
			.Should()
			.Contain(adminUserId.ToString());

		using var response = await UnassignAsync(token, profileId, adminUserId);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<BulkStaffProfileUserUnassignResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.SucceededCount.Should().Be(1);
		result.FailedCount.Should().Be(0);
		result.FailedItems.Should().BeEmpty();

		// The user should no longer appear in the profile users list.
		(await FindUserIdsAsync(token, profileId))
			.Should()
			.NotContain(adminUserId.ToString());

		// One audit row per succeeded user id.
		(await HasAuditRowAsync(adminUserId)).Should().BeTrue();
	}

	[Fact]
	public async Task ItShouldReportPerUserSkipReasonsOnMixedUnassign() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		var profileId = await CreateStaffProfileAsync(
			token,
			"Bulk Unassign Mixed " + Guid.NewGuid().ToString("N")[..8],
			emails: [TestConstants.StaffAdminEmail]
		);
		var assignedUserId = await GetStaffUserIdFromDbAsync(TestConstants.StaffAdminEmail);

		// A second staff user who IS assigned, one who is NOT assigned, and one
		// id that does not exist at all.
		var secondAssignedUserId = await SeedActiveStaffUserAsync(
			$"bulk-unassign-assigned-{Guid.NewGuid():N}@example.com"
		);
		await AttachStaffUserToProfileAsync(Guid.Parse(profileId), secondAssignedUserId);
		var unassignedUserId = await SeedActiveStaffUserAsync(
			$"bulk-unassign-detached-{Guid.NewGuid():N}@example.com"
		);
		var missingUserId = Guid.NewGuid();

		using var response = await UnassignAsync(
			token,
			profileId,
			assignedUserId,
			secondAssignedUserId,
			unassignedUserId,
			missingUserId
		);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<BulkStaffProfileUserUnassignResponse>();
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

		(await FindUserIdsAsync(token, profileId))
			.Should()
			.NotContain(assignedUserId.ToString())
			.And.NotContain(secondAssignedUserId.ToString());

		(await HasAuditRowAsync(assignedUserId)).Should().BeTrue();
		(await HasAuditRowAsync(secondAssignedUserId)).Should().BeTrue();
		(await HasAuditRowAsync(unassignedUserId)).Should().BeFalse();
		(await HasAuditRowAsync(missingUserId)).Should().BeFalse();
	}

	[Fact]
	public async Task ItShouldDedupeDuplicateUserIdsBeforeUnassign() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		var profileId = await CreateStaffProfileAsync(
			token,
			"Bulk Unassign Dedupe " + Guid.NewGuid().ToString("N")[..8],
			emails: [TestConstants.StaffAdminEmail]
		);
		var adminUserId = await GetStaffUserIdFromDbAsync(TestConstants.StaffAdminEmail);

		using var response = await UnassignAsync(token, profileId, adminUserId, adminUserId);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<BulkStaffProfileUserUnassignResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.SucceededCount.Should().Be(1);
		result.FailedCount.Should().Be(0);

		// Only one audit-log row despite the duplicated id.
		(await CountAuditRowsAsync(adminUserId)).Should().Be(1);
	}
	private async Task<string> CreateStaffProfileAsync(
		string token,
		string name,
		string[] emails
	) {
		using var request = new HttpRequestMessage(HttpMethod.Post, GetCreateProfileUrl())
			.WithSessionToken(token);
		request.Content = JsonContent.Create(
			new {
				name,
				description = "Test profile for UnassignStaffProfileUsersSpec",
				permissions = new[] { AppPermissions.Staff.Profiles.GET_FOR_STAFF.Key },
				emails,
			}
		);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Created);

		var body = await response.Content.ReadFromJsonAsync<StaffProfileCreated>();
		body.Should().NotBeNull();
		Assert.NotNull(body);
		body.ProfileId.Should().NotBe(Guid.Empty);

		return body.ProfileId.ToString();
	}

	private async Task<Guid> GetStaffUserIdFromDbAsync(string email) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var user = await dbContext.User
			.Where(u => u.Email == email)
			.FirstAsync();
		return user.GetRequiredId();
	}

	private async Task<Guid> SeedActiveStaffUserAsync(string email) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
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

		var staffAccount = UserAccount.CreateStaffAccount(user.GetRequiredId(), AccountLevel.User);
		staffAccount.ValidateAccountType();
		_ = dbContext.UserAccount.Add(staffAccount);
		_ = await dbContext.SaveChangesAsync();

		return user.GetRequiredId();
	}

	private async Task AttachStaffUserToProfileAsync(Guid profileId, Guid userId) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var staffAccount = await dbContext.UserAccount
			.Where(a => a.UserId == userId)
			.FirstAsync();

		await dbContext.UserAccountProfile.AddAsync(new UserAccountProfile {
			UserAccountId = staffAccount.GetRequiredId(),
			ProfileId = profileId,
		});
		await dbContext.SaveChangesAsync();
	}

	private async Task<bool> HasAuditRowAsync(Guid userId) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		return await dbContext.AuditLog.AnyAsync(log =>
			log.TargetId == userId
			&& log.Action == StaffProfileUserUnassignedAuditAction
		);
	}

	private async Task<int> CountAuditRowsAsync(Guid userId) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		return await dbContext.AuditLog
			.Where(log =>
				log.TargetId == userId
				&& log.Action == StaffProfileUserUnassignedAuditAction
			)
			.CountAsync();
	}

	private async Task<List<string>> FindUserIdsAsync(string token, string profileId) {
		var url = GetFindUsersUrl(profileId) + "?page=1&limit=50&sort_id=created_at&sort_order=desc";
		using var request = new HttpRequestMessage(HttpMethod.Get, url).WithSessionToken(token);
		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<FindStaffProfileUsersResult>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		return result.Users.Select(u => u.Id.ToString()).ToList();
	}

	private async Task<string> CreateUnprivilegedStaffUserTokenAsync() {
		var email = $"no-perms-{Guid.NewGuid():N}@example.com";

		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
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
		var staffAccount = UserAccount.CreateStaffAccount(userId, AccountLevel.User);
		staffAccount.ValidateAccountType();
		_ = dbContext.UserAccount.Add(staffAccount);
		_ = await dbContext.SaveChangesAsync();

		return await _authClient.LoginAsync(email, TestConstants.SeedPassword);
	}

	// Local test response types for the partial-success bulk contract:
	private sealed record BulkStaffProfileUserUnassignResponse {
		public int SucceededCount { get; init; }
		public int FailedCount { get; init; }
		public List<BulkStaffProfileUserUnassignFailedItemResponse> FailedItems { get; init; } =
			[];
	}

	private sealed record BulkStaffProfileUserUnassignFailedItemResponse {
		public Guid UserId { get; init; }
		public string Reason { get; init; } = string.Empty;
	}
}
