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
using MainApi.Src.Modules.Profiles.Entities;
using MainApi.Src.Modules.Tenants.Entities;
using MainApi.Src.Modules.Users.Entities;

using Microsoft.Extensions.DependencyInjection;

using Xunit;

namespace MainApi.Src.Modules.Users.Handlers.Staff;

public sealed class UpdateStaffUserProfilesSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public UpdateStaffUserProfilesSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	private static string GetUrl(string userId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForStaff.Root,
			Routes.Users.ForStaff.Profiles.UpdateFn(userId)
		);
	}

	[Fact]
	public async Task ItShouldReturnUnauthorizedWithoutSession() {
		using var request = new HttpRequestMessage(
			HttpMethod.Put,
			GetUrl(Guid.NewGuid().ToString())
		) {
			Content = JsonContent.Create(new { profileIds = Array.Empty<string>() })
		};

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
			HttpMethod.Put,
			GetUrl(Guid.NewGuid().ToString())
		).WithSessionToken(token);

		request.Content = JsonContent.Create(new { profileIds = Array.Empty<string>() });

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
			HttpMethod.Put,
			GetUrl(existingUserId)
		).WithSessionToken(token);

		request.Content = JsonContent.Create(new { profileIds = Array.Empty<string>() });

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForMalformedId() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Put,
			GetUrl("not-a-guid")
		).WithSessionToken(token);

		request.Content = JsonContent.Create(new { profileIds = Array.Empty<string>() });

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
			HttpMethod.Put,
			GetUrl(Guid.NewGuid().ToString())
		).WithSessionToken(token);

		request.Content = JsonContent.Create(new { profileIds = Array.Empty<string>() });

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task ItShouldReturnValidationProblemWhenMaxProfilesExceeded() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var userId = await GetStaffUserIdByEmailAsync(
			_http,
			token,
			TestConstants.StaffUserEmail
		);

		// Create more profiles than allowed by MAX_PROFILES_PER_USER (5 by default).
		var profileIds = new List<string>();
		for (var i = 0; i < 6; i++) {
			profileIds.Add(await CreateStaffProfileAsync(token));
		}

		using var request = new HttpRequestMessage(
			HttpMethod.Put,
			GetUrl(userId)
		).WithSessionToken(token);

		request.Content = JsonContent.Create(new { profileIds });

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);

		var problem = await response.Content
			.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		problem!.TranslationKey.Should().Be(ResponseKeys.MaxProfilesPerUserExceeded);
		problem.Errors.Should().ContainKey("profileIds");
	}

	[Fact]
	public async Task ItShouldReturnValidationProblemWhenProfilesNotFound() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var userId = await GetStaffUserIdByEmailAsync(
			_http,
			token,
			TestConstants.StaffUserEmail
		);

		var missingId = Guid.NewGuid().ToString();

		using var request = new HttpRequestMessage(
			HttpMethod.Put,
			GetUrl(userId)
		).WithSessionToken(token);

		request.Content = JsonContent.Create(new { profileIds = new[] { missingId } });

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
	}

	[Fact]
	public async Task ItShouldReturnValidationProblemWhenProfilesNotStaffScope() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var userId = await GetStaffUserIdByEmailAsync(
			_http,
			token,
			TestConstants.StaffUserEmail
		);

		var tenantProfileId = await CreateTenantProfileAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Put,
			GetUrl(userId)
		).WithSessionToken(token);

		request.Content = JsonContent.Create(new { profileIds = new[] { tenantProfileId } });

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);

		var problem = await response.Content
			.ReadFromJsonAsync<ValidationProblemDetails>();
		problem.Should().NotBeNull();
		problem!.TranslationKey.Should().Be(ResponseKeys.ProfileNotStaffScope);
	}

	[Fact]
	public async Task ItShouldTreatPayloadAsSetAndReturnAssignedProfiles() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var userId = await GetStaffUserIdByEmailAsync(
			_http,
			token,
			TestConstants.StaffUserEmail
		);

		var profileId = await CreateStaffProfileAsync(token);

		using var request = new HttpRequestMessage(
			HttpMethod.Put,
			GetUrl(userId)
		).WithSessionToken(token);

		// Intentionally send duplicates: the endpoint treats profileIds as a set.
		request.Content = JsonContent.Create(new { profileIds = new[] { profileId, profileId } });

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<UpdateStaffUserProfilesResult>();
		result.Should().NotBeNull();
		result!.AssignedProfiles.Should().ContainSingle(p => p.Id == Guid.Parse(profileId));
	}

	// -- Helpers --

	private async Task<string> CreateStaffProfileAsync(string staffToken) {
		var url = PathUtils.Join(
			Routes.Staff.Root,
			Routes.Profiles.ForStaff.Root,
			Routes.Profiles.ForStaff.Create
		);

		var name = "Test Update Profiles " + Guid.NewGuid().ToString("N")[..8];

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			url
		).WithSessionToken(staffToken);

		request.Content = JsonContent.Create(
			new {
				name,
				description = "Test profile used by UpdateStaffUserProfilesSpec",
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

	private async Task<string> CreateTenantProfileAsync() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<MainApiDbContext>();

		var tenant = new Tenant {
			Code = "tp-" + Guid.NewGuid().ToString("N")[..10],
			Name = "Test Tenant " + Guid.NewGuid().ToString("N")[..8],
			MaxUsers = 10,
			Status = TenantStatus.Active,
		};
		_ = dbContext.Tenant.Add(tenant);
		_ = await dbContext.SaveChangesAsync();

		var profile = Profile.CreateTenantProfile(
			tenantId: tenant.GetRequiredId(),
			name: "Tenant Profile " + Guid.NewGuid().ToString("N")[..8],
			description: "Non-staff profile used by UpdateStaffUserProfilesSpec"
		);
		profile.ValidateProfileType();

		_ = dbContext.Profile.Add(profile);
		_ = await dbContext.SaveChangesAsync();

		return profile.GetRequiredId().ToString();
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

	private record UpdateStaffUserProfilesResult {
		public List<StaffUserProfileItem> AssignedProfiles { get; init; } = [];
	}

	private record StaffUserProfileItem {
		public Guid Id { get; init; }
		public string Name { get; init; } = string.Empty;
	}
}
