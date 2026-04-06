
using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using MainApi.Src.Data.DbContext;
using MainApi.Src.Data.Seeding;
using MainApi.Src.Lib;
using MainApi.Src.Lib.Routes;
using MainApi.Src.Lib.Testing.Fixtures;
using MainApi.Src.Lib.Testing.Helpers;
using MainApi.Src.Lib.Utils;
using MainApi.Src.Modules.Invitations.Entities;
using MainApi.Src.Modules.Profiles.Entities;
using MainApi.Src.Modules.Users.Entities;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using Xunit;

namespace MainApi.Src.Modules.Invitations.Handlers.Staff {
	public sealed class RevokeInvitationForTenantAsStaffSpec
		: IClassFixture<ApiFixture> {
		private readonly ApiFixture _fixture;
		private readonly HttpClient _http;
		private readonly TestAuthClient _authClient;

		public RevokeInvitationForTenantAsStaffSpec(ApiFixture fixture) {
			_fixture = fixture;
			_http = fixture.HttpClient;
			_authClient = new TestAuthClient(_http);
		}

		[Fact]
		public async Task
		ItShouldRevokePendingTenantInvitationForMatchingTenant() {
			string staffToken = await _authClient.LoginAsStaffAdminAsync();
			Guid tenantId = await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

			Guid invitationId = await CreateTenantInvitationAsync(
				staffToken,
				tenantId,
				$"tenant-revoke-success-{Guid.NewGuid():N}@example.com"
			);

			using HttpResponseMessage response = await _http.SendAsync(
				CreateTenantRevokeRequest(staffToken, tenantId.ToString(), invitationId.ToString())
			);

			_ = response.StatusCode.Should().Be(HttpStatusCode.OK);

			using IServiceScope scope = _fixture.Factory.Services.CreateScope();
			MainApiDbContext dbContext = scope.ServiceProvider
				.GetRequiredService<MainApiDbContext>();

			Invitation? invitation = await dbContext.Invitation.FindAsync(invitationId);
			_ = invitation.Should().NotBeNull();
			_ = invitation!.IsRevoked.Should().BeTrue();
			_ = invitation.RevokedAt.Should().NotBeNull();
		}

		[Fact]
		public async Task
		ItShouldAllowPermissionedNonAdminStaffUserToRevokeTenantInvitation() {
			Guid tenantId = await LoginAsStaffUserWithInvitationPermissionAsync(
				AppPermissions.Staff.Invitations.REVOKE_FOR_TENANT.Key
			);
			string staffUserToken = await _authClient.LoginAsync(
				TestConstants.StaffUserEmail,
				TestConstants.SeedPassword
			);

			string staffAdminToken = await _authClient.LoginAsStaffAdminAsync();
			Guid invitationId = await CreateTenantInvitationAsync(
				staffAdminToken,
				tenantId,
				$"tenant-revoke-permissioned-staff-{Guid.NewGuid():N}@example.com"
			);

			using HttpResponseMessage response = await _http.SendAsync(
				CreateTenantRevokeRequest(staffUserToken, tenantId.ToString(), invitationId.ToString())
			);

			_ = response.StatusCode.Should().Be(HttpStatusCode.OK);
		}

		[Fact]
		public async Task
		ItShouldReturnBadRequestWhenTenantIdIsMalformed() {
			string staffToken = await _authClient.LoginAsStaffAdminAsync();

			using HttpResponseMessage response = await _http.SendAsync(
				CreateTenantRevokeRequest(staffToken, "not-a-guid", Guid.NewGuid().ToString())
			);

			_ = response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
		}

		[Fact]
		public async Task
		ItShouldReturnBadRequestWhenInvitationIdIsMalformed() {
			string staffToken = await _authClient.LoginAsStaffAdminAsync();
			Guid tenantId = await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

			using HttpResponseMessage response = await _http.SendAsync(
				CreateTenantRevokeRequest(staffToken, tenantId.ToString(), "not-a-guid")
			);

			_ = response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
		}

		[Fact]
		public async Task
		ItShouldReturnNotFoundWhenInvitationDoesNotExist() {
			string staffToken = await _authClient.LoginAsStaffAdminAsync();
			Guid tenantId = await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

			using HttpResponseMessage response = await _http.SendAsync(
				CreateTenantRevokeRequest(staffToken, tenantId.ToString(), Guid.NewGuid().ToString())
			);

			_ = response.StatusCode.Should().Be(HttpStatusCode.NotFound);
		}

		[Fact]
		public async Task
		ItShouldReturnNotFoundWhenInvitationBelongsToDifferentTenant() {
			string staffToken = await _authClient.LoginAsStaffAdminAsync();
			Guid acmeTenantId = await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);
			Guid techStartTenantId = await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.TechStartName
			);

