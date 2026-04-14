
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

namespace MainApi.Src.Modules.Users.Handlers.Staff {
	public sealed class UpdateStaffUserSpec
		: IClassFixture<ApiFixture> {
		private readonly ApiFixture _fixture;
		private readonly HttpClient _http;
		private readonly TestAuthClient _authClient;

		public UpdateStaffUserSpec(ApiFixture fixture) {
			_fixture = fixture;
			_http = fixture.HttpClient;
			_authClient = new TestAuthClient(_http);
		}

		private static string GetUrl(string userId) {
			return PathUtils.Join(
				Routes.Staff.Root,
				Routes.Users.ForStaff.Root,
				Routes.Users.ForStaff.UpdateFn(userId)
			);
		}

		[Fact]
		public async Task
		ItShouldReturnNotFoundForNonExistentId() {
			string token =
				await _authClient.LoginAsStaffAdminAsync();
			string url = GetUrl(Guid.NewGuid().ToString());

			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Patch, url
			).WithSessionToken(token);

			request.Content = JsonContent.Create(
				new { firstName = "Test" }
			);

			using HttpResponseMessage response =
				await _http.SendAsync(request);

			_ = response.StatusCode.Should()
				.Be(HttpStatusCode.NotFound);

			AppProblemDetails? problem = await response.Content
				.ReadFromJsonAsync<AppProblemDetails>();
			_ = problem.Should().NotBeNull();
		}

		[Fact]
		public async Task
		ItShouldReturnBadRequestForMalformedId() {
			string token =
				await _authClient.LoginAsStaffAdminAsync();
			string url = GetUrl("not-a-guid");

			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Patch, url
			).WithSessionToken(token);

			request.Content = JsonContent.Create(
				new { firstName = "Test" }
			);

			using HttpResponseMessage response =
				await _http.SendAsync(request);

			_ = response.StatusCode.Should()
				.Be(HttpStatusCode.BadRequest);

