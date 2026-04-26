using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using MainApi.Src.Data.DbContext;
using MainApi.Src.Lib;
using MainApi.Src.Lib.Routes;
using MainApi.Src.Lib.Testing.Fixtures;
using MainApi.Src.Lib.Testing.Helpers;
using MainApi.Src.Lib.Utils;
using MainApi.Src.Modules.Auth.Utils;
using MainApi.Src.Modules.Users.Entities;

using Microsoft.Extensions.DependencyInjection;

using Xunit;

namespace MainApi.Src.Modules.Users.Handlers.Staff;

public sealed class StaffUserDangerZonePermissionsSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public StaffUserDangerZonePermissionsSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	private static string GetSuspendUrl(string userId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForStaff.Root,
			Routes.Users.ForStaff.SuspendFn(userId)
		);
	}

	private static string GetReactivateUrl(string userId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForStaff.Root,
			Routes.Users.ForStaff.ReactivateFn(userId)
		);
	}

	private static string GetBulkSuspendUrl() {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForStaff.Root,
			Routes.Users.ForStaff.BulkSuspend
		);
	}

	private static string GetBulkReactivateUrl() {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForStaff.Root,
			Routes.Users.ForStaff.BulkReactivate
		);
	}

	private static string GetUpdateEmailUrl(string userId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForStaff.Root,
			Routes.Users.ForStaff.UpdateEmailFn(userId)
		);
	}

	private static string GetDeleteUrl(string userId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Users.ForStaff.Root,
			Routes.Users.ForStaff.DeleteFn(userId)
		);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForStaffWithoutSuspendPermission() {
		var token = await CreateUnprivilegedStaffUserTokenAsync();

		var adminToken = await _authClient.LoginAsStaffAdminAsync();
		var existingUserId = await GetStaffUserIdByEmailAsync(
			_http,
			adminToken,
			TestConstants.StaffAdminEmail
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetSuspendUrl(existingUserId)
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForStaffWithoutReactivatePermission() {
		var token = await CreateUnprivilegedStaffUserTokenAsync();

		var adminToken = await _authClient.LoginAsStaffAdminAsync();
		var existingUserId = await GetStaffUserIdByEmailAsync(
			_http,
			adminToken,
			TestConstants.StaffAdminEmail
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetReactivateUrl(existingUserId)
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForStaffWithoutBulkSuspendPermission() {
		var token = await CreateUnprivilegedStaffUserTokenAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetBulkSuspendUrl()
		).WithSessionToken(token);

		request.Content = JsonContent.Create(new {
			userIds = new[] { Guid.NewGuid() }
		});

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForStaffWithoutBulkReactivatePermission() {
		var token = await CreateUnprivilegedStaffUserTokenAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			GetBulkReactivateUrl()
		).WithSessionToken(token);

		request.Content = JsonContent.Create(new {
			userIds = new[] { Guid.NewGuid() }
		});

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForStaffWithoutUpdateEmailPermission() {
		var token = await CreateUnprivilegedStaffUserTokenAsync();

		var adminToken = await _authClient.LoginAsStaffAdminAsync();
		var existingUserId = await GetStaffUserIdByEmailAsync(
			_http,
			adminToken,
			TestConstants.StaffAdminEmail
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Patch,
			GetUpdateEmailUrl(existingUserId)
		).WithSessionToken(token);

		request.Content = JsonContent.Create(
			new { email = $"new-email-{Guid.NewGuid():N}@example.com" }
		);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForStaffWithoutDeletePermission() {
		var token = await CreateUnprivilegedStaffUserTokenAsync();
		var adminToken = await _authClient.LoginAsStaffAdminAsync();
		var existingUserId = await GetStaffUserIdByEmailAsync(
			_http,
			adminToken,
			TestConstants.StaffAdminEmail
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Delete,
			GetDeleteUrl(existingUserId)
		).WithSessionToken(token);

		using var response = await _http.SendAsync(request);
		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	// -- Helpers --

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
}
