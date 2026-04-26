using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

using FluentAssertions;

using MainApi.Localization;
using MainApi.Src.Data.DbContext;
using MainApi.Src.Lib;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Lib.Routes;
using MainApi.Src.Lib.Testing.Fixtures;
using MainApi.Src.Lib.Testing.Helpers;
using MainApi.Src.Lib.Utils;
using MainApi.Src.Modules.AuditLogs.Entities;
using MainApi.Src.Modules.Users.Entities;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using Xunit;

namespace MainApi.Src.Modules.Users.Handlers.Staff;

public sealed class BulkDeleteStaffUsersSpec : IClassFixture<ApiFixture> {
	private const string BulkDeleteRoute = "/bulk-delete";

	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public BulkDeleteStaffUsersSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	private static string GetBulkDeleteUrl() {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForStaff.Root,
			BulkDeleteRoute
		);
	}

	private static string GetCreateUrl() {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForStaff.Root,
			Routes.Users.ForStaff.Create
		);
	}

	private static string GetSuspendUrl(string userId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForStaff.Root,
			Routes.Users.ForStaff.SuspendFn(userId)
		);
	}

	private static string GetFindUrl() {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForStaff.Root,
			Routes.Users.ForStaff.Find
		) + "?limit=100";
	}

	private static string GetByIdUrl(string userId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForStaff.Root,
			Routes.Users.ForStaff.GetByIdFn(userId)
		);
	}

	private static string GetProfilesUrl(string userId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForStaff.Root,
			Routes.Users.ForStaff.Profiles.GetFn(userId)
		);
	}

	private static string GetUpdateProfilesUrl(string userId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForStaff.Root,
			Routes.Users.ForStaff.Profiles.UpdateFn(userId)
		);
	}

	private static string GetCreateProfileUrl() {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Profiles.ForStaff.Root,
			Routes.Profiles.ForStaff.Create
		);
	}

	[Fact]
	public async Task ItShouldPublishBulkDeleteStaffUserBodyWithRequiredUserIdsInOpenApi() {
		var openApiDocument = await ReadOpenApiDocumentAsync();

		AssertSchemaRequiresUserIds(
			openApiDocument,
			"BulkDeleteStaffUsersBody"
		);
	}

	[Fact]
	public async Task ItShouldReturnValidationProblemForMalformedBulkDeleteBody() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();

		using var response = await BulkDeleteAsync(
			staffToken,
			new[] { "not-a-guid" }
		);

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);

		var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		problem!.TranslationKey.Should().Be(ResponseKeys.RequestBodyValidationFailed);
		problem.Errors.Values
			.SelectMany(errors => errors)
			.Should()
			.Contain(error => error.Contains("valid GUID"));
	}

	[Fact]
	public async Task ItShouldReturnValidationProblemWhenBulkDeleteBodyOmitsUserIds() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetBulkDeleteUrl()
		).WithSessionToken(staffToken);

		request.Content = JsonContent.Create(new { });

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);

		var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		problem!.TranslationKey.Should().Be(ResponseKeys.RequestBodyValidationFailed);
		problem.Errors.Values
			.SelectMany(errors => errors)
			.Should()
			.Contain(error => error.Contains("required"));
	}

	[Fact]
	public async Task ItShouldReturnOkWhenBulkDeletingSuspendedStaffUsers() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var firstUserId = Guid.Parse(
			await CreateStaffUserAsync(
				staffToken,
				$"bulk-delete-first-{Guid.NewGuid():N}@example.com"
			)
		);
		var secondUserId = Guid.Parse(
			await CreateStaffUserAsync(
				staffToken,
				$"bulk-delete-second-{Guid.NewGuid():N}@example.com"
			)
		);

		await SuspendStaffUserAsync(staffToken, firstUserId.ToString());
		await SuspendStaffUserAsync(staffToken, secondUserId.ToString());

		using var response = await BulkDeleteAsync(
			staffToken,
			firstUserId,
			secondUserId
		);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<BulkStaffUserActionResponse>();
		result.Should().NotBeNull();
		result!.SucceededCount.Should().Be(2);
		result.FailedCount.Should().Be(0);
		result.FailedItems.Should().BeEmpty();

		await AssertSoftDeletedRowsAsync(firstUserId);
		await AssertSoftDeletedRowsAsync(secondUserId);
	}

	[Fact]
	public async Task ItShouldReturnPartialSuccessWhenBulkDeleteMixesInvalidTargets() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var suspendedUserId = Guid.Parse(
			await CreateStaffUserAsync(
				staffToken,
				$"bulk-delete-suspended-{Guid.NewGuid():N}@example.com"
			)
		);
		var unsuspendedUserId = Guid.Parse(
			await CreateStaffUserAsync(
				staffToken,
				$"bulk-delete-active-{Guid.NewGuid():N}@example.com"
			)
		);
		var missingUserId = Guid.NewGuid();

		await SuspendStaffUserAsync(staffToken, suspendedUserId.ToString());

		using var response = await BulkDeleteAsync(
			staffToken,
			suspendedUserId,
			unsuspendedUserId,
			missingUserId
		);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<BulkStaffUserActionResponse>();
		result.Should().NotBeNull();
		result!.SucceededCount.Should().Be(1);
		result.FailedCount.Should().Be(2);
		result.FailedItems.Should().ContainSingle(
			item => item.UserId == unsuspendedUserId
		);
		result.FailedItems.Should().ContainSingle(
			item => item.UserId == missingUserId
		);

		await AssertSoftDeletedRowsAsync(suspendedUserId);
		await AssertStaffUserRemainsUndeletedAndUnsuspendedAsync(
			unsuspendedUserId
		);
	}

	[Fact]
	public async Task
	ItShouldRecordPerUserAuditOutcomesWhenBulkDeleteReusesSingleDeleteLifecycle() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var actorUserId = await AuditLogTestHelper.GetUserIdByEmailAsync(
			_fixture.Factory,
			TestConstants.StaffAdminEmail
		);
		var deletedUserId = await CreateStaffUserAsync(
			staffToken,
			$"bulk-delete-audit-{Guid.NewGuid():N}@example.com"
		);
		var deletedUserIdGuid = Guid.Parse(deletedUserId);
		var firstProfileId = await CreateStaffProfileAsync(staffToken);
		var secondProfileId = await CreateStaffProfileAsync(staffToken);
		var unsuspendedUserId = Guid.Parse(
			await CreateStaffUserAsync(
				staffToken,
				$"bulk-delete-audit-unsuspended-{Guid.NewGuid():N}@example.com"
			)
		);
		var missingUserId = Guid.NewGuid();

		await AssignProfilesAsync(
			staffToken,
			deletedUserId,
			firstProfileId,
			secondProfileId
		);
		await SuspendStaffUserAsync(staffToken, deletedUserId);

		var startedAt = DateTime.UtcNow;

		using var response = await BulkDeleteAsync(
			staffToken,
			deletedUserIdGuid,
			unsuspendedUserId,
			missingUserId
		);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<BulkStaffUserActionResponse>();
		result.Should().NotBeNull();
		result!.SucceededCount.Should().Be(1);
		result.FailedCount.Should().Be(2);

		await AssertSoftDeletedRowsAsync(
			deletedUserIdGuid,
			expectedProfileLinkCount: 2
		);
		await AssertFindStaffUsersDoesNotContainAsync(
			staffToken,
			deletedUserId
		);
		await AssertGetStaffUserReturnsNotFoundAsync(
			staffToken,
			deletedUserId
		);
		await AssertGetStaffUserProfilesReturnsNotFoundAsync(
			staffToken,
			deletedUserId
		);

		await AssertLatestBulkDeleteAuditLogAsync(
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

	private async Task<string> CreateStaffUserAsync(string staffToken, string email) {
		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetCreateUrl()
		).WithSessionToken(staffToken);

		request.Content = JsonContent.Create(
			new {
				email,
				lastName = "BulkDelete",
				firstName = "Staff",
			}
		);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Created);

		var created = await response.Content.ReadFromJsonAsync<CreateStaffUserResponse>();
		created.Should().NotBeNull();
		return created!.Id.ToString();
	}

	private async Task SuspendStaffUserAsync(string staffToken, string userId) {
		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetSuspendUrl(userId)
		).WithSessionToken(staffToken);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);
	}

	private async Task<string> CreateStaffProfileAsync(string staffToken) {
		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetCreateProfileUrl()
		).WithSessionToken(staffToken);

		request.Content = JsonContent.Create(
			new {
				name = "Bulk Delete Staff User " + Guid.NewGuid().ToString("N")[..8],
				description = "Profile used by BulkDeleteStaffUsersSpec",
				permissions = new[] { AppPermissions.Staff.Users.LIST_FOR_STAFF.Key },
				emails = Array.Empty<string>(),
			}
		);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Created);

		var created = await response.Content.ReadFromJsonAsync<StaffProfileCreatedResponse>();
		created.Should().NotBeNull();
		return created!.ProfileId.ToString();
	}

	private async Task AssignProfilesAsync(
		string staffToken,
		string userId,
		params string[] profileIds
	) {
		using var request = new HttpRequestMessage(
			HttpMethod.Put,
			GetUpdateProfilesUrl(userId)
		).WithSessionToken(staffToken);

		request.Content = JsonContent.Create(new { profileIds });

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);
	}

	private async Task<HttpResponseMessage> BulkDeleteAsync(
		string staffToken,
		params Guid[] userIds
	) {
		return await BulkDeleteAsync(
			staffToken,
			userIds.Select(userId => (object)userId).ToArray()
		);
	}

	private async Task<HttpResponseMessage> BulkDeleteAsync(
		string staffToken,
		object[] userIds
	) {
		var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetBulkDeleteUrl()
		).WithSessionToken(staffToken);

		request.Content = JsonContent.Create(new { userIds });

		return await _http.SendAsync(request);
	}

	private async Task AssertSoftDeletedRowsAsync(
		Guid userId,
		int? expectedProfileLinkCount = null
	) {
		await AssertStaffUserStateAsync(
			userId,
			expectedStatus: UserStatus.Suspended,
			expectedDeleted: true
		);

		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<MainApiDbContext>();

		var staffAccount = await dbContext.UserAccount
			.IgnoreQueryFilters()
			.FirstOrDefaultAsync(x =>
				x.UserId == userId
				&& x.Scope == AccountScope.Staff
			);

		staffAccount.Should().NotBeNull();
		staffAccount!.IsDeleted.Should().BeTrue();
		staffAccount.DeletedAt.Should().NotBeNull();

		if (expectedProfileLinkCount is null) {
			return;
		}

		var userAccountProfiles = await dbContext.UserAccountProfile
			.IgnoreQueryFilters()
			.Where(x => x.UserAccountId == staffAccount.GetRequiredId())
			.ToListAsync();

		userAccountProfiles.Should().HaveCount(expectedProfileLinkCount.Value);
		userAccountProfiles.Should().OnlyContain(x =>
			x.IsDeleted
			&& x.DeletedAt != null
		);
	}

	private async Task AssertStaffUserStateAsync(
		Guid userId,
		UserStatus expectedStatus,
		bool expectedDeleted
	) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<MainApiDbContext>();

		var user = await dbContext.User
			.IgnoreQueryFilters()
			.FirstOrDefaultAsync(x => x.Id == userId);

		user.Should().NotBeNull();
		user!.Status.Should().Be(expectedStatus);
		user.IsDeleted.Should().Be(expectedDeleted);
	}

	private async Task AssertStaffUserRemainsUndeletedAndUnsuspendedAsync(
		Guid userId
	) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<MainApiDbContext>();

		var user = await dbContext.User
			.IgnoreQueryFilters()
			.FirstOrDefaultAsync(x => x.Id == userId);

		user.Should().NotBeNull();
		user!.IsDeleted.Should().BeFalse();
		user.IsSuspended().Should().BeFalse();
	}

	private async Task AssertFindStaffUsersDoesNotContainAsync(
		string staffToken,
		string userId
	) {
		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetFindUrl()
		).WithSessionToken(staffToken);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<FindStaffUsersResponse>();
		result.Should().NotBeNull();
		result!.Data.Should().NotContain(x => x.Id == Guid.Parse(userId));
	}

	private async Task AssertGetStaffUserReturnsNotFoundAsync(
		string staffToken,
		string userId
	) {
		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetByIdUrl(userId)
		).WithSessionToken(staffToken);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	private async Task AssertGetStaffUserProfilesReturnsNotFoundAsync(
		string staffToken,
		string userId
	) {
		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetProfilesUrl(userId)
		).WithSessionToken(staffToken);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	private async Task AssertLatestBulkDeleteAuditLogAsync(
		Guid actorUserId,
		DateTime startedAt,
		IReadOnlyCollection<Guid> requestedUserIds,
		IReadOnlyCollection<Guid> succeededUserIds,
		IReadOnlyCollection<BulkDeleteAuditFailedItemResponse> failedItems
	) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<MainApiDbContext>();

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
		auditLog!.Details.Should().NotBeNull();

		var details = JsonSerializer.Deserialize<BulkDeleteAuditDetails>(
			auditLog.Details!
		);

		details.Should().NotBeNull();
		details!.RequestedCount.Should().Be(requestedUserIds.Count);
		details.SucceededCount.Should().Be(succeededUserIds.Count);
		details.FailedCount.Should().Be(failedItems.Count);
		details.RequestedUserIds.Should().BeEquivalentTo(requestedUserIds);
		details.SucceededUserIds.Should().BeEquivalentTo(succeededUserIds);
		details.FailedItems.Should().BeEquivalentTo(failedItems);
	}

	private static async Task<JsonDocument> ReadOpenApiDocumentAsync() {
		var openApiPath = Path.GetFullPath(
			Path.Combine(
				AppContext.BaseDirectory,
				"..",
				"..",
				"..",
				"..",
				"openapi",
				"MainApi.json"
			)
		);

		return JsonDocument.Parse(
			await File.ReadAllTextAsync(openApiPath)
		);
	}

	private static void AssertSchemaRequiresUserIds(
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

	private sealed record CreateStaffUserResponse {
		public Guid Id { get; init; }
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
