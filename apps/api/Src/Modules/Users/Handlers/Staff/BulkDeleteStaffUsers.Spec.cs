using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

using FluentAssertions;

using MainApi.Localization;
using MainApi.Src.Data.DbContext;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Lib.Routes;
using MainApi.Src.Lib.Testing.Fixtures;
using MainApi.Src.Lib.Testing.Helpers;
using MainApi.Src.Lib.Utils;
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

	private async Task AssertSoftDeletedRowsAsync(Guid userId) {
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

	private sealed record BulkStaffUserActionResponse {
		public int SucceededCount { get; init; }
		public int FailedCount { get; init; }
		public required List<BulkStaffUserFailedItemResponse> FailedItems { get; init; }
	}

	private sealed record BulkStaffUserFailedItemResponse {
		public Guid UserId { get; init; }
		public string Error { get; init; } = string.Empty;
	}
}
