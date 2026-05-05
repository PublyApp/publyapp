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

public sealed class DeleteStaffProfileSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public DeleteStaffProfileSpec(ApiFixture fixture) {
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

	private static string GetDeleteProfileUrl(string profileId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Profiles.ForStaff.Root,
			Routes.Profiles.ForStaff.DeleteFn(profileId)
		);
	}

	private static string GetGetProfileUrl(string profileId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Profiles.ForStaff.Root,
			Routes.Profiles.ForStaff.GetFn(profileId)
		);
	}

	[Fact]
	public async Task ItShouldReturnUnauthorizedWithoutSession() {
		using var request = new HttpRequestMessage(
			HttpMethod.Delete,
			GetDeleteProfileUrl(Guid.NewGuid().ToString())
		);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task ItShouldReturnUnauthorizedWithInvalidSession() {
		using var request = new HttpRequestMessage(
			HttpMethod.Delete,
			GetDeleteProfileUrl(Guid.NewGuid().ToString())
		).WithSessionToken("invalid-token");

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
			HttpMethod.Delete,
			GetDeleteProfileUrl(Guid.NewGuid().ToString())
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForStaffWithoutPermission() {
		var token = await CreateUnprivilegedStaffUserTokenAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Delete,
			GetDeleteProfileUrl(Guid.NewGuid().ToString())
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForMalformedProfileId() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Delete,
			GetDeleteProfileUrl("not-a-guid")
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
	}

	[Fact]
	public async Task ItShouldReturnNotFoundForMissingProfile() {
		var token = await _authClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Delete,
			GetDeleteProfileUrl(Guid.NewGuid().ToString())
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task ItShouldDeleteStaffProfile() {
		var token = await _authClient.LoginAsStaffAdminAsync();
		var profileId = await CreateStaffProfileAsync(token, "Delete Profile Spec");

		using var deleteRequest = new HttpRequestMessage(
			HttpMethod.Delete,
			GetDeleteProfileUrl(profileId)
		).WithSessionToken(token);

		using var deleteResponse = await _http.SendAsync(deleteRequest);
		deleteResponse.StatusCode.Should().Be(HttpStatusCode.OK);

		// Profile should no longer be accessible.
		using var getRequest = new HttpRequestMessage(
			HttpMethod.Get,
			GetGetProfileUrl(profileId)
		).WithSessionToken(token);

		using var getResponse = await _http.SendAsync(getRequest);
		getResponse.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	private async Task<string> CreateStaffProfileAsync(string token, string name) {
		using var request = new HttpRequestMessage(HttpMethod.Post, GetCreateProfileUrl())
			.WithSessionToken(token);
		request.Content = JsonContent.Create(
			new {
				name,
				description = "Test profile for DeleteStaffProfileSpec",
				permissions = new[] { AppPermissions.Staff.Profiles.GET_FOR_STAFF.Key },
				emails = Array.Empty<string>(),
			}
		);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Created);

		var body = await response.Content.ReadFromJsonAsync<StaffProfileCreated>();
		body.Should().NotBeNull();
		body!.ProfileId.Should().NotBe(Guid.Empty);

		return body.ProfileId.ToString();
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
}
