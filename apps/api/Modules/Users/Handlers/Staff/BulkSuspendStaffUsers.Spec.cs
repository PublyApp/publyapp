using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Users.Handlers.Staff;

public sealed class BulkSuspendStaffUsersSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public BulkSuspendStaffUsersSpec(ApiFixture fixture) {
		_Fixture = fixture;
		_Http = fixture.HttpClient;
		_AuthClient = new TestAuthClient(_Http);
	}

	private static string _GetBulkSuspendUrl() {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForStaff.Root,
			Routes.Users.ForStaff.BulkSuspend
		);
	}

	private static string _GetSuspendUrl(string userId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForStaff.Root,
			Routes.Users.ForStaff.SuspendFn(userId)
		);
	}

	[Fact]
	public async Task ItShouldPublishBulkStaffUserBodiesWithRequiredUserIdsInOpenApi() {
		var openApiDocument = await _ReadOpenApiDocumentAsync();

		_AssertSchemaRequiresUserIds(
			openApiDocument,
			"BulkSuspendStaffUsersBody"
		);
		_AssertSchemaRequiresUserIds(
			openApiDocument,
			"BulkReactivateStaffUsersBody"
		);
	}

	[Fact]
	public async Task ItShouldReturnValidationProblemForMalformedBulkSuspendBody() {
		var staffToken = await _AuthClient.LoginAsStaffAdminAsync();

		using var response = await _BulkSuspendAsync(
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
	public async Task ItShouldReturnValidationProblemWhenBulkSuspendBodyOmitsUserIds() {
		var staffToken = await _AuthClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			_GetBulkSuspendUrl()
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
	public async Task ItShouldReturnOkWhenBulkSuspendingActiveStaffUsers() {
		var staffToken = await _AuthClient.LoginAsStaffAdminAsync();
		var firstUserId = Guid.Parse(
			await _CreateStaffUserAsync(
				staffToken,
				$"bulk-suspend-first-{Guid.NewGuid():N}@example.com"
			)
		);
		var secondUserId = Guid.Parse(
			await _CreateStaffUserAsync(
				staffToken,
				$"bulk-suspend-second-{Guid.NewGuid():N}@example.com"
			)
		);

		using var response = await _BulkSuspendAsync(
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

		await _AssertStaffUserStatusAsync(firstUserId, UserStatus.Suspended);
		await _AssertStaffUserStatusAsync(secondUserId, UserStatus.Suspended);
	}

	[Fact]
	public async Task ItShouldReturnPartialSuccessWhenBulkSuspendMixesValidAndInvalidTargets() {
		var staffToken = await _AuthClient.LoginAsStaffAdminAsync();
		var activeUserId = Guid.Parse(
			await _CreateStaffUserAsync(
				staffToken,
				$"bulk-active-{Guid.NewGuid():N}@example.com"
			)
		);
		var suspendedUserId = Guid.Parse(
			await _CreateStaffUserAsync(
				staffToken,
				$"bulk-suspended-{Guid.NewGuid():N}@example.com"
			)
		);
		var missingUserId = Guid.NewGuid();

		await _SuspendStaffUserAsync(staffToken, suspendedUserId.ToString());

		using var response = await _BulkSuspendAsync(
			staffToken,
			activeUserId,
			suspendedUserId,
			missingUserId
		);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<BulkStaffUserActionResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.SucceededCount.Should().Be(1);
		result.FailedCount.Should().Be(2);
		result.FailedItems.Should().ContainSingle(
			item => item.UserId == suspendedUserId
		);
		result.FailedItems.Should().ContainSingle(
			item => item.UserId == missingUserId
		);

		await _AssertStaffUserStatusAsync(activeUserId, UserStatus.Suspended);
		await _AssertStaffUserStatusAsync(suspendedUserId, UserStatus.Suspended);
	}

	private async Task<string> _CreateStaffUserAsync(string staffToken, string email) {
		_ = staffToken;
		// Direct create is intentionally unmapped; bulk tests seed setup users directly.
		var userId = await StaffUserTestHelper.SeedStaffUserAsync(
			_Fixture,
			email,
			firstName: "Staff",
			lastName: "BulkSuspend"
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

	private async Task<HttpResponseMessage> _BulkSuspendAsync(
		string staffToken,
		params Guid[] userIds
	) {
		return await _BulkSuspendAsync(
			staffToken,
			userIds.Select(userId => (object)userId).ToArray()
		);
	}

	private async Task<HttpResponseMessage> _BulkSuspendAsync(
		string staffToken,
		object[] userIds
	) {
		var request = new HttpRequestMessage(
			HttpMethod.Post,
			_GetBulkSuspendUrl()
		).WithSessionToken(staffToken);

		request.Content = JsonContent.Create(new { userIds });

		return await _Http.SendAsync(request);
	}

	private async Task _AssertStaffUserStatusAsync(
		Guid userId,
		UserStatus expectedStatus
	) {
		await using var scope = _Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var user = await (
			from entity in dbContext.User.AsNoTracking()
			where entity.Id == userId
			select entity
		).FirstOrDefaultAsync();

		user.Should().NotBeNull();
		Assert.NotNull(user);
		user.Status.Should().Be(expectedStatus);
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
