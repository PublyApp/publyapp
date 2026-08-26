
using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Users.Handlers.Staff {
	public sealed class ReactivateTenantUserAsStaffSpec : IClassFixture<ApiFixture> {
		private readonly HttpClient _http;
		private readonly TestAuthClient _authClient;

		public ReactivateTenantUserAsStaffSpec(ApiFixture fixture) {
			_http = fixture.HttpClient;
			_authClient = new TestAuthClient(_http);
		}

		private static string GetReactivateUrl(string tenantId, string userId) {
			return PathUtils.Join(
				Routes.Staff.Root,
				Routes.Users.ForTenantAsStaff.ReactivateFn(tenantId, userId)
			);
		}

		[Fact]
		public async Task ItShouldReactivateSuspendedTenantUser() {
			// Arrange
			string staffToken = await _authClient.LoginAsStaffAdminAsync();
			Guid tenantId = await TenantTestHelper.GetTenantIdByNameAsync(
				_http, staffToken, SeedConstants.Tenants.AcmeName
			);
			string userId = await GetUserIdByEmailAsync(
				_http, staffToken, tenantId, TestConstants.AcmeUserEmail
			);

			// First suspend the user
			string suspendUrl = PathUtils.Join(
				Routes.Staff.Root,
				Routes.Users.ForTenantAsStaff.SuspendFn(tenantId.ToString(), userId)
			);
			using (HttpRequestMessage suspendRequest = new HttpRequestMessage(HttpMethod.Post, suspendUrl)
				.WithSessionToken(staffToken)) {
				using HttpResponseMessage suspendResponse = await _http.SendAsync(suspendRequest);
				_ = suspendResponse.StatusCode.Should().Be(HttpStatusCode.OK);
			}

			// Act - Reactivate the suspended user
			string reactivateUrl = GetReactivateUrl(tenantId.ToString(), userId);
			HttpRequestMessage request = new HttpRequestMessage(HttpMethod.Post, reactivateUrl)
				.WithSessionToken(staffToken);
			using HttpResponseMessage response = await _http.SendAsync(request);

			// Assert
			_ = response.StatusCode.Should().Be(HttpStatusCode.OK);
			ReactivateTenantUserResult? result = await response.Content.ReadFromJsonAsync<ReactivateTenantUserResult>();
			_ = result.Should().NotBeNull();
			Assert.NotNull(result);
			_ = result.Status.Should().Be(TenantUserStatus.Active);
		}

		[Fact]
		public async Task ItShouldReturnNotFoundForNonexistentUser() {
			// Arrange
			string staffToken = await _authClient.LoginAsStaffAdminAsync();
			Guid tenantId = await TenantTestHelper.GetTenantIdByNameAsync(
				_http, staffToken, SeedConstants.Tenants.AcmeName
			);
			Guid nonexistentUserId = Guid.NewGuid();

			// Act
			string url = GetReactivateUrl(tenantId.ToString(), nonexistentUserId.ToString());
			HttpRequestMessage request = new HttpRequestMessage(HttpMethod.Post, url)
				.WithSessionToken(staffToken);
			using HttpResponseMessage response = await _http.SendAsync(request);

			// Assert
			_ = response.StatusCode.Should().Be(HttpStatusCode.NotFound);
		}

		[Fact]
		public async Task ItShouldReturnConflictWhenUserNotSuspended() {
			// Arrange
			string staffToken = await _authClient.LoginAsStaffAdminAsync();
			Guid tenantId = await TenantTestHelper.GetTenantIdByNameAsync(
				_http, staffToken, SeedConstants.Tenants.AcmeName
			);
			string userId = await GetUserIdByEmailAsync(
				_http, staffToken, tenantId, TestConstants.AcmeUserEmail
			);

			// Act
			string url = GetReactivateUrl(tenantId.ToString(), userId);
			HttpRequestMessage request = new HttpRequestMessage(HttpMethod.Post, url)
				.WithSessionToken(staffToken);
			using HttpResponseMessage response = await _http.SendAsync(request);

			// Assert
			_ = response.StatusCode.Should().Be(HttpStatusCode.Conflict);
		}

		[Fact]
		public async Task ItShouldReturnBadRequestForMalformedTenantId() {
			// Arrange
			string staffToken = await _authClient.LoginAsStaffAdminAsync();

			// Act
			string url = PathUtils.Join(Routes.Staff.Root, "/tenants/invalid-uuid/users/abc/reactivate");
			HttpRequestMessage request = new HttpRequestMessage(HttpMethod.Post, url)
				.WithSessionToken(staffToken);
			using HttpResponseMessage response = await _http.SendAsync(request);

			// Assert
			_ = response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
			AppProblemDetails? problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
			Assert.NotNull(problem);
			_ = problem.TranslationKey.Should().Be(ResponseKeys.MalformedId);
		}

		[Fact]
		public async Task ItShouldReturnBadRequestForMalformedUserId() {
			// Arrange
			string staffToken = await _authClient.LoginAsStaffAdminAsync();
			Guid tenantId = await TenantTestHelper.GetTenantIdByNameAsync(
				_http, staffToken, SeedConstants.Tenants.AcmeName
			);

			// Act
			string url = PathUtils.Join(
				Routes.Staff.Root,
				$"/tenants/{tenantId}/users/invalid-uuid/reactivate"
			);
			HttpRequestMessage request = new HttpRequestMessage(HttpMethod.Post, url)
				.WithSessionToken(staffToken);
			using HttpResponseMessage response = await _http.SendAsync(request);

			// Assert
			_ = response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
			AppProblemDetails? problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
			Assert.NotNull(problem);
			_ = problem.TranslationKey.Should().Be(ResponseKeys.MalformedId);
		}

		[Fact]
		public async Task ItShouldReturnUnauthorizedWithoutSession() {
			// Arrange
			Guid tenantId = await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				await _authClient.LoginAsStaffAdminAsync(),
				SeedConstants.Tenants.AcmeName
			);

			// Act
			string url = GetReactivateUrl(tenantId.ToString(), Guid.NewGuid().ToString());
			HttpRequestMessage request = new HttpRequestMessage(HttpMethod.Post, url);
			using HttpResponseMessage response = await _http.SendAsync(request);

			// Assert
			_ = response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
		}

		[Fact]
		public async Task ItShouldReturnForbiddenForTenantUser() {
			// Arrange
			string tenantToken = await _authClient.LoginAsync(
				TestConstants.AcmeAdminEmail,
				TestConstants.SeedPassword
			);
			Guid tenantId = await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				await _authClient.LoginAsStaffAdminAsync(),
				SeedConstants.Tenants.AcmeName
			);

			// Act
			string url = GetReactivateUrl(tenantId.ToString(), Guid.NewGuid().ToString());
			HttpRequestMessage request = new HttpRequestMessage(HttpMethod.Post, url)
				.WithSessionToken(tenantToken);
			using HttpResponseMessage response = await _http.SendAsync(request);

			// Assert
			_ = response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
		}

		// Helper methods
		private static async Task<string> GetUserIdByEmailAsync(
			HttpClient http,
			string staffToken,
			Guid tenantId,
			string email
		) {
			string url = PathUtils.Join(
				Routes.Staff.Root,
				Routes.Users.ForTenantAsStaff.RootFn(tenantId.ToString()),
				"?limit=50"
			);
			using HttpRequestMessage request = new HttpRequestMessage(HttpMethod.Get, url)
				.WithSessionToken(staffToken);
			using HttpResponseMessage response = await http.SendAsync(request);
			_ = response.EnsureSuccessStatusCode();

			FindUsersResponse? result = await response.Content.ReadFromJsonAsync<FindUsersResponse>();
			if (result is null) {
				throw new InvalidOperationException("Failed to deserialize user list response");
			}

			TenantUserItem? user = result.Data.FirstOrDefault(
				u => string.Equals(u.Email, email, StringComparison.OrdinalIgnoreCase)
			);
			return user is null ? throw new InvalidOperationException($"User with email '{email}' not found in tenant") : user.Id;
		}

		private record FindUsersResponse {
			public List<TenantUserItem> Data { get; init; } = [];
			public string? NextCursor { get; init; }
		}

		private record TenantUserItem {
			public string Id { get; init; } = string.Empty;
			public string Email { get; init; } = string.Empty;
			public string? FirstName { get; init; }
			public string? LastName { get; init; }
			public string? AvatarUrl { get; init; }
			public string Level { get; init; } = string.Empty;
			public string Status { get; init; } = string.Empty;
		}
	}
}
