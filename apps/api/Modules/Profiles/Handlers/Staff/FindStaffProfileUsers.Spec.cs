
using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Profiles.Handlers.Staff;

public sealed class FindStaffProfileUsersSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public FindStaffProfileUsersSpec(ApiFixture fixture) {
		_Fixture = fixture;
		_Http = fixture.HttpClient;
		_AuthClient = new TestAuthClient(_Http);
	}

	private static string _GetUrl(string profileId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Profiles.ForStaff.Root,
			Routes.Profiles.ForStaff.Users.FindFn(profileId)
		);
	}

	private static string _GetCreateProfileUrl() {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Profiles.ForStaff.Root,
			Routes.Profiles.ForStaff.Create
		);
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
		var request = new HttpRequestMessage(
			HttpMethod.Get,
			_GetUrl(Guid.NewGuid().ToString())
		);

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForNonStaffUser() {
		var token = await _AuthClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		var request = new HttpRequestMessage(
			HttpMethod.Get,
			_GetUrl(Guid.NewGuid().ToString())
		).WithSessionToken(token);

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForStaffWithoutPermission() {
		var token = await _AuthClient.LoginAsync(
			TestConstants.StaffUserEmail,
			TestConstants.SeedPassword
		);

		var request = new HttpRequestMessage(
			HttpMethod.Get,
			_GetUrl(Guid.NewGuid().ToString())
		).WithSessionToken(token);

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForMalformedProfileId() {
		var token = await _AuthClient.LoginAsStaffAdminAsync();

		var request = new HttpRequestMessage(
			HttpMethod.Get,
			_GetUrl("not-a-guid")
		).WithSessionToken(token);

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
	}

	[Fact]
	public async Task ItShouldReturnNotFoundForNonExistentProfile() {
		var token = await _AuthClient.LoginAsStaffAdminAsync();

		var request = new HttpRequestMessage(
			HttpMethod.Get,
			_GetUrl(Guid.NewGuid().ToString())
		).WithSessionToken(token);

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NotFound);

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
	}

	[Fact]
	public async Task ItShouldReturnAssignedUsers() {
		var token = await _AuthClient.LoginAsStaffAdminAsync();

		var profileId = await _CreateStaffProfileAsync(token);

		var staffUserId = await _GetStaffUserIdByEmailAsync(
			_Http,
			token,
			TestConstants.StaffUserEmail
		);

		// Assign the newly created profile to the staff user.
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

		var url = _GetUrl(profileId) + "?limit=50&sort_id=created_at&sort_order=desc";

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			url
		).WithSessionToken(token);

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<FindStaffProfileUsersResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.Users.Should().Contain(u =>
					string.Equals(u.Email, TestConstants.StaffUserEmail, StringComparison.OrdinalIgnoreCase)
				);
		result.Count.Should().BeGreaterThan(0);
	}

	[Fact]
	public async Task ItShouldSupportSearchByQ() {
		var token = await _AuthClient.LoginAsStaffAdminAsync();
		var profileId = await _CreateStaffProfileAsync(token);

		var alphaEmail = $"alpha.profile-{Guid.NewGuid():N}@example.com";
		var betaEmail = $"beta.profile-{Guid.NewGuid():N}@example.com";

		var alphaUserId = await _CreateStaffUserAsync(token, alphaEmail, firstName: "Alpha");
		var betaUserId = await _CreateStaffUserAsync(token, betaEmail, firstName: "Beta");

		await _AssignProfileToStaffUserAsync(token, alphaUserId, profileId);
		await _AssignProfileToStaffUserAsync(token, betaUserId, profileId);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			_GetUrl(profileId) + "?limit=50&q=alpha.profile"
		).WithSessionToken(token);

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<FindStaffProfileUsersResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.Users.Should().Contain(u =>
					string.Equals(u.Email, alphaEmail, StringComparison.OrdinalIgnoreCase)
				);
		result.Users.Should().NotContain(u =>
			string.Equals(u.Email, betaEmail, StringComparison.OrdinalIgnoreCase)
		);
	}

	[Fact]
	public async Task ItShouldTreatABarePercentSearchAsALiteralCharacterNotAWildcard() {
		var token = await _AuthClient.LoginAsStaffAdminAsync();
		var profileId = await _CreateStaffProfileAsync(token);
		var marker = Guid.NewGuid().ToString("N")[..8];

		var withPercentEmail = $"has-percent-{marker}@example.com";
		var withoutPercentEmail = $"no-percent-{marker}@example.com";

		var withPercentUserId = await _CreateStaffUserAsync(
			token, withPercentEmail, firstName: $"Has%Percent{marker}"
		);
		var withoutPercentUserId = await _CreateStaffUserAsync(
			token, withoutPercentEmail, firstName: $"NoPercentAtAll{marker}"
		);

		await _AssignProfileToStaffUserAsync(token, withPercentUserId, profileId);
		await _AssignProfileToStaffUserAsync(token, withoutPercentUserId, profileId);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			_GetUrl(profileId) + $"?limit=50&q={Uri.EscapeDataString("%")}"
		).WithSessionToken(token);

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<FindStaffProfileUsersResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);

		// If '%' were interpolated unescaped into the ILIKE pattern, "%%%"
		// collapses to a bare wildcard matching every row. Escaped, only the
		// user whose name literally contains '%' may match.
		result.Users.Should().Contain(u =>
					string.Equals(u.Email, withPercentEmail, StringComparison.OrdinalIgnoreCase)
				);
		result.Users.Should().NotContain(u =>
			string.Equals(u.Email, withoutPercentEmail, StringComparison.OrdinalIgnoreCase)
		);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForInvalidSortId() {
		var token = await _AuthClient.LoginAsStaffAdminAsync();
		var profileId = await _CreateStaffProfileAsync(token);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			_GetUrl(profileId) + "?limit=50&sort_id=not_real"
		).WithSessionToken(token);

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
	}

	[Fact]
	public async Task ItShouldSortByEmailAscending() {
		var token = await _AuthClient.LoginAsStaffAdminAsync();
		var profileId = await _CreateStaffProfileAsync(token);

		var emailA = $"a.sort-{Guid.NewGuid():N}@example.com";
		var emailB = $"b.sort-{Guid.NewGuid():N}@example.com";

		var userIdB = await _CreateStaffUserAsync(token, emailB, firstName: "Bee");
		var userIdA = await _CreateStaffUserAsync(token, emailA, firstName: "Aye");

		await _AssignProfileToStaffUserAsync(token, userIdB, profileId);
		await _AssignProfileToStaffUserAsync(token, userIdA, profileId);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			_GetUrl(profileId) + "?limit=50&sort_id=email&sort_order=asc"
		).WithSessionToken(token);

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<FindStaffProfileUsersResponse>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		result.Users.Select(u => u.Email).Should().BeInAscendingOrder();
	}

	[Fact]
	public async Task ItShouldSortByStatusAscending() {
		var token = await _AuthClient.LoginAsStaffAdminAsync();
		var profileId = await _CreateStaffProfileAsync(token);

		var activeEmail = $"active.sort-{Guid.NewGuid():N}@example.com";
		var suspendedEmail = $"suspended.sort-{Guid.NewGuid():N}@example.com";

		var activeUserId = await _CreateStaffUserAsync(token, activeEmail, firstName: "Active");
		var suspendedUserId = await _CreateStaffUserAsync(
			token,
			suspendedEmail,
			firstName: "Suspended"
		);

		// Make the values distinct so sorting by status has a deterministic order.
		await _SetStaffUserStatusAsync(activeUserId, UserStatus.Active);
		await _SetStaffUserStatusAsync(suspendedUserId, UserStatus.Suspended);

		await _AssignProfileToStaffUserAsync(token, activeUserId, profileId);
		await _AssignProfileToStaffUserAsync(token, suspendedUserId, profileId);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			_GetUrl(profileId) + "?limit=50&sort_id=status&sort_order=asc"
		).WithSessionToken(token);

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<FindStaffProfileUsersResponse>();
		result.Should().NotBeNull();

		// Sorting is based on enum numeric values: Suspended (30) comes before Active (40).
		Assert.NotNull(result);
		result.Users.First().Email.Should().Be(suspendedEmail);
	}

	[Fact]
	public async Task ItShouldAcceptAllSupportedSortIds() {
		var token = await _AuthClient.LoginAsStaffAdminAsync();
		var profileId = await _CreateStaffProfileAsync(token);

		var staffUserId = await _GetStaffUserIdByEmailAsync(
			_Http,
			token,
			TestConstants.StaffUserEmail
		);

		await _AssignProfileToStaffUserAsync(token, staffUserId, profileId);

		var sortIds = new[] { "created_at", "email", "first_name", "last_name", "status" };
		foreach (var sortId in sortIds) {
			using var request = new HttpRequestMessage(
				HttpMethod.Get,
				_GetUrl(profileId) + $"?limit=50&sort_id={sortId}&sort_order=desc"
			).WithSessionToken(token);

			using var response = await _Http.SendAsync(request);
			response.StatusCode.Should().Be(HttpStatusCode.OK);
		}
	}

	// -- Helper methods --

	private static async Task<string> _GetStaffUserIdByEmailAsync(
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

		var user = result.Data.FirstOrDefault(
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

	private async Task<string> _CreateStaffProfileAsync(string staffToken) {
		var url = _GetCreateProfileUrl();

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

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Created);

		var created = await response.Content.ReadFromJsonAsync<StaffProfileCreatedResponse>();
		created.Should().NotBeNull();
		Assert.NotNull(created);
		return created.ProfileId.ToString();
	}

	private async Task<string> _CreateStaffUserAsync(
		string staffToken,
		string email,
		string? firstName = null,
		string? lastName = null
	) {
		_ = staffToken;
		// Direct create is intentionally unmapped; profile tests seed setup users directly.
		var userId = await StaffUserTestHelper.SeedStaffUserAsync(
			_Fixture,
			email,
			firstName: firstName ?? "Test",
			lastName: lastName ?? "User"
		);
		return userId.ToString();
	}

	private async Task _AssignProfileToStaffUserAsync(
		string staffToken,
		string userId,
		string profileId
	) {
		using var request = new HttpRequestMessage(
			HttpMethod.Put,
			_GetUpdateUserProfilesUrl(userId)
		).WithSessionToken(staffToken);

		request.Content = JsonContent.Create(
			new { profileIds = new[] { profileId } }
		);

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);
	}

	private async Task _SetStaffUserStatusAsync(string userId, UserStatus status) {
		await using var scope = _Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var id = Guid.Parse(userId);
		var user = await dbContext.User.FindAsync(id);
		if (user is null) {
			throw new InvalidOperationException("User not found for status update");
		}

		user.Status = status;
		_ = await dbContext.SaveChangesAsync();
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

	private class FindStaffUsersResponse : CursorPaginatedResult<StaffUserItem> { }

	private record StaffUserItem {
		public Guid Id { get; init; }
		public string Email { get; init; } = string.Empty;
	}

	private record StaffProfileCreatedResponse {
		public Guid ProfileId { get; init; }
	}
}
