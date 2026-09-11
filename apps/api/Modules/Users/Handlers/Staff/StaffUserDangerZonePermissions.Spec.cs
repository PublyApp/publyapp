using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Auth.Utils;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Users.Handlers.Staff;

public sealed class StaffUserDangerZonePermissionsSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public StaffUserDangerZonePermissionsSpec(ApiFixture fixture) {
		_Fixture = fixture;
		_Http = fixture.HttpClient;
		_AuthClient = new TestAuthClient(_Http);
	}

	private static string _GetSuspendUrl(string userId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForStaff.Root,
			Routes.Users.ForStaff.SuspendFn(userId)
		);
	}

	private static string _GetReactivateUrl(string userId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForStaff.Root,
			Routes.Users.ForStaff.ReactivateFn(userId)
		);
	}

	private static string _GetBulkSuspendUrl() {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForStaff.Root,
			Routes.Users.ForStaff.BulkSuspend
		);
	}

	private static string _GetBulkReactivateUrl() {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForStaff.Root,
			Routes.Users.ForStaff.BulkReactivate
		);
	}

	private static string _GetBulkDeleteUrl() {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForStaff.Root,
			"/bulk-delete"
		);
	}

	private static string _GetUpdateEmailUrl(string userId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForStaff.Root,
			Routes.Users.ForStaff.UpdateEmailFn(userId)
		);
	}

	private static string _GetDeleteUrl(string userId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForStaff.Root,
			Routes.Users.ForStaff.DeleteFn(userId)
		);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForStaffWithoutSuspendPermission() {
		var token = await _CreateUnprivilegedStaffUserTokenAsync();

		var adminToken = await _AuthClient.LoginAsStaffAdminAsync();
		var existingUserId = await _GetStaffUserIdByEmailAsync(
			_Http,
			adminToken,
			TestConstants.StaffAdminEmail
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			_GetSuspendUrl(existingUserId)
		).WithSessionToken(token);

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForStaffWithoutReactivatePermission() {
		var token = await _CreateUnprivilegedStaffUserTokenAsync();

		var adminToken = await _AuthClient.LoginAsStaffAdminAsync();
		var existingUserId = await _GetStaffUserIdByEmailAsync(
			_Http,
			adminToken,
			TestConstants.StaffAdminEmail
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			_GetReactivateUrl(existingUserId)
		).WithSessionToken(token);

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForStaffWithoutBulkSuspendPermission() {
		var token = await _CreateUnprivilegedStaffUserTokenAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			_GetBulkSuspendUrl()
		).WithSessionToken(token);

		request.Content = JsonContent.Create(new {
			userIds = new[] { Guid.NewGuid() }
		});

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForStaffWithoutBulkReactivatePermission() {
		var token = await _CreateUnprivilegedStaffUserTokenAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			_GetBulkReactivateUrl()
		).WithSessionToken(token);

		request.Content = JsonContent.Create(new {
			userIds = new[] { Guid.NewGuid() }
		});

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForStaffWithoutBulkDeletePermission() {
		var token = await _CreateUnprivilegedStaffUserTokenAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			_GetBulkDeleteUrl()
		).WithSessionToken(token);

		request.Content = JsonContent.Create(new {
			userIds = new[] { Guid.NewGuid() }
		});

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForStaffWithoutUpdateEmailPermission() {
		var token = await _CreateUnprivilegedStaffUserTokenAsync();

		var adminToken = await _AuthClient.LoginAsStaffAdminAsync();
		var existingUserId = await _GetStaffUserIdByEmailAsync(
			_Http,
			adminToken,
			TestConstants.StaffAdminEmail
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			_GetUpdateEmailUrl(existingUserId)
		).WithSessionToken(token);

		request.Content = JsonContent.Create(
			new { email = $"new-email-{Guid.NewGuid():N}@example.com" }
		);

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForStaffWithoutDeletePermission() {
		var token = await _CreateUnprivilegedStaffUserTokenAsync();
		var adminToken = await _AuthClient.LoginAsStaffAdminAsync();
		var existingUserId = await _GetStaffUserIdByEmailAsync(
			_Http,
			adminToken,
			TestConstants.StaffAdminEmail
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Delete,
			_GetDeleteUrl(existingUserId)
		).WithSessionToken(token);

		using var response = await _Http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	// -- Helpers --

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

	private async Task<string> _CreateUnprivilegedStaffUserTokenAsync() {
		var email = $"no-perms-{Guid.NewGuid():N}@example.com";

		await using var scope =
			_Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

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

		return await _AuthClient.LoginAsync(email, TestConstants.SeedPassword);
	}

	// -- Response DTOs --

	private class FindStaffUsersResponse : CursorPaginatedResult<StaffUserItem> { }

	private record StaffUserItem {
		public Guid Id { get; init; }
		public string Email { get; init; } = string.Empty;
	}
}
