namespace MainApi.Src.Modules.Profiles.Handlers.Staff;

using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using MainApi.Src.Lib;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Lib.Routes;
using MainApi.Src.Lib.Testing.Fixtures;
using MainApi.Src.Lib.Testing.Helpers;
using MainApi.Src.Lib.Utils;

using Xunit;

public sealed class FindStaffProfileUsersSpec
	: IClassFixture<ApiFixture> {
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public FindStaffProfileUsersSpec(ApiFixture fixture) {
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	private static string GetUrl(string profileId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Profiles.ForStaff.Root,
			Routes.Profiles.ForStaff.Users.FindFn(profileId)
		);
	}

	private static string GetCreateProfileUrl() {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Profiles.ForStaff.Root,
			Routes.Profiles.ForStaff.Create
		);
	}

	private static string GetUpdateUserProfilesUrl(string userId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForStaff.Root,
			Routes.Users.ForStaff.Profiles.UpdateFn(userId)
		);
	}

	[Fact]
	public async Task ItShouldReturnUnauthorizedWithoutSession() {
		var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl(Guid.NewGuid().ToString())
		);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForNonStaffUser() {
		var token = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl(Guid.NewGuid().ToString())
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForStaffWithoutPermission() {
		var token = await _authClient.LoginAsync(
			TestConstants.StaffUserEmail,
			TestConstants.SeedPassword
		);

		var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl(Guid.NewGuid().ToString())
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForMalformedProfileId() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl("not-a-guid")
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
	}

	[Fact]
	public async Task ItShouldReturnNotFoundForNonExistentProfile() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl(Guid.NewGuid().ToString())
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NotFound);

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
	}

	[Fact]
	public async Task ItShouldReturnAssignedUsers() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		var profileId = await CreateStaffProfileAsync(token);

		var staffUserId = await GetStaffUserIdByEmailAsync(
			_http,
			token,
			TestConstants.StaffUserEmail
		);

		// Assign the newly created profile to the staff user.
		using (var updateRequest = new HttpRequestMessage(
			HttpMethod.Put,
			GetUpdateUserProfilesUrl(staffUserId)
		).WithSessionToken(token)) {
			updateRequest.Content = JsonContent.Create(
				new { profileIds = new[] { profileId } }
			);

			using var updateResponse = await _http.SendAsync(updateRequest);
			updateResponse.StatusCode.Should().Be(HttpStatusCode.OK);
		}

		var url = GetUrl(profileId) + "?limit=50&sort_id=created_at&sort_order=desc";

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			url
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<FindStaffProfileUsersResponse>();
		result.Should().NotBeNull();
		result!.Users.Should().Contain(u =>
			string.Equals(u.Email, TestConstants.StaffUserEmail, StringComparison.OrdinalIgnoreCase)
		);
		result.Count.Should().BeGreaterThan(0);
	}

	// -- Helper methods --

	private static async Task<string> GetStaffUserIdByEmailAsync(
		HttpClient http,
		string staffToken,
		string email
	) {
		var url = PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForStaff.Root,
			Routes.Users.ForStaff.Find
		) + "?limit=50";

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			url
		).WithSessionToken(staffToken);

		using var response = await http.SendAsync(request);
		response.EnsureSuccessStatusCode();

		var result = await response.Content.ReadFromJsonAsync<FindStaffUsersResponse>();
		if (result is null) {
			throw new InvalidOperationException(
				"Failed to deserialize staff user list response"
			);
		}

		var user = result.StaffUsers.FirstOrDefault(
			u => string.Equals(
				u.Email,
				email,
				StringComparison.OrdinalIgnoreCase
			)
		);

		if (user is null) {
			throw new InvalidOperationException(
				$"Staff user with email '{email}' not found"
			);
		}

		return user.Id.ToString();
	}

	private async Task<string> CreateStaffProfileAsync(string staffToken) {
		var url = GetCreateProfileUrl();

		var name = "Test Profile Users " + Guid.NewGuid().ToString("N")[..8];

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			url
		).WithSessionToken(staffToken);

		request.Content = JsonContent.Create(
			new {
				name,
				description = "Test profile used by FindStaffProfileUsersSpec",
				permissions = new[] {
					// Any valid staff-scope permission key is fine for profile creation.
					AppPermissions.Staff.Profiles.LIST_FOR_STAFF.Key
				},
				emails = Array.Empty<string>(),
			}
		);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Created);

		var created = await response.Content.ReadFromJsonAsync<StaffProfileCreatedResponse>();
		created.Should().NotBeNull();
		return created!.ProfileId.ToString();
	}

	// -- Response DTOs --

	private record FindStaffProfileUsersResponse {
		public List<StaffProfileUserItemResponse> Users { get; init; } = [];
		public int Count { get; init; }
	}

	private record StaffProfileUserItemResponse {
		public Guid Id { get; init; }
		public string Email { get; init; } = string.Empty;
		public string? LastName { get; init; }
		public string? FirstName { get; init; }
		public string? AvatarUrl { get; init; }
		public string Status { get; init; } = string.Empty;
	}

	private record FindStaffUsersResponse {
		public List<StaffUserItem> StaffUsers { get; init; } = [];
		public int Count { get; init; }
	}

	private record StaffUserItem {
		public Guid Id { get; init; }
		public string Email { get; init; } = string.Empty;
	}

	private record StaffProfileCreatedResponse {
		public Guid ProfileId { get; init; }
	}
}

