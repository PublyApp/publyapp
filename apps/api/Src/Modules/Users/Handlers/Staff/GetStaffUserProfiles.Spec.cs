using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using MainApi.Localization;
using MainApi.Src.Data.DbContext;
using MainApi.Src.Lib;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Lib.Routes;
using MainApi.Src.Lib.Testing.Fixtures;
using MainApi.Src.Lib.Testing.Helpers;
using MainApi.Src.Lib.Utils;
using MainApi.Src.Modules.Auth.Utils;
using MainApi.Src.Modules.Users.Entities;

using Microsoft.Extensions.DependencyInjection;

using Xunit;

namespace MainApi.Src.Modules.Users.Handlers.Staff;

public sealed class GetStaffUserProfilesSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public GetStaffUserProfilesSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	private static string GetUrl(string userId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForStaff.Root,
			Routes.Users.ForStaff.Profiles.GetFn(userId)
		);
	}

	[Fact]
	public async Task ItShouldReturnUnauthorizedWithoutSession() {
		using var request = new HttpRequestMessage(
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

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl(Guid.NewGuid().ToString())
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForStaffWithoutPermission() {
		// Use an isolated staff user with no profiles, so permissions are guaranteed empty even if
		// other integration tests assign profiles to the seeded staff-user@example.com.
		var token = await CreateUnprivilegedStaffUserTokenAsync();

		// Use an existing user id so the permission failure cannot be masked by a 404.
		var adminToken = await _authClient.LoginAsStaffAdminAsync();
		var existingUserId = await GetStaffUserIdByEmailAsync(
			_http,
			adminToken,
			TestConstants.StaffAdminEmail
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl(existingUserId)
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForMalformedId() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl("not-a-guid")
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		problem!.TranslationKey.Should().Be(ResponseKeys.MalformedId);
	}

	[Fact]
	public async Task ItShouldReturnNotFoundForNonExistentId() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl(Guid.NewGuid().ToString())
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	// This endpoint is mostly a "projection" of the user's current assignments.
	// The more interesting invariants are covered by UpdateStaffUserProfiles.Spec.cs.
	[Fact]
	public async Task ItShouldReturnAssignedProfilesAndMaxLimit() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		var userId = await GetStaffUserIdByEmailAsync(
			_http,
			token,
			TestConstants.StaffUserEmail
		);

		// Create a new staff profile and assign it to the user.
		var profileId = await CreateStaffProfileAsync(token);

		using (var updateRequest = new HttpRequestMessage(
			HttpMethod.Put,
			PathUtils.Join(
				Routes.Staff.Root,
				Routes.Users.ForStaff.Root,
				Routes.Users.ForStaff.Profiles.UpdateFn(userId)
			)
		).WithSessionToken(token)) {
			updateRequest.Content = JsonContent.Create(
				new { profileIds = new[] { profileId } }
			);

			using var updateResponse = await _http.SendAsync(updateRequest);
			updateResponse.StatusCode.Should().Be(HttpStatusCode.OK);
		}

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl(userId)
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<GetStaffUserProfilesResult>();
		result.Should().NotBeNull();
		result!.MaxProfilesPerUser.Should().BeGreaterThan(0);
		result.AssignedProfiles.Should().Contain(p => p.Id == Guid.Parse(profileId));
	}

	[Fact]
	public async Task ItShouldReturnAssignedProfilesForSuspendedStaffUser() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		// Use an isolated staff user to avoid mutating seeded fixtures that other integration tests rely on.
		var userId = await CreateStaffUserIdAsync();

		var profileId = await CreateStaffProfileAsync(token);

		// Assign profile.
		using (var updateRequest = new HttpRequestMessage(
			HttpMethod.Put,
			PathUtils.Join(
				Routes.Staff.Root,
				Routes.Users.ForStaff.Root,
				Routes.Users.ForStaff.Profiles.UpdateFn(userId)
			)
		).WithSessionToken(token)) {
			updateRequest.Content = JsonContent.Create(
				new { profileIds = new[] { profileId } }
			);

			using var updateResponse = await _http.SendAsync(updateRequest);
			updateResponse.StatusCode.Should().Be(HttpStatusCode.OK);
		}

		// Suspend the user (global lifecycle). The profiles endpoint should still be able to render the page.
		using (var suspendRequest = new HttpRequestMessage(
			HttpMethod.Post,
			PathUtils.Join(
				Routes.Staff.Root,
				Routes.Users.ForStaff.Root,
				Routes.Users.ForStaff.SuspendFn(userId)
			)
		).WithSessionToken(token)) {
			using var suspendResponse = await _http.SendAsync(suspendRequest);
			suspendResponse.StatusCode.Should().Be(HttpStatusCode.OK);
		}

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl(userId)
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<GetStaffUserProfilesResult>();
		result.Should().NotBeNull();
		result!.AssignedProfiles.Should().Contain(p => p.Id == Guid.Parse(profileId));
	}

	// -- Helpers --

	private async Task<string> CreateStaffProfileAsync(string staffToken) {
		var url = PathUtils.Join(
			Routes.Staff.Root,
			Routes.Profiles.ForStaff.Root,
			Routes.Profiles.ForStaff.Create
		);

		var name = "Test User Profiles " + Guid.NewGuid().ToString("N")[..8];

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			url
		).WithSessionToken(staffToken);

		request.Content = JsonContent.Create(
			new {
				name,
				description = "Test profile used by GetStaffUserProfilesSpec",
				permissions = new[] {
					AppPermissions.Staff.Users.LIST_FOR_STAFF.Key,
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

	private async Task<string> CreateStaffUserIdAsync() {
		var email = $"staff-profiles-suspended-{Guid.NewGuid():N}@example.com";

		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<MainApiDbContext>();

		var user = new User {
			Email = email,
			Password = PasswordUtils.HashPassword(TestConstants.SeedPassword),
			FirstName = "Suspended",
			LastName = "StaffUser",
			IsVerified = true,
			Status = UserStatus.Active,
		};

		_ = dbContext.User.Add(user);
		_ = await dbContext.SaveChangesAsync();

		var userId = user.GetRequiredId();
		var staffAccount = UserAccount.CreateStaffAccount(userId, AccountLevel.User);
		staffAccount.ValidateAccountType();
		_ = dbContext.UserAccount.Add(staffAccount);
		_ = await dbContext.SaveChangesAsync();

		return userId.ToString();
	}

	private async Task<string> CreateUnprivilegedStaffUserTokenAsync() {
		var email = $"no-perms-{Guid.NewGuid():N}@example.com";

		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<MainApiDbContext>();

		var user = new User {
			Email = email,
			Password = PasswordUtils.HashPassword(TestConstants.SeedPassword),
			FirstName = "NoPerm",
			LastName = "User",
			IsVerified = true,
			Status = UserStatus.Active,
		};

		_ = dbContext.User.Add(user);
		_ = await dbContext.SaveChangesAsync();

		var userId = user.GetRequiredId();
		var staffAccount = UserAccount.CreateStaffAccount(userId, AccountLevel.User);
		staffAccount.ValidateAccountType();
		_ = dbContext.UserAccount.Add(staffAccount);
		_ = await dbContext.SaveChangesAsync();

		return await _authClient.LoginAsync(email, TestConstants.SeedPassword);
	}

	// -- Response DTOs --

	private class FindStaffUsersResponse : CursorPaginatedResult<StaffUserItem> { }

	private record StaffUserItem {
		public Guid Id { get; init; }
		public string Email { get; init; } = string.Empty;
	}

	private record StaffProfileCreatedResponse {
		public Guid ProfileId { get; init; }
	}
}