			Guid invitationId = await CreateTenantInvitationAsync(
				staffToken,
				techStartTenantId,
				$"tenant-revoke-cross-tenant-{Guid.NewGuid():N}@example.com"
			);

			using HttpResponseMessage response = await _http.SendAsync(
				CreateTenantRevokeRequest(staffToken, acmeTenantId.ToString(), invitationId.ToString())
			);

			_ = response.StatusCode.Should().Be(HttpStatusCode.NotFound);

			using IServiceScope scope = _fixture.Factory.Services.CreateScope();
			MainApiDbContext dbContext = scope.ServiceProvider
				.GetRequiredService<MainApiDbContext>();

			Invitation? invitation = await dbContext.Invitation.FindAsync(invitationId);
			_ = invitation.Should().NotBeNull();
			_ = invitation!.IsRevoked.Should().BeFalse();
		}

		[Fact]
		public async Task
		ItShouldReturnNotFoundWhenInvitationIsStaffScoped() {
			string staffToken = await _authClient.LoginAsStaffAdminAsync();
			Guid tenantId = await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

			Guid invitationId = await CreateStaffInvitationAsync(
				staffToken,
				$"staff-scope-on-tenant-route-{Guid.NewGuid():N}@example.com"
			);

			using HttpResponseMessage response = await _http.SendAsync(
				CreateTenantRevokeRequest(staffToken, tenantId.ToString(), invitationId.ToString())
			);

			_ = response.StatusCode.Should().Be(HttpStatusCode.NotFound);
		}

		[Fact]
		public async Task
		ItShouldReturnUnauthorizedWithoutSession() {
			string staffToken = await _authClient.LoginAsStaffAdminAsync();
			Guid tenantId = await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);
			Guid invitationId = await CreateTenantInvitationAsync(
				staffToken,
				tenantId,
				$"tenant-revoke-no-session-{Guid.NewGuid():N}@example.com"
			);

			using HttpResponseMessage response = await _http.SendAsync(
				CreateTenantRevokeRequest(null, tenantId.ToString(), invitationId.ToString())
			);

			_ = response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
		}

		[Fact]
		public async Task
		ItShouldReturnForbiddenForTenantUser() {
			string staffToken = await _authClient.LoginAsStaffAdminAsync();
			Guid tenantId = await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);
			Guid invitationId = await CreateTenantInvitationAsync(
				staffToken,
				tenantId,
				$"tenant-revoke-tenant-user-{Guid.NewGuid():N}@example.com"
			);
			string tenantToken = await _authClient.LoginAsync(
				TestConstants.AcmeAdminEmail,
				TestConstants.SeedPassword
			);

			using HttpResponseMessage response = await _http.SendAsync(
				CreateTenantRevokeRequest(tenantToken, tenantId.ToString(), invitationId.ToString())
			);

			_ = response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
		}

		[Fact]
		public async Task
		ItShouldReturnForbiddenForStaffWithoutPermission() {
			string staffToken = await _authClient.LoginAsStaffAdminAsync();
			Guid tenantId = await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);
			Guid invitationId = await CreateTenantInvitationAsync(
				staffToken,
				tenantId,
				$"tenant-revoke-no-permission-{Guid.NewGuid():N}@example.com"
			);
			string staffUserToken = await _authClient.LoginAsync(
				TestConstants.StaffUserEmail,
				TestConstants.SeedPassword
			);

			using HttpResponseMessage response = await _http.SendAsync(
				CreateTenantRevokeRequest(staffUserToken, tenantId.ToString(), invitationId.ToString())
			);

			_ = response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
		}

		[Fact]
		public async Task
		ItShouldReturnNotFoundWhenTenantInvitationIsRevokedThroughStaffInvitationRoute() {
			string staffToken = await _authClient.LoginAsStaffAdminAsync();
			Guid tenantId = await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);
			Guid invitationId = await CreateTenantInvitationAsync(
				staffToken,
				tenantId,
				$"tenant-route-global-guard-{Guid.NewGuid():N}@example.com"
			);

			using HttpResponseMessage response = await _http.SendAsync(
				CreateStaffRevokeRequest(staffToken, invitationId.ToString())
			);

			_ = response.StatusCode.Should().Be(HttpStatusCode.NotFound);
		}

		[Fact]
		public async Task
		ItShouldRevokeStaffInvitationThroughStaffInvitationRoute() {
			string staffToken = await _authClient.LoginAsStaffAdminAsync();
			Guid invitationId = await CreateStaffInvitationAsync(
				staffToken,
				$"staff-revoke-success-{Guid.NewGuid():N}@example.com"
			);

			using HttpResponseMessage response = await _http.SendAsync(
				CreateStaffRevokeRequest(staffToken, invitationId.ToString())
			);

			_ = response.StatusCode.Should().Be(HttpStatusCode.OK);

			using IServiceScope scope = _fixture.Factory.Services.CreateScope();
			MainApiDbContext dbContext = scope.ServiceProvider
				.GetRequiredService<MainApiDbContext>();

			Invitation? invitation = await dbContext.Invitation.FindAsync(invitationId);
			_ = invitation.Should().NotBeNull();
			_ = invitation!.Scope.Should().Be(InvitationScope.Staff);
			_ = invitation.IsRevoked.Should().BeTrue();
		}

		[Fact]
		public async Task
		ItShouldAllowPermissionedNonAdminStaffUserToRevokeStaffInvitation() {
			_ = await LoginAsStaffUserWithInvitationPermissionAsync(
				AppPermissions.Staff.Invitations.REVOKE_FOR_STAFF.Key
			);
			string staffUserToken = await _authClient.LoginAsync(
				TestConstants.StaffUserEmail,
				TestConstants.SeedPassword
			);

			string staffAdminToken = await _authClient.LoginAsStaffAdminAsync();
			Guid invitationId = await CreateStaffInvitationAsync(
				staffAdminToken,
				$"staff-revoke-permissioned-staff-{Guid.NewGuid():N}@example.com"
			);

			using HttpResponseMessage response = await _http.SendAsync(
				CreateStaffRevokeRequest(staffUserToken, invitationId.ToString())
			);

			_ = response.StatusCode.Should().Be(HttpStatusCode.OK);
		}

		private static HttpRequestMessage CreateTenantRevokeRequest(
			string? sessionToken,
			string tenantId,
			string invitationId
		) {
			string url = PathUtils.Join(
				Routes.Staff.Root,
				Routes.Invitations.ForTenantAsStaff.RevokeByIdFn(tenantId, invitationId)
			);
			HttpRequestMessage request = new HttpRequestMessage(HttpMethod.Delete, url);

			if (!string.IsNullOrWhiteSpace(sessionToken)) {
				request = request.WithSessionToken(sessionToken);
			}

			return request;
		}

		private static HttpRequestMessage CreateStaffRevokeRequest(
			string sessionToken,
			string invitationId
		) {
			string url = PathUtils.Join(
				Routes.Staff.Root,
				Routes.Invitations.ForStaff.Root,
				Routes.Invitations.ForStaff.RevokeByIdFn(invitationId)
			);

			return new HttpRequestMessage(HttpMethod.Delete, url)
				.WithSessionToken(sessionToken);
		}

		private async Task<Guid> CreateTenantInvitationAsync(
			string staffToken,
			Guid tenantId,
			string email
		) {
			string url = PathUtils.Join(
				Routes.Staff.Root,
				Routes.Users.ForTenantAsStaff.InviteFn(tenantId.ToString())
			);
			HttpRequestMessage request = new HttpRequestMessage(HttpMethod.Post, url)
				.WithSessionToken(staffToken);

			request.Content = JsonContent.Create(new {
				email,
				accountLevel = "User"
			});

			using HttpResponseMessage response = await _http.SendAsync(request);
			_ = response.StatusCode.Should().Be(HttpStatusCode.Created);

			InvitationCreatedResponse? body = await response.Content
				.ReadFromJsonAsync<InvitationCreatedResponse>();
			_ = body.Should().NotBeNull();

			return body!.InvitationId;
		}

		private async Task<Guid> LoginAsStaffUserWithInvitationPermissionAsync(
			string permissionKey
		) {
			using IServiceScope scope = _fixture.Factory.Services.CreateScope();
			MainApiDbContext dbContext = scope.ServiceProvider
				.GetRequiredService<MainApiDbContext>();

			User staffUser = await dbContext.User
				.Where(user => user.Email == TestConstants.StaffUserEmail)
				.FirstAsync();
			UserAccount staffAccount = await dbContext.UserAccount
				.Where(account =>
					account.UserId == staffUser.GetRequiredId()
					&& account.Scope == AccountScope.Staff
					&& !account.IsDeleted
				)
				.FirstAsync();

			Profile profile = Profile.CreateStaffProfile(
				$"invitation-permission-{Guid.NewGuid():N}",
				"Test-only staff profile for invitation permissions"
			);

			_ = await dbContext.Profile.AddAsync(profile);
			_ = await dbContext.SaveChangesAsync();

			_ = await dbContext.ProfilePermission.AddAsync(new ProfilePermission {
				ProfileId = profile.GetRequiredId(),
				PermissionKey = permissionKey
			});
			_ = await dbContext.UserAccountProfile.AddAsync(new UserAccountProfile {
				UserAccountId = staffAccount.GetRequiredId(),
				ProfileId = profile.GetRequiredId()
			});
			_ = await dbContext.SaveChangesAsync();

			string staffAdminToken = await _authClient.LoginAsStaffAdminAsync();
			return await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffAdminToken,
				SeedConstants.Tenants.AcmeName
			);
		}

		private async Task<Guid> CreateStaffInvitationAsync(
			string staffToken,
			string email
		) {
			using IServiceScope scope = _fixture.Factory.Services.CreateScope();
			MainApiDbContext dbContext = scope.ServiceProvider
				.GetRequiredService<MainApiDbContext>();

			Profile staffProfile = await dbContext.Profile
				.Where(static profile =>
					profile.Scope == ProfileScope.Staff
					&& !profile.IsDeleted
				)
				.OrderBy(static profile => profile.Name)
				.FirstAsync();

			string url = PathUtils.Join(
				Routes.Staff.Root,
				Routes.Invitations.ForStaff.Root
			);
			HttpRequestMessage request = new HttpRequestMessage(HttpMethod.Post, url)
				.WithSessionToken(staffToken);

			request.Content = JsonContent.Create(new {
				email,
				profileId = staffProfile.GetRequiredId().ToString()
			});

			using HttpResponseMessage response = await _http.SendAsync(request);
			_ = response.StatusCode.Should().Be(HttpStatusCode.Created);

			InvitationCreatedResponse? body = await response.Content
				.ReadFromJsonAsync<InvitationCreatedResponse>();
			_ = body.Should().NotBeNull();

			return body!.InvitationId;
		}

		private sealed record InvitationCreatedResponse {
			public required Guid InvitationId { get; init; }
		}
	}
}
