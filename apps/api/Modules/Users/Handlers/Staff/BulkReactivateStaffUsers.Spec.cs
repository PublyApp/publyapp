using System.Net;
using System.Net.Http.Json;

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

public sealed class BulkReactivateStaffUsersSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public BulkReactivateStaffUsersSpec(ApiFixture fixture) {
		_Fixture = fixture;
		_Http = fixture.HttpClient;
		_AuthClient = new TestAuthClient(_Http);
	}

	private static string _GetBulkReactivateUrl() {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForStaff.Root,
			Routes.Users.ForStaff.BulkReactivate
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
	public async Task ItShouldReturnValidationProblemWhenBulkReactivateExceedsMaxIds() {
		var staffToken = await _AuthClient.LoginAsStaffAdminAsync();
		var userIds = Enumerable.Range(0, 101)
			.Select(_ => Guid.NewGuid())
			.ToArray();

		using var response = await _BulkReactivateAsync(
			staffToken,
			userIds
		);

		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);

		var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.RequestBodyValidationFailed);
		problem.Errors.Values
			.SelectMany(errors => errors)
			.Should()
			.Contain(error => error.Contains("Maximum 100"));
	}

	[Fact]
	public async Task ItShouldReturnValidationProblemWhenBulkReactivateBodyOmitsUserIds() {
		var staffToken = await _AuthClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			_GetBulkReactivateUrl()
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
	public async Task ItShouldReturnOkWhenBulkReactivatingSuspendedStaffUsers() {
		var staffToken = await _AuthClient.LoginAsStaffAdminAsync();
		var firstUserId = Guid.Parse(
			await _CreateStaffUserAsync(
				staffToken,
				$"bulk-reactivate-first-{Guid.NewGuid():N}@example.com"
			)
		);
		var secondUserId = Guid.Parse(
			await _CreateStaffUserAsync(
				staffToken,
				$"bulk-reactivate-second-{Guid.NewGuid():N}@example.com"
			)
		);

		await _SuspendStaffUserAsync(staffToken, firstUserId.ToString());
		await _SuspendStaffUserAsync(staffToken, secondUserId.ToString());

		using var response = await _BulkReactivateAsync(
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

		await _AssertStaffUserStatusAsync(firstUserId, UserStatus.Active);
		await _AssertStaffUserStatusAsync(secondUserId, UserStatus.Active);
	}

	[Fact]
	public async Task ItShouldReturnPartialSuccessWhenBulkReactivateMixesSuspendedAndInvalidTargets() {
		var staffToken = await _AuthClient.LoginAsStaffAdminAsync();
		var suspendedUserId = Guid.Parse(
			await _CreateStaffUserAsync(
				staffToken,
				$"bulk-reactivate-{Guid.NewGuid():N}@example.com"
			)
		);
		var nonSuspendedUserId = Guid.Parse(
			await _CreateStaffUserAsync(
				staffToken,
				$"not-suspended-{Guid.NewGuid():N}@example.com"
			)
		);
		var missingUserId = Guid.NewGuid();

		await _SuspendStaffUserAsync(staffToken, suspendedUserId.ToString());

		using var response = await _BulkReactivateAsync(
			staffToken,
			suspendedUserId,
			nonSuspendedUserId,
			missingUserId
		);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<BulkStaffUserActionResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.SucceededCount.Should().Be(1);
		result.FailedCount.Should().Be(2);
		result.FailedItems.Should().ContainSingle(
			item => item.UserId == nonSuspendedUserId
		);
		result.FailedItems.Should().ContainSingle(
			item => item.UserId == missingUserId
		);

		await _AssertStaffUserStatusAsync(suspendedUserId, UserStatus.Active);
		await _AssertStaffUserStatusAsync(nonSuspendedUserId, UserStatus.Active);
	}

	private async Task<string> _CreateStaffUserAsync(string staffToken, string email) {
		_ = staffToken;
		// Direct create is intentionally unmapped; bulk tests seed setup users directly.
		var userId = await StaffUserTestHelper.SeedStaffUserAsync(
			_Fixture,
			email,
			firstName: "Staff",
			lastName: "BulkReactivate"
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

	private async Task<HttpResponseMessage> _BulkReactivateAsync(
		string staffToken,
		params Guid[] userIds
	) {
		var request = new HttpRequestMessage(
			HttpMethod.Post,
			_GetBulkReactivateUrl()
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
