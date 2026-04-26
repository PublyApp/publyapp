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

public sealed class BulkSuspendStaffUsersSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public BulkSuspendStaffUsersSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	private static string GetBulkSuspendUrl() {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForStaff.Root,
			Routes.Users.ForStaff.BulkSuspend
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
	public async Task ItShouldReturnValidationProblemForMalformedBulkSuspendBody() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();

		using var response = await BulkSuspendAsync(
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
	public async Task ItShouldReturnOkWhenBulkSuspendingActiveStaffUsers() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var firstUserId = Guid.Parse(
			await CreateStaffUserAsync(
				staffToken,
				$"bulk-suspend-first-{Guid.NewGuid():N}@example.com"
			)
		);
		var secondUserId = Guid.Parse(
			await CreateStaffUserAsync(
				staffToken,
				$"bulk-suspend-second-{Guid.NewGuid():N}@example.com"
			)
		);

		using var response = await BulkSuspendAsync(
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

		await AssertStaffUserStatusAsync(firstUserId, UserStatus.Suspended);
		await AssertStaffUserStatusAsync(secondUserId, UserStatus.Suspended);
	}

	[Fact]
	public async Task ItShouldReturnPartialSuccessWhenBulkSuspendMixesValidAndInvalidTargets() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var activeUserId = Guid.Parse(
			await CreateStaffUserAsync(
				staffToken,
				$"bulk-active-{Guid.NewGuid():N}@example.com"
			)
		);
		var suspendedUserId = Guid.Parse(
			await CreateStaffUserAsync(
				staffToken,
				$"bulk-suspended-{Guid.NewGuid():N}@example.com"
			)
		);
		var missingUserId = Guid.NewGuid();

		await SuspendStaffUserAsync(staffToken, suspendedUserId.ToString());

		using var response = await BulkSuspendAsync(
			staffToken,
			activeUserId,
			suspendedUserId,
			missingUserId
		);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<BulkStaffUserActionResponse>();
		result.Should().NotBeNull();
		result!.SucceededCount.Should().Be(1);
		result.FailedCount.Should().Be(2);
		result.FailedItems.Should().ContainSingle(
			item => item.UserId == suspendedUserId
		);
		result.FailedItems.Should().ContainSingle(
			item => item.UserId == missingUserId
		);

		await AssertStaffUserStatusAsync(activeUserId, UserStatus.Suspended);
		await AssertStaffUserStatusAsync(suspendedUserId, UserStatus.Suspended);
	}

	private async Task<string> CreateStaffUserAsync(string staffToken, string email) {
		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetCreateUrl()
		).WithSessionToken(staffToken);

		request.Content = JsonContent.Create(
			new {
				email,
				lastName = "BulkSuspend",
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

	private async Task<HttpResponseMessage> BulkSuspendAsync(
		string staffToken,
		params Guid[] userIds
	) {
		return await BulkSuspendAsync(
			staffToken,
			userIds.Select(userId => (object)userId).ToArray()
		);
	}

	private async Task<HttpResponseMessage> BulkSuspendAsync(
		string staffToken,
		object[] userIds
	) {
		var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetBulkSuspendUrl()
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
