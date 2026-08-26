
using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Tenants.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Users.Handlers.Staff {
	public sealed class SuspendTenantUserAsStaffSpec : IClassFixture<ApiFixture> {
		private readonly ApiFixture _fixture;
		private readonly HttpClient _http;
		private readonly TestAuthClient _authClient;

		public SuspendTenantUserAsStaffSpec(ApiFixture fixture) {
			_fixture = fixture;
			_http = fixture.HttpClient;
			_authClient = new TestAuthClient(_http);
		}

		private static string GetSuspendUrl(string tenantId, string userId) {
			return PathUtils.Join(
				Routes.Staff.Root,
				Routes.Users.ForTenantAsStaff.SuspendFn(tenantId, userId)
			);
		}

		[Fact]
		public async Task ItShouldSuspendActiveTenantUser() {
			// Arrange
			string staffToken = await _authClient.LoginAsStaffAdminAsync();
			Guid tenantId = await TenantTestHelper.GetTenantIdByNameAsync(
				_http, staffToken, SeedConstants.Tenants.AcmeName
			);
			string userId = await GetUserIdByEmailAsync(
				_http, staffToken, tenantId, TestConstants.AcmeUserEmail
			);

			// Act
			string url = GetSuspendUrl(tenantId.ToString(), userId);
			HttpRequestMessage request = new HttpRequestMessage(HttpMethod.Post, url)
				.WithSessionToken(staffToken);
			using HttpResponseMessage response = await _http.SendAsync(request);

			// Assert
			_ = response.StatusCode.Should().Be(HttpStatusCode.OK);
			SuspendTenantUserResult? result = await response.Content.ReadFromJsonAsync<SuspendTenantUserResult>();
			_ = result.Should().NotBeNull();
			Assert.NotNull(result);
			_ = result.Status.Should().Be(TenantUserStatus.Suspended);
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
			string url = GetSuspendUrl(tenantId.ToString(), nonexistentUserId.ToString());
			HttpRequestMessage request = new HttpRequestMessage(HttpMethod.Post, url)
				.WithSessionToken(staffToken);
			using HttpResponseMessage response = await _http.SendAsync(request);

			// Assert
			_ = response.StatusCode.Should().Be(HttpStatusCode.NotFound);
		}

		[Fact]
		public async Task ItShouldReturnBadRequestWhenSuspendingLastAdmin() {
			// Arrange - TechStart has only ONE admin
			string staffToken = await _authClient.LoginAsStaffAdminAsync();
			Guid tenantId = await TenantTestHelper.GetTenantIdByNameAsync(
				_http, staffToken, SeedConstants.Tenants.TechStartName
			);
			string userId = await GetUserIdByEmailAsync(
				_http, staffToken, tenantId, TestConstants.TechStartAdminEmail
			);

			// Act
			string url = GetSuspendUrl(tenantId.ToString(), userId);
			HttpRequestMessage request = new HttpRequestMessage(HttpMethod.Post, url)
				.WithSessionToken(staffToken);
			using HttpResponseMessage response = await _http.SendAsync(request);

			// Assert
			_ = response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
			AppProblemDetails? problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
			Assert.NotNull(problem);
			_ = problem.TranslationKey.Should().Be(ResponseKeys.CannotSuspendLastAdmin);
		}

		[Fact]
		public async Task
		ItShouldReturnBadRequestWhenSuspendingAdminWhoseOnlyPeerIsGloballySuspended() {
			string staffToken = await _authClient.LoginAsStaffAdminAsync();
			var seeded = await SeedTenantAdminWithSuspendedPeerAsync();

			string url = GetSuspendUrl(
				seeded.TenantId.ToString(),
				seeded.UserId.ToString()
			);
			HttpRequestMessage request = new HttpRequestMessage(HttpMethod.Post, url)
				.WithSessionToken(staffToken);
			using HttpResponseMessage response = await _http.SendAsync(request);

			_ = response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
			AppProblemDetails? problem = await response.Content
				.ReadFromJsonAsync<AppProblemDetails>();
			Assert.NotNull(problem);
			_ = problem.TranslationKey.Should()
							.Be(ResponseKeys.CannotSuspendLastAdmin);
		}

		[Fact]
		public async Task ItShouldReturnBadRequestForMalformedTenantId() {
			// Arrange
			string staffToken = await _authClient.LoginAsStaffAdminAsync();

			// Act
			string url = PathUtils.Join(Routes.Staff.Root, "/tenants/invalid-uuid/users/abc/suspend");
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
				$"/tenants/{tenantId}/users/invalid-uuid/suspend"
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
			string url = GetSuspendUrl(tenantId.ToString(), Guid.NewGuid().ToString());
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
			string url = GetSuspendUrl(tenantId.ToString(), Guid.NewGuid().ToString());
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

		private async Task<SeededTenantAdminScenario>
		SeedTenantAdminWithSuspendedPeerAsync() {
			await using var scope =
				_fixture.Factory.Services.CreateAsyncScope();
			var dbContext = scope.ServiceProvider
				.GetRequiredService<AppDbContext>();

			var unique = Guid.NewGuid().ToString("N");
			var user = new User {
				Email = $"tenant-suspend-admin-{unique}@example.com",
				Password = "unused",
				FirstName = "Tenant",
				LastName = "Admin",
				Status = UserStatus.Active,
				IsVerified = true,
			};
			var suspendedPeer = new User {
				Email = $"tenant-suspend-peer-{unique}@example.com",
				Password = "unused",
				FirstName = "Suspended",
				LastName = "Peer",
				Status = UserStatus.Suspended,
				IsVerified = true,
			};
			var tenant = new Tenant {
				Name = $"Suspend Admin Tenant {unique}",
				Code = Guid.NewGuid().ToString("N")[..12],
				Status = TenantStatus.Active,
				MaxUsers = 100,
			};

			await dbContext.User.AddRangeAsync(user, suspendedPeer);
			await dbContext.Tenant.AddAsync(tenant);
			await dbContext.SaveChangesAsync();

			await dbContext.UserAccount.AddRangeAsync(
				UserAccount.CreateTenantAccount(
					user.GetRequiredId(),
					tenant.GetRequiredId(),
					AccountLevel.Admin
				),
				UserAccount.CreateTenantAccount(
					suspendedPeer.GetRequiredId(),
					tenant.GetRequiredId(),
					AccountLevel.Admin
				)
			);
			await dbContext.SaveChangesAsync();

			return new SeededTenantAdminScenario(
				user.GetRequiredId(),
				tenant.GetRequiredId()
			);
		}

		private sealed record SeededTenantAdminScenario(
			Guid UserId,
			Guid TenantId
		);
	}
}