			AppProblemDetails? problem = await response.Content
				.ReadFromJsonAsync<AppProblemDetails>();
			_ = problem.Should().NotBeNull();
		}

		[Fact]
		public async Task
		ItShouldReturnUnauthorizedWithoutSession() {
			string url = GetUrl(Guid.NewGuid().ToString());
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Patch, url
			) {
				Content = JsonContent.Create(
				new { firstName = "Test" }
			)
			};

			using HttpResponseMessage response =
				await _http.SendAsync(request);

			_ = response.StatusCode.Should()
				.Be(HttpStatusCode.Unauthorized);
		}

		[Fact]
		public async Task
		ItShouldReturnForbiddenForNonStaffUser() {
			string token =
				await _authClient.LoginAsync(
					TestConstants.AcmeAdminEmail,
					TestConstants.SeedPassword
				);

			string url = GetUrl(Guid.NewGuid().ToString());
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Patch, url
			).WithSessionToken(token);

			request.Content = JsonContent.Create(
				new { firstName = "Test" }
			);

			using HttpResponseMessage response =
				await _http.SendAsync(request);

			_ = response.StatusCode.Should()
				.Be(HttpStatusCode.Forbidden);
		}

		[Fact]
		public async Task
		ItShouldReturnForbiddenForStaffWithoutPermission() {
			// Use an isolated staff user with no profiles, so permissions are guaranteed empty even if
			// other integration tests assign profiles to the seeded staff-user@example.com.
			string token = await CreateUnprivilegedStaffUserTokenAsync();

			// Use an existing user id so the permission failure cannot be masked by a 404 from the handler.
			string adminToken = await _authClient.LoginAsStaffAdminAsync();
			string existingUserId = await GetStaffUserIdByEmailAsync(
				_http,
				adminToken,
				TestConstants.StaffAdminEmail
			);

			string url = GetUrl(existingUserId);
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Patch, url
			).WithSessionToken(token);

			request.Content = JsonContent.Create(
				new { firstName = "Test" }
			);

			using HttpResponseMessage response =
				await _http.SendAsync(request);

			_ = response.StatusCode.Should()
				.Be(HttpStatusCode.Forbidden);
		}

		[Fact]
		public async Task
		ItShouldUpdateFirstName() {
			string token =
				await _authClient.LoginAsStaffAdminAsync();

			// Get a staff user ID
			string userId = await GetStaffUserIdByEmailAsync(
				_http,
				token,
				TestConstants.StaffUserEmail
			);

			string url = GetUrl(userId);
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Patch, url
			).WithSessionToken(token);

			request.Content = JsonContent.Create(
				new { firstName = "UpdatedFirstName" }
			);

			using HttpResponseMessage response =
				await _http.SendAsync(request);

			_ = response.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			GetStaffUserByIdResult? result = await response.Content
				.ReadFromJsonAsync<GetStaffUserByIdResult>();
			_ = result.Should().NotBeNull();
			_ = result!.FirstName.Should().Be("UpdatedFirstName");
		}

		[Fact]
		public async Task
		ItShouldUpdateAccountLevel() {
			string token =
				await _authClient.LoginAsStaffAdminAsync();

			// Get a staff user ID
			string userId = await GetStaffUserIdByEmailAsync(
				_http,
				token,
				TestConstants.StaffUserEmail
			);

			string url = GetUrl(userId);
			HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Patch, url
			).WithSessionToken(token);

			request.Content = JsonContent.Create(
				new { accountLevel = "admin" }
			);

			using HttpResponseMessage response =
				await _http.SendAsync(request);

			_ = response.StatusCode.Should()
				.Be(HttpStatusCode.OK);

			GetStaffUserByIdResult? result = await response.Content
				.ReadFromJsonAsync<GetStaffUserByIdResult>();
			_ = result.Should().NotBeNull();
			_ = result!.AccountLevel.Should().Be("Admin");
		}

		// -- Helper methods --

		private static async Task<string> GetStaffUserIdByEmailAsync(
			HttpClient http,
			string staffToken,
			string email
		) {
			string url = PathUtils.Join(
				Routes.Staff.Root,
				Routes.Users.ForStaff.Root,
				Routes.Users.ForStaff.Find
			) + "?limit=50";

			using HttpRequestMessage request = new HttpRequestMessage(
				HttpMethod.Get, url
			).WithSessionToken(staffToken);

			using HttpResponseMessage response = await http.SendAsync(request);
			_ = response.EnsureSuccessStatusCode();

			FindStaffUsersResponse? result = await response.Content
				.ReadFromJsonAsync<FindStaffUsersResponse>();
			if (result is null) {
				throw new InvalidOperationException(
					"Failed to deserialize staff user list response"
				);
			}

			StaffUserItem? user = result.Data.FirstOrDefault(
				u => string.Equals(
					u.Email,
					email,
					StringComparison.OrdinalIgnoreCase
				)
			);

			return user is null
				? throw new InvalidOperationException(
					$"Staff user with email '{email}' not found"
				)
				: user.Id.ToString();
		}

		// -- Response DTOs --

		private class FindStaffUsersResponse : CursorPaginatedResult<StaffUserItem> { }

		private record StaffUserItem {
			public Guid Id { get; init; }
			public string Email { get; init; } = string.Empty;
			public string? LastName { get; init; }
			public string? FirstName { get; init; }
			public string? AvatarUrl { get; init; }
			public string Status { get; init; } = string.Empty;
			public string Level { get; init; } = string.Empty;
		}

		private async Task<string> CreateUnprivilegedStaffUserTokenAsync() {
			string email = $"no-perms-{Guid.NewGuid():N}@example.com";

			await using AsyncServiceScope scope =
				_fixture.Factory.Services.CreateAsyncScope();
			MainApiDbContext dbContext = scope.ServiceProvider
				.GetRequiredService<MainApiDbContext>();

			User user = new User {
				Email = email,
				Password = PasswordUtils.HashPassword(TestConstants.SeedPassword),
				FirstName = "NoPerm",
				LastName = "User",
				IsVerified = true,
				Status = UserStatus.Active,
			};

			_ = dbContext.User.Add(user);
			_ = await dbContext.SaveChangesAsync();

			Guid userId = user.GetRequiredId();
			UserAccount staffAccount = UserAccount.CreateStaffAccount(userId, AccountLevel.User);
			staffAccount.ValidateAccountType();
			_ = dbContext.UserAccount.Add(staffAccount);
			_ = await dbContext.SaveChangesAsync();

			return await _authClient.LoginAsync(email, TestConstants.SeedPassword);
		}
	}
}
