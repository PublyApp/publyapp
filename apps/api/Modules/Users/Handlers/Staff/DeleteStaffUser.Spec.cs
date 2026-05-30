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
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Users.Handlers.Staff;

public sealed class DeleteStaffUserSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public DeleteStaffUserSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	private static string GetDeleteUrl(string userId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForStaff.Root,
			Routes.Users.ForStaff.DeleteFn(userId)
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

	private static string GetSuspendUrl(string userId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForStaff.Root,
			Routes.Users.ForStaff.SuspendFn(userId)
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

	private static async Task<T> ReadRequiredJsonAsync<T>(HttpContent content) {
		var value = await content.ReadFromJsonAsync<T>();
		if (value is null) {
			throw new InvalidOperationException($"Failed to deserialize {typeof(T).Name}.");
		}

		return value;
	}

	[Fact]
	public async Task ItShouldSoftDeleteSuspendedStaffUserAndHideThemFromAllStaffSurfaces() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var email = $"delete-{Guid.NewGuid():N}@example.com";
		var userId = await CreateStaffUserAsync(staffToken, email);
		var firstProfileId = await CreateStaffProfileAsync(staffToken);
		var secondProfileId = await CreateStaffProfileAsync(staffToken);

		await AssignProfilesAsync(
			staffToken,
			userId,
			firstProfileId,
			secondProfileId
		);
		await SuspendStaffUserAsync(staffToken, userId);

		using var response = await DeleteStaffUserAsync(staffToken, userId);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var body = await ReadRequiredJsonAsync<ApiResponse>(response.Content);
		body.Key.Should().Be(ResponseKeys.StaffUserDeletedSuccess);

		await AssertSoftDeletedRowsAsync(userId, expectedProfileLinkCount: 0);
		await AssertFindStaffUsersDoesNotContainAsync(staffToken, userId);
		await AssertGetStaffUserReturnsNotFoundAsync(staffToken, userId);
		await AssertGetStaffUserProfilesReturnsNotFoundAsync(staffToken, userId);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestWhenDeletingWithMalformedId() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();

		using var response = await DeleteStaffUserAsync(staffToken, "not-a-guid");

		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
		var body = await ReadRequiredJsonAsync<AppProblemDetails>(response.Content);
		body.TranslationKey.Should().Be(ResponseKeys.MalformedId);
	}

	[Fact]
	public async Task ItShouldReturnNotFoundWhenDeletingMissingStaffUser() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();

		using var response = await DeleteStaffUserAsync(
			staffToken,
			Guid.NewGuid().ToString()
		);

		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
		var body = await ReadRequiredJsonAsync<AppProblemDetails>(response.Content);
		body.TranslationKey.Should().Be(ResponseKeys.UserNotFound);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestWhenDeletingANonSuspendedStaffUser() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var userId = await CreateStaffUserAsync(
			staffToken,
			$"not-suspended-{Guid.NewGuid():N}@example.com"
		);

		using var response = await DeleteStaffUserAsync(staffToken, userId);

		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
		var body = await ReadRequiredJsonAsync<AppProblemDetails>(response.Content);
		body.TranslationKey.Should().Be(ResponseKeys.StaffUserNotSuspendedCannotDelete);
	}

	private async Task AssertSoftDeletedRowsAsync(
		string userId,
		int expectedProfileLinkCount
	) {
		var userIdGuid = Guid.Parse(userId);

		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var user = await dbContext.User
			.IgnoreQueryFilters()
			.FirstOrDefaultAsync(x => x.Id == userIdGuid);
		user.Should().NotBeNull();
		Assert.NotNull(user);
		user.IsDeleted.Should().BeTrue();
		user.DeletedAt.Should().NotBeNull();

		var staffAccount = await dbContext.UserAccount
			.IgnoreQueryFilters()
			.FirstOrDefaultAsync(x =>
				x.UserId == userIdGuid
				&& x.Scope == AccountScope.Staff
			);
		staffAccount.Should().NotBeNull();
		Assert.NotNull(staffAccount);
		staffAccount.IsDeleted.Should().BeTrue();
		staffAccount.DeletedAt.Should().NotBeNull();

		var userAccountProfiles = await dbContext.UserAccountProfile
			.IgnoreQueryFilters()
			.Where(x => x.UserAccountId == staffAccount.GetRequiredId())
			.ToListAsync();

		// Profile links are active-state rows; deleting the staff account removes them.
		userAccountProfiles.Should().HaveCount(expectedProfileLinkCount);
	}

	private async Task<string> CreateStaffUserAsync(string staffToken, string email) {
		_ = staffToken;
		// Direct create is intentionally unmapped; delete tests seed setup users directly.
		var userId = await StaffUserTestHelper.SeedStaffUserAsync(
			_fixture,
			email,
			firstName: "Staff",
			lastName: "DeleteTarget"
		);
		return userId.ToString();
	}

	private async Task<string> CreateStaffProfileAsync(string staffToken) {
		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetCreateProfileUrl()
		).WithSessionToken(staffToken);

		request.Content = JsonContent.Create(
			new {
				name = "Delete Staff User " + Guid.NewGuid().ToString("N")[..8],
				description = "Profile used by DeleteStaffUserSpec",
				permissions = new[] { AppPermissions.Staff.Users.LIST_FOR_STAFF.Key },
				emails = Array.Empty<string>(),
			}
		);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Created);

		var created = await response.Content.ReadFromJsonAsync<StaffProfileCreatedResponse>();
		created.Should().NotBeNull();
		Assert.NotNull(created);
		return created.ProfileId.ToString();
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

	private async Task SuspendStaffUserAsync(string staffToken, string userId) {
		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetSuspendUrl(userId)
		).WithSessionToken(staffToken);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);
	}

	private async Task<HttpResponseMessage> DeleteStaffUserAsync(string staffToken, string userId) {
		var request = new HttpRequestMessage(
			HttpMethod.Delete,
			GetDeleteUrl(userId)
		).WithSessionToken(staffToken);

		return await _http.SendAsync(request);
	}

	private async Task AssertFindStaffUsersDoesNotContainAsync(string staffToken, string userId) {
		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetFindUrl()
		).WithSessionToken(staffToken);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<FindStaffUsersResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.Data.Should().NotContain(x => x.Id == Guid.Parse(userId));
	}

	private async Task AssertGetStaffUserReturnsNotFoundAsync(string staffToken, string userId) {
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

	private sealed class FindStaffUsersResponse : CursorPaginatedResult<StaffUserItem> { }

	private sealed record StaffUserItem {
		public Guid Id { get; init; }
	}

	private sealed record StaffProfileCreatedResponse {
		public Guid ProfileId { get; init; }
	}
}
