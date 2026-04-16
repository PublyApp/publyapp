namespace MainApi.Src.Modules.Profiles.Handlers.Staff;

using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

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

public sealed class UnassignStaffProfileUsersSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public UnassignStaffProfileUsersSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	private static string GetCreateProfileUrl() {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Profiles.ForStaff.Root,
			Routes.Profiles.ForStaff.Create
		);
	}

	private static string GetFindUsersUrl(string profileId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Profiles.ForStaff.Root,
			Routes.Profiles.ForStaff.Users.FindFn(profileId)
		);
	}

	private static string GetUnassignUrl(string profileId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Profiles.ForStaff.Root,
			Routes.Profiles.ForStaff.Users.UnassignFn(profileId)
		);
	}

	[Fact]
	public async Task ItShouldReturnUnauthorizedWithoutSession() {
		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetUnassignUrl(Guid.NewGuid().ToString())
		);
		request.Content = JsonContent.Create(new { userIds = new[] { Guid.NewGuid() } });

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task ItShouldReturnUnauthorizedWithInvalidSession() {
		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetUnassignUrl(Guid.NewGuid().ToString())
		).WithSessionToken("invalid-token");
		request.Content = JsonContent.Create(new { userIds = new[] { Guid.NewGuid() } });

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForTenantUser() {
		var token = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetUnassignUrl(Guid.NewGuid().ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { userIds = new[] { Guid.NewGuid() } });

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForStaffWithoutPermission() {
		var token = await CreateUnprivilegedStaffUserTokenAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetUnassignUrl(Guid.NewGuid().ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { userIds = new[] { Guid.NewGuid() } });

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForMalformedProfileId() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetUnassignUrl("not-a-guid")
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { userIds = new[] { Guid.NewGuid() } });

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
	}

	[Fact]
	public async Task ItShouldReturnUnprocessableEntityWhenTooManyUserIdsAreSubmitted() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var userIds = Enumerable.Range(0, 201)
			.Select(_ => Guid.NewGuid())
			.ToArray();

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetUnassignUrl(Guid.NewGuid().ToString())
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { userIds });

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
	}

	[Fact]
	public async Task ItShouldUnassignUsersFromProfile() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		// Create a staff profile and assign the seeded staff admin user to it.
		var profileId = await CreateStaffProfileAsync(
			token,
			"Unassign Users Spec",
			emails: new[] { TestConstants.StaffAdminEmail }
		);

		var staffAdminUserId = await GetUserIdByEmailAsync(token, TestConstants.StaffAdminEmail);

		// Sanity: the user should appear in the profile users list.
		(await FindUserIdsAsync(token, profileId))
			.Should()
			.Contain(staffAdminUserId);

		using var unassignRequest = new HttpRequestMessage(
			HttpMethod.Post,
			GetUnassignUrl(profileId)
		).WithSessionToken(token);
		unassignRequest.Content = JsonContent.Create(new { userIds = new[] { staffAdminUserId } });

		using var unassignResponse = await _http.SendAsync(unassignRequest);
		unassignResponse.StatusCode.Should().Be(HttpStatusCode.OK);

		// The user should no longer appear in the profile users list.
		(await FindUserIdsAsync(token, profileId))
			.Should()
			.NotContain(staffAdminUserId);
	}

	private async Task<string> CreateStaffProfileAsync(
		string token,
		string name,
		string[] emails
	) {
		using var request = new HttpRequestMessage(HttpMethod.Post, GetCreateProfileUrl())
			.WithSessionToken(token);
		request.Content = JsonContent.Create(
			new {
				name,
				description = "Test profile for UnassignStaffProfileUsersSpec",
				permissions = new[] { AppPermissions.Staff.Profiles.GET_FOR_STAFF.Key },
				emails,
			}
		);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Created);

		var body = await response.Content.ReadFromJsonAsync<StaffProfileCreated>();
		body.Should().NotBeNull();
		body!.ProfileId.Should().NotBe(Guid.Empty);

		return body.ProfileId.ToString();
	}

	private async Task<string> GetUserIdByEmailAsync(string token, string email) {
		// Find staff users supports searching by q. We use it to resolve the seeded user ID
		// without hard-coding it in test constants.
		var url = PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForStaff.Root,
			Routes.Users.ForStaff.Find
		) + "?limit=50";

		using var request = new HttpRequestMessage(HttpMethod.Get, url).WithSessionToken(token);
		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<FindStaffUsersResponse>();
		result.Should().NotBeNull();

		var user = result!.Data.FirstOrDefault(
			u => string.Equals(u.Email, email, StringComparison.OrdinalIgnoreCase)
		);
		user.Should().NotBeNull();
		user!.Id.Should().NotBe(Guid.Empty);

		return user.Id.ToString();
	}

	private async Task<List<string>> FindUserIdsAsync(string token, string profileId) {
		var url = GetFindUsersUrl(profileId) + "?page=1&limit=50&sort_id=created_at&sort_order=desc";
		using var request = new HttpRequestMessage(HttpMethod.Get, url).WithSessionToken(token);
		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content.ReadFromJsonAsync<FindStaffProfileUsersResult>();
		result.Should().NotBeNull();
		return result!.Users.Select(u => u.Id.ToString()).ToList();
	}

	private async Task<string> CreateUnprivilegedStaffUserTokenAsync() {
		var email = $"no-perms-{Guid.NewGuid():N}@example.com";

		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<MainApiDbContext>();

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

	// Local test response types:
	private sealed class FindStaffUsersResponse : CursorPaginatedResult<StaffUserItem> { }

	private sealed record StaffUserItem {
		public required Guid Id { get; init; }
		public required string Email { get; init; }
	}
}
