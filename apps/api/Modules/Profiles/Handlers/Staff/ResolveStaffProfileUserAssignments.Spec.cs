
using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;

using Xunit;

namespace PublyApp.Api.Modules.Profiles.Handlers.Staff;

public sealed class ResolveStaffProfileUserAssignmentsSpec
	: IClassFixture<ApiFixture> {
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public ResolveStaffProfileUserAssignmentsSpec(ApiFixture fixture) {
		_Http = fixture.HttpClient;
		_AuthClient = new TestAuthClient(_Http);
	}

	private static string _GetUrl(string profileId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Profiles.ForStaff.Root,
			Routes.Profiles.ForStaff.Users.ResolveAssignmentFn(profileId)
		);
	}

	private static string _GetCreateProfileUrl() {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Profiles.ForStaff.Root,
			Routes.Profiles.ForStaff.Create
		);
	}

	private static string _GetFindStaffUsersUrl(string? q = null) {
		var url = PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForStaff.Root,
			Routes.Users.ForStaff.Find
		);

		if (q is null) {
			return url;
		}

		return url + $"?q={Uri.EscapeDataString(q)}&limit=50";
	}

	private static string _GetUpdateUserProfilesUrl(string userId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForStaff.Root,
			Routes.Users.ForStaff.Profiles.UpdateFn(userId)
		);
	}

	[Fact]
	public async Task ItShouldReturnUnauthorizedWithoutSession() {
		using var response = await _Http.PostAsJsonAsync(
			_GetUrl(Guid.NewGuid().ToString()),
			new { userIds = new[] { Guid.NewGuid().ToString() } }
		);

		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task ItShouldReturnNotFoundWhenProfileDoesNotExist() {
		var token = await _AuthClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			_GetUrl(Guid.NewGuid().ToString())
		).WithSessionToken(token);

		request.Content = JsonContent.Create(
			new { userIds = new[] { Guid.NewGuid().ToString() } }
		);

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task ItShouldResolveAssignmentsForRequestedUsers() {
		var token = await _AuthClient.LoginAsStaffAdminAsync();

		var profileId = await _CreateStaffProfileAsync(token);
		var staffUserId = await _GetStaffUserIdByEmailAsync(
			TestConstants.StaffAdminEmail,
			token
		);

		// Assign the profile to the staff user so the resolver has something to find.
		using (var updateRequest = new HttpRequestMessage(
			HttpMethod.Put,
			_GetUpdateUserProfilesUrl(staffUserId)
		).WithSessionToken(token)) {
			updateRequest.Content = JsonContent.Create(
				new { profileIds = new[] { profileId } }
			);

			using var updateResponse = await _Http.SendAsync(updateRequest);
			updateResponse.StatusCode.Should().Be(HttpStatusCode.OK);
		}

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			_GetUrl(profileId)
		).WithSessionToken(token);

		request.Content = JsonContent.Create(
			new { userIds = new[] { staffUserId, Guid.NewGuid().ToString() } }
		);

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<ResolveStaffProfileUserAssignmentsResult>();

		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.Assignments.Should().Contain(x =>
					x.UserId.ToString() == staffUserId
					&& x.IsAssigned
				);
	}

	private async Task<string> _CreateStaffProfileAsync(string staffToken) {
		var name = "Test Profile Resolve " + Guid.NewGuid().ToString("N")[..8];

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			_GetCreateProfileUrl()
		).WithSessionToken(staffToken);

		request.Content = JsonContent.Create(
			new {
				name,
				description = "Test profile used by ResolveStaffProfileUserAssignmentsSpec",
				permissions = new[] {
					AppPermissions.Staff.Profiles.LIST_FOR_STAFF.Key
				},
				emails = Array.Empty<string>(),
			}
		);

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Created);

		var created = await response.Content
			.ReadFromJsonAsync<StaffProfileCreatedResponse>();
		created.Should().NotBeNull();
		Assert.NotNull(created);
		return created.ProfileId.ToString();
	}

	private async Task<string> _GetStaffUserIdByEmailAsync(
		string email,
		string staffToken
	) {
		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			_GetFindStaffUsersUrl(email)
		).WithSessionToken(staffToken);

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<FindStaffUsersResponse>();
		result.Should().NotBeNull();

		Assert.NotNull(result);
		var user = result.Data.FirstOrDefault(u =>
					string.Equals(u.Email, email, StringComparison.OrdinalIgnoreCase)
				);

		if (user is null) {
			throw new InvalidOperationException(
				$"Staff user with email '{email}' not found"
			);
		}

		return user.Id.ToString();
	}

	// -- Response DTOs --
	private record StaffProfileCreatedResponse {
		public Guid ProfileId { get; init; }
	}

	private record FindStaffUsersResponse {
		public List<StaffUserItem> Data { get; init; } = [];
	}

	private record StaffUserItem {
		public Guid Id { get; init; }
		public string Email { get; init; } = string.Empty;
	}
}
