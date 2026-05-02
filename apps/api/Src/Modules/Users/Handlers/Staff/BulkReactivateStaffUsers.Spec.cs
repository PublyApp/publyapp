using System.Net;
using System.Net.Http.Json;

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

public sealed class BulkReactivateStaffUsersSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public BulkReactivateStaffUsersSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	private static string GetBulkReactivateUrl() {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForStaff.Root,
			Routes.Users.ForStaff.BulkReactivate
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
	public async Task ItShouldReturnValidationProblemWhenBulkReactivateExceedsMaxIds() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var userIds = Enumerable.Range(0, 101)
			.Select(_ => Guid.NewGuid())
			.ToArray();

		using var response = await BulkReactivateAsync(
			staffToken,
			userIds
		);

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);

		var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		problem!.TranslationKey.Should().Be(ResponseKeys.RequestBodyValidationFailed);
		problem.Errors.Values
			.SelectMany(errors => errors)
			.Should()
			.Contain(error => error.Contains("Maximum 100"));
	}

	[Fact]
	public async Task ItShouldReturnValidationProblemWhenBulkReactivateBodyOmitsUserIds() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetBulkReactivateUrl()
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
	public async Task ItShouldReturnOkWhenBulkReactivatingSuspendedStaffUsers() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var firstUserId = Guid.Parse(
			await CreateStaffUserAsync(
				staffToken,
				$"bulk-reactivate-first-{Guid.NewGuid():N}@example.com"
			)
		);
		var secondUserId = Guid.Parse(
			await CreateStaffUserAsync(
				staffToken,
				$"bulk-reactivate-second-{Guid.NewGuid():N}@example.com"
			)
		);

		await SuspendStaffUserAsync(staffToken, firstUserId.ToString());
		await SuspendStaffUserAsync(staffToken, secondUserId.ToString());

		using var response = await BulkReactivateAsync(
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

		await AssertStaffUserStatusAsync(firstUserId, UserStatus.Active);
		await AssertStaffUserStatusAsync(secondUserId, UserStatus.Active);
	}

	[Fact]
	public async Task ItShouldReturnPartialSuccessWhenBulkReactivateMixesSuspendedAndInvalidTargets() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var suspendedUserId = Guid.Parse(
			await CreateStaffUserAsync(
				staffToken,
				$"bulk-reactivate-{Guid.NewGuid():N}@example.com"
			)
		);
		var nonSuspendedUserId = Guid.Parse(
			await CreateStaffUserAsync(
				staffToken,
				$"not-suspended-{Guid.NewGuid():N}@example.com"
			)
		);
		var missingUserId = Guid.NewGuid();

		await SuspendStaffUserAsync(staffToken, suspendedUserId.ToString());

		using var response = await BulkReactivateAsync(
			staffToken,
			suspendedUserId,
			nonSuspendedUserId,
			missingUserId
		);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<BulkStaffUserActionResponse>();
		result.Should().NotBeNull();
		result!.SucceededCount.Should().Be(1);
		result.FailedCount.Should().Be(2);
		result.FailedItems.Should().ContainSingle(
			item => item.UserId == nonSuspendedUserId
		);
		result.FailedItems.Should().ContainSingle(
			item => item.UserId == missingUserId
		);

		await AssertStaffUserStatusAsync(suspendedUserId, UserStatus.Active);
		await AssertStaffUserStatusAsync(nonSuspendedUserId, UserStatus.Active);
	}

	private async Task<string> CreateStaffUserAsync(string staffToken, string email) {
		_ = staffToken;
		// Direct create is intentionally unmapped; bulk tests seed setup users directly.
		var userId = await StaffUserTestHelper.SeedStaffUserAsync(
			_fixture,
			email,
			firstName: "Staff",
			lastName: "BulkReactivate"
		);
		return userId.ToString();
	}

	private async Task SuspendStaffUserAsync(string staffToken, string userId) {
		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetSuspendUrl(userId)
		).WithSessionToken(staffToken);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);
	}

	private async Task<HttpResponseMessage> BulkReactivateAsync(
		string staffToken,
		params Guid[] userIds
	) {
		var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetBulkReactivateUrl()
		).WithSessionToken(staffToken);

		request.Content = JsonContent.Create(new { userIds });

		return await _http.SendAsync(request);
	}

	private async Task AssertStaffUserStatusAsync(
		Guid userId,
		UserStatus expectedStatus
	) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<MainApiDbContext>();

		var user = await (
			from entity in dbContext.User.AsNoTracking()
			where entity.Id == userId
			select entity
		).FirstOrDefaultAsync();

		user.Should().NotBeNull();
		user!.Status.Should().Be(expectedStatus);
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
