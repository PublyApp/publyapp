
using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Auth.Utils;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Roles.Handlers.Staff;

public sealed class DeleteStaffRoleSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public DeleteStaffRoleSpec(ApiFixture fixture) {
		this._Fixture = fixture;
		this._Http = fixture.HttpClient;
		this._AuthClient = new TestAuthClient(this._Http);
	}

	private static string _GetCreateRoleUrl() {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Roles.ForStaff.Root,
			Routes.Roles.ForStaff.Create
		);
	}

	private static string _GetDeleteRoleUrl(string roleId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Roles.ForStaff.Root,
			Routes.Roles.ForStaff.DeleteFn(roleId)
		);
	}

	private static string _GetGetRoleUrl(string roleId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Roles.ForStaff.Root,
			Routes.Roles.ForStaff.GetFn(roleId)
		);
	}

	[Fact]
	public async Task ItShouldReturnUnauthorizedWithoutSession() {
		using var request = new HttpRequestMessage(
			HttpMethod.Delete,
			DeleteStaffRoleSpec._GetDeleteRoleUrl(Guid.NewGuid().ToString())
		);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task ItShouldReturnUnauthorizedWithInvalidSession() {
		using var request = new HttpRequestMessage(
			HttpMethod.Delete,
			DeleteStaffRoleSpec._GetDeleteRoleUrl(Guid.NewGuid().ToString())
		).WithSessionToken("invalid-token");

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForTenantUser() {
		var token = await this._AuthClient.LoginAsAcmeAdminAsync();

		using var response = await this._Http.SendWithSessionAsync(
			HttpMethod.Delete,
			DeleteStaffRoleSpec._GetDeleteRoleUrl(Guid.NewGuid().ToString()),
			token
		);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForStaffWithoutPermission() {
		var token = await this._CreateUnprivilegedStaffUserTokenAsync();

		using var response = await this._Http.SendWithSessionAsync(
			HttpMethod.Delete,
			DeleteStaffRoleSpec._GetDeleteRoleUrl(Guid.NewGuid().ToString()),
			token
		);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForMalformedRoleId() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();

		using var response = await this._Http.SendWithSessionAsync(
			HttpMethod.Delete,
			DeleteStaffRoleSpec._GetDeleteRoleUrl("not-a-guid"),
			token
		);
		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
	}

	[Fact]
	public async Task ItShouldReturnNotFoundForMissingRole() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();

		using var response = await this._Http.SendWithSessionAsync(
			HttpMethod.Delete,
			DeleteStaffRoleSpec._GetDeleteRoleUrl(Guid.NewGuid().ToString()),
			token
		);
		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task ItShouldDeleteStaffRole() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var roleId = await this._CreateStaffRoleAsync(token, "Delete Role Spec");

		using var deleteRequest = new HttpRequestMessage(
			HttpMethod.Delete,
			DeleteStaffRoleSpec._GetDeleteRoleUrl(roleId)
		).WithSessionToken(token);

		using var deleteResponse = await this._Http.SendAsync(deleteRequest);
		deleteResponse.StatusCode.Should().Be(HttpStatusCode.OK);

		// Role should no longer be accessible.
		using var getRequest = new HttpRequestMessage(
			HttpMethod.Get,
			DeleteStaffRoleSpec._GetGetRoleUrl(roleId)
		).WithSessionToken(token);

		using var getResponse = await this._Http.SendAsync(getRequest);
		getResponse.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	private async Task<string> _CreateStaffRoleAsync(string token, string name) {
		using var request = new HttpRequestMessage(HttpMethod.Post, DeleteStaffRoleSpec._GetCreateRoleUrl())
			.WithSessionToken(token);
		request.Content = JsonContent.Create(
			new {
				name,
				description = "Test role for DeleteStaffRoleSpec",
				permissions = new[] { AppPermissions.Staff.Roles.GET_FOR_STAFF.Key },
				emails = Array.Empty<string>(),
			}
		);

		using var response = await this._Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Created);

		var body = await response.Content.ReadFromJsonAsync<StaffRoleCreated>();
		body.Should().NotBeNull();
		Assert.NotNull(body);
		body.RoleId.Should().NotBe(Guid.Empty);

		return body.RoleId.ToString();
	}

	private async Task<string> _CreateUnprivilegedStaffUserTokenAsync() {
		var email = $"no-perms-{Guid.NewGuid():N}@example.com";

		await using var db = this._Fixture.OpenDb();

		var user = new User {
			Email = email,
			Password = PasswordUtils.HashPassword(TestConstants.SeedPassword),
			FirstName = "NoPerm",
			LastName = "User",
			IsVerified = true,
			Status = UserStatus.Active,
		};

		_ = db.Context.User.Add(user);
		_ = await db.Context.SaveChangesAsync();

		var userId = user.GetRequiredId();
		var staffAccount = UserAccount.CreateStaffAccount(userId);
		staffAccount.ValidateAccountType();
		_ = db.Context.UserAccount.Add(staffAccount);
		_ = await db.Context.SaveChangesAsync();

		return await this._AuthClient.LoginAsync(email, TestConstants.SeedPassword);
	}
}
