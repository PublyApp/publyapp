using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using MainApi.Localization;
using MainApi.Src.Lib;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Lib.Routes;
using MainApi.Src.Lib.Testing.Fixtures;
using MainApi.Src.Lib.Testing.Helpers;
using MainApi.Src.Lib.Utils;

using Xunit;

namespace MainApi.Src.Modules.Users.Handlers.Staff;

public sealed class DeleteStaffUserSpec : IClassFixture<ApiFixture> {
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public DeleteStaffUserSpec(ApiFixture fixture) {
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
	public async Task ItShouldSoftDeleteSuspendedStaffUserAndHideThemFromAllStaffSurfaces() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var email = $"delete-{Guid.NewGuid():N}@example.com";
		var userId = await CreateStaffUserAsync(staffToken, email);
		var profileId = await CreateStaffProfileAsync(staffToken);

		await AssignProfileAsync(staffToken, userId, profileId);
		await SuspendStaffUserAsync(staffToken, userId);

		using var response = await DeleteStaffUserAsync(staffToken, userId);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		(await response.Content.ReadFromJsonAsync<ApiResponse>())!.Key
			.Should().Be(ResponseKeys.StaffUserDeletedSuccess);

		await AssertFindStaffUsersDoesNotContainAsync(staffToken, userId);
		await AssertGetStaffUserReturnsNotFoundAsync(staffToken, userId);
		await AssertGetStaffUserProfilesReturnsNotFoundAsync(staffToken, userId);
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
		(await response.Content.ReadFromJsonAsync<AppProblemDetails>())!.TranslationKey
			.Should().Be(ResponseKeys.StaffUserNotSuspendedCannotDelete);
	}

	private async Task<string> CreateStaffUserAsync(string staffToken, string email) {
		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetCreateUrl()
		).WithSessionToken(staffToken);

		request.Content = JsonContent.Create(
			new {
				email,
				lastName = "DeleteTarget",
				firstName = "Staff",
			}
		);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Created);

		var created = await response.Content.ReadFromJsonAsync<CreateStaffUserResponse>();
		created.Should().NotBeNull();
		return created!.Id.ToString();
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
		return created!.ProfileId.ToString();
	}

	private async Task AssignProfileAsync(string staffToken, string userId, string profileId) {
		using var request = new HttpRequestMessage(
			HttpMethod.Put,
			GetUpdateProfilesUrl(userId)
		).WithSessionToken(staffToken);

		request.Content = JsonContent.Create(new { profileIds = new[] { profileId } });

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
		result!.Data.Should().NotContain(x => x.Id == Guid.Parse(userId));
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

	private sealed record CreateStaffUserResponse {
		public Guid Id { get; init; }
	}

	private sealed record StaffProfileCreatedResponse {
		public Guid ProfileId { get; init; }
	}
}
