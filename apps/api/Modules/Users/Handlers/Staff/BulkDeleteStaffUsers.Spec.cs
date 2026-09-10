using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

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
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Users.Handlers.Staff;

public sealed class BulkDeleteStaffUsersSpec : IClassFixture<ApiFixture> {
	private const string _BulkDeleteRoute = "/bulk-delete";

	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public BulkDeleteStaffUsersSpec(ApiFixture fixture) {
		_Fixture = fixture;
		_Http = fixture.HttpClient;
		_AuthClient = new TestAuthClient(_Http);
	}

	private static string _GetBulkDeleteUrl() {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForStaff.Root,
			_BulkDeleteRoute
		);
	}

	private static string _GetSuspendUrl(string userId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForStaff.Root,
			Routes.Users.ForStaff.SuspendFn(userId)
		);
	}

	private static string _GetFindUrl() {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForStaff.Root,
			Routes.Users.ForStaff.Find
		) + "?limit=100";
	}

	private static string _GetByIdUrl(string userId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForStaff.Root,
			Routes.Users.ForStaff.GetByIdFn(userId)
		);
	}

	private static string _GetProfilesUrl(string userId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForStaff.Root,
			Routes.Users.ForStaff.Profiles.GetFn(userId)
		);
	}

	private static string _GetUpdateProfilesUrl(string userId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForStaff.Root,
			Routes.Users.ForStaff.Profiles.UpdateFn(userId)
		);
	}

	private static string _GetCreateProfileUrl() {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Profiles.ForStaff.Root,
			Routes.Profiles.ForStaff.Create
		);
	}

	[Fact]
	public async Task ItShouldPublishBulkDeleteStaffUserBodyWithRequiredUserIdsInOpenApi() {
		var openApiDocument = await _ReadOpenApiDocumentAsync();

		_AssertSchemaRequiresUserIds(
			openApiDocument,
			"BulkDeleteStaffUsersBody"
		);
	}

	[Fact]
	public async Task ItShouldReturnValidationProblemForMalformedBulkDeleteBody() {
		var staffToken = await _AuthClient.LoginAsStaffAdminAsync();

		using var response = await _BulkDeleteAsync(
			staffToken,
			["not-a-guid"]
		);

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);

		var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.RequestBodyValidationFailed);
		problem.Errors.Values
			.SelectMany(errors => errors)
			.Should()
			.Contain(error => error.Contains("valid GUID"));
	}

	[Fact]
	public async Task ItShouldReturnValidationProblemWhenBulkDeleteBodyOmitsUserIds() {
		var staffToken = await _AuthClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			_GetBulkDeleteUrl()
		).WithSessionToken(staffToken);

		request.Content = JsonContent.Create(new { });

		using var response = await _Http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);

		var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.RequestBodyValidationFailed);
		problem.Errors.Values
			.SelectMany(errors => errors)
			.Should()
			.Contain(error => error.Contains("required"));
	}

	[Fact]
	public async Task ItShouldReturnOkWhenBulkDeletingSuspendedStaffUsers() {
		var staffToken = await _AuthClient.LoginAsStaffAdminAsync();
		var firstUserId = Guid.Parse(
			await _CreateStaffUserAsync(
				staffToken,
				$"bulk-delete-first-{Guid.NewGuid():N}@example.com"
			)
		);
		var secondUserId = Guid.Parse(
			await _CreateStaffUserAsync(
				staffToken,
				$"bulk-delete-second-{Guid.NewGuid():N}@example.com"
			)
		);

		await _SuspendStaffUserAsync(staffToken, firstUserId.ToString());
		await _SuspendStaffUserAsync(staffToken, secondUserId.ToString());

		using var response = await _BulkDeleteAsync(
			staffToken,
			firstUserId,
			secondUserId
		);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<BulkStaffUserActionResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.SucceededCount.Should().Be(2);
		result.FailedCount.Should().Be(0);
		result.FailedItems.Should().BeEmpty();

		await _AssertSoftDeletedRowsAsync(firstUserId);
		await _AssertSoftDeletedRowsAsync(secondUserId);
	}

	[Fact]
	public async Task ItShouldReturnPartialSuccessWhenBulkDeleteMixesInvalidTargets() {
		var staffToken = await _AuthClient.LoginAsStaffAdminAsync();
		var suspendedUserId = Guid.Parse(
			await _CreateStaffUserAsync(
				staffToken,
				$"bulk-delete-suspended-{Guid.NewGuid():N}@example.com"
			)
		);
		var unsuspendedUserId = Guid.Parse(
			await _CreateStaffUserAsync(
				staffToken,
				$"bulk-delete-active-{Guid.NewGuid():N}@example.com"
			)
		);
		var missingUserId = Guid.NewGuid();

		await _SuspendStaffUserAsync(staffToken, suspendedUserId.ToString());

		using var response = await _BulkDeleteAsync(
			staffToken,
			suspendedUserId,
			unsuspendedUserId,
			missingUserId
		);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<BulkStaffUserActionResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.SucceededCount.Should().Be(1);
		result.FailedCount.Should().Be(2);
		result.FailedItems.Should().ContainSingle(
			item => item.UserId == unsuspendedUserId
		);
		result.FailedItems.Should().ContainSingle(
			item => item.UserId == missingUserId
		);

		await _AssertSoftDeletedRowsAsync(suspendedUserId);
		await _AssertStaffUserRemainsUndeletedAndUnsuspendedAsync(
			unsuspendedUserId
		);
	}

	[Fact]
	public async Task
	ItShouldRecordPerUserAuditOutcomesWhenBulkDeleteReusesSingleDeleteLifecycle() {
		var staffToken = await _AuthClient.LoginAsStaffAdminAsync();
		var actorUserId = await AuditLogTestHelper.GetUserIdByEmailAsync(
			_Fixture.Factory,
			TestConstants.StaffAdminEmail
		);
		var deletedUserId = await _CreateStaffUserAsync(
			staffToken,
			$"bulk-delete-audit-{Guid.NewGuid():N}@example.com"
		);
		var deletedUserIdGuid = Guid.Parse(deletedUserId);
		var firstProfileId = await _CreateStaffProfileAsync(staffToken);
		var secondProfileId = await _CreateStaffProfileAsync(staffToken);
		var unsuspendedUserId = Guid.Parse(
			await _CreateStaffUserAsync(
				staffToken,
				$"bulk-delete-audit-unsuspended-{Guid.NewGuid():N}@example.com"
			)
		);
		var missingUserId = Guid.NewGuid();

		await _AssignProfilesAsync(
			staffToken,
			deletedUserId,
			firstProfileId,
			secondProfileId
		);
		await _SuspendStaffUserAsync(staffToken, deletedUserId);

		var startedAt = DateTime.UtcNow;

		using var response = await _BulkDeleteAsync(
			staffToken,
			deletedUserIdGuid,
			unsuspendedUserId,
			missingUserId
		);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<BulkStaffUserActionResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.SucceededCount.Should().Be(1);
		result.FailedCount.Should().Be(2);

		await _AssertSoftDeletedRowsAsync(
			deletedUserIdGuid,
			expectedProfileLinkCount: 0
		);
		await _AssertFindStaffUsersDoesNotContainAsync(
			staffToken,
			deletedUserId
		);
		await _AssertGetStaffUserReturnsNotFoundAsync(
			staffToken,
			deletedUserId
		);
		await _AssertGetStaffUserProfilesReturnsNotFoundAsync(
			staffToken,
			deletedUserId
		);

		await _AssertLatestBulkDeleteAuditLogAsync(
			actorUserId,
			startedAt,
			[deletedUserIdGuid, unsuspendedUserId, missingUserId],
			[deletedUserIdGuid],
			[
				new BulkDeleteAuditFailedItemResponse {
					UserId = unsuspendedUserId,
					Error = "User must be suspended before deletion"
				},
				new BulkDeleteAuditFailedItemResponse {
					UserId = missingUserId,
					Error = "User not found"
				}
			]
		);
	}

	private async Task<string> _CreateStaffUserAsync(string staffToken, string email) {
		_ = staffToken;
		// Direct create is intentionally unmapped; bulk tests seed setup users directly.
		var userId = await StaffUserTestHelper.SeedStaffUserAsync(
			_Fixture,
			email,
			firstName: "Staff",
			lastName: "BulkDelete"
		);
		return userId.ToString();
	}

	private async Task _SuspendStaffUserAsync(string staffToken, string userId) {
		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			_GetSuspendUrl(userId)
		).WithSessionToken(staffToken);

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);
	}

	private async Task<string> _CreateStaffProfileAsync(string staffToken) {
		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			_GetCreateProfileUrl()
		).WithSessionToken(staffToken);

		request.Content = JsonContent.Create(
			new {
				name = "Bulk Delete Staff User " + Guid.NewGuid().ToString("N")[..8],
				description = "Profile used by BulkDeleteStaffUsersSpec",
				permissions = new[] { AppPermissions.Staff.Users.LIST_FOR_STAFF.Key },
				emails = Array.Empty<string>(),
			}
		);

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Created);

		var created = await response.Content.ReadFromJsonAsync<StaffProfileCreatedResponse>();
		created.Should().NotBeNull();
		Assert.NotNull(created);
		return created.ProfileId.ToString();
	}

	private async Task _AssignProfilesAsync(
		string staffToken,
		string userId,
		params string[] profileIds
	) {
		using var request = new HttpRequestMessage(
			HttpMethod.Put,
			_GetUpdateProfilesUrl(userId)
		).WithSessionToken(staffToken);

		request.Content = JsonContent.Create(new { profileIds });

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);
	}

	private async Task<HttpResponseMessage> _BulkDeleteAsync(
		string staffToken,
		params Guid[] userIds
	) {
		return await _BulkDeleteAsync(
			staffToken,
			userIds.Select(userId => (object)userId).ToArray()
		);
	}

	private async Task<HttpResponseMessage> _BulkDeleteAsync(
		string staffToken,
		object[] userIds
	) {
		var request = new HttpRequestMessage(
			HttpMethod.Post,
			_GetBulkDeleteUrl()
		).WithSessionToken(staffToken);

		request.Content = JsonContent.Create(new { userIds });

		return await _Http.SendAsync(request);
	}

	private async Task _AssertSoftDeletedRowsAsync(
		Guid userId,
		int? expectedProfileLinkCount = null
	) {
		await _AssertStaffUserStateAsync(
			userId,
			expectedStatus: UserStatus.Suspended,
			expectedDeleted: true
		);

		await using var scope = _Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var staffAccount = await dbContext.UserAccount
			.IgnoreQueryFilters()
			.FirstOrDefaultAsync(x =>
				x.UserId == userId
				&& x.Scope == AccountScope.Staff
			);

		staffAccount.Should().NotBeNull();
		Assert.NotNull(staffAccount);
		staffAccount.IsDeleted.Should().BeTrue();
		staffAccount.DeletedAt.Should().NotBeNull();

		if (expectedProfileLinkCount is null) {
			return;
		}

		var userAccountProfiles = await dbContext.UserAccountProfile
			.IgnoreQueryFilters()
			.Where(x => x.UserAccountId == staffAccount.GetRequiredId())
			.ToListAsync();

		// Bulk delete shares the single-delete contract: membership rows are removed.
		userAccountProfiles.Should().HaveCount(expectedProfileLinkCount.Value);
	}

	private async Task _AssertStaffUserStateAsync(
		Guid userId,
		UserStatus expectedStatus,
		bool expectedDeleted
	) {
		await using var scope = _Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var user = await dbContext.User
			.IgnoreQueryFilters()
			.FirstOrDefaultAsync(x => x.Id == userId);

		user.Should().NotBeNull();
		Assert.NotNull(user);
		user.Status.Should().Be(expectedStatus);
		user.IsDeleted.Should().Be(expectedDeleted);
	}

	private async Task _AssertStaffUserRemainsUndeletedAndUnsuspendedAsync(
		Guid userId
	) {
		await using var scope = _Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var user = await dbContext.User
			.IgnoreQueryFilters()
			.FirstOrDefaultAsync(x => x.Id == userId);

		user.Should().NotBeNull();
		Assert.NotNull(user);
		user.IsDeleted.Should().BeFalse();
		user.IsSuspended().Should().BeFalse();
	}

	private async Task _AssertFindStaffUsersDoesNotContainAsync(
		string staffToken,
		string userId
	) {
		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			_GetFindUrl()
		).WithSessionToken(staffToken);

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<FindStaffUsersResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.Data.Should().NotContain(x => x.Id == Guid.Parse(userId));
	}

	private async Task _AssertGetStaffUserReturnsNotFoundAsync(
		string staffToken,
		string userId
	) {
		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			_GetByIdUrl(userId)
		).WithSessionToken(staffToken);

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	private async Task _AssertGetStaffUserProfilesReturnsNotFoundAsync(
		string staffToken,
		string userId
	) {
		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			_GetProfilesUrl(userId)
		).WithSessionToken(staffToken);

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	private async Task _AssertLatestBulkDeleteAuditLogAsync(
		Guid actorUserId,
		DateTime startedAt,
		IReadOnlyCollection<Guid> requestedUserIds,
		IReadOnlyCollection<Guid> succeededUserIds,
		IReadOnlyCollection<BulkDeleteAuditFailedItemResponse> failedItems
	) {
		await using var scope = _Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var auditLog = await dbContext.AuditLog
			.AsNoTracking()
			.Where(x =>
				x.UserId == actorUserId
				&& x.Action == AuditActions.StaffUserBulkDeleted
				&& x.CreatedAt >= startedAt
			)
			.OrderByDescending(x => x.CreatedAt)
			.FirstOrDefaultAsync();

		auditLog.Should().NotBeNull();
		Assert.NotNull(auditLog);
		auditLog.Details.Should().NotBeNull();

		Assert.NotNull(auditLog.Details);
		var details = JsonSerializer.Deserialize<BulkDeleteAuditDetails>(
					auditLog.Details
				);

		details.Should().NotBeNull();
		Assert.NotNull(details);
		details.RequestedCount.Should().Be(requestedUserIds.Count);
		details.SucceededCount.Should().Be(succeededUserIds.Count);
		details.FailedCount.Should().Be(failedItems.Count);
		details.RequestedUserIds.Should().BeEquivalentTo(requestedUserIds);
		details.SucceededUserIds.Should().BeEquivalentTo(succeededUserIds);
		details.FailedItems.Should().BeEquivalentTo(failedItems);
	}

	private static async Task<JsonDocument> _ReadOpenApiDocumentAsync() {
		return await OpenApiDocumentHelper.ReadAsync();
	}

	private static void _AssertSchemaRequiresUserIds(
		JsonDocument openApiDocument,
		string schemaName
	) {
		var requiredEntries = openApiDocument.RootElement
			.GetProperty("components")
			.GetProperty("schemas")
			.GetProperty(schemaName)
			.GetProperty("required")
			.EnumerateArray()
			.Select(x => x.GetString())
			.ToList();

		requiredEntries.Should().Contain("userIds");
	}

	private sealed record StaffProfileCreatedResponse {
		public Guid ProfileId { get; init; }
	}

	private sealed record BulkStaffUserActionResponse {
		public int SucceededCount { get; init; }
		public int FailedCount { get; init; }
		public required List<BulkStaffUserFailedItemResponse> FailedItems { get; init; }
	}

	private sealed record BulkStaffUserFailedItemResponse {
		public Guid UserId { get; init; }
		public string Error { get; init; } = string.Empty;
	}

	private sealed record BulkDeleteAuditDetails {
		public int RequestedCount { get; init; }
		public int SucceededCount { get; init; }
		public int FailedCount { get; init; }
		public required List<Guid> RequestedUserIds { get; init; }
		public required List<Guid> SucceededUserIds { get; init; }
		public required List<BulkDeleteAuditFailedItemResponse> FailedItems { get; init; }
	}

	private sealed class FindStaffUsersResponse : CursorPaginatedResult<StaffUserItem> { }

	private sealed record StaffUserItem {
		public Guid Id { get; init; }
	}

	private sealed record BulkDeleteAuditFailedItemResponse {
		public Guid UserId { get; init; }
		public string Error { get; init; } = string.Empty;
	}
}
