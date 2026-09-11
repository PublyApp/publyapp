
using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Invitations.Entities;
using PublyApp.Api.Modules.Profiles.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Invitations.Handlers.Staff {
	public sealed class RevokeInvitationForTenantAsStaffSpec
		: IClassFixture<ApiFixture> {
		private readonly ApiFixture _Fixture;
		private readonly HttpClient _Http;
		private readonly TestAuthClient _AuthClient;

		public RevokeInvitationForTenantAsStaffSpec(ApiFixture fixture) {
			_Fixture = fixture;
			_Http = fixture.HttpClient;
			_AuthClient = new TestAuthClient(_Http);
		}

		[Fact]
		public async Task
		ItShouldRevokePendingTenantInvitationForMatchingTenant() {
			string staffToken = await _AuthClient.LoginAsStaffAdminAsync();
			Guid tenantId = await TenantTestHelper.GetTenantIdByNameAsync(
				_Http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

			Guid invitationId = await _CreateTenantInvitationAsync(
				staffToken,
				tenantId,
				$"tenant-revoke-success-{Guid.NewGuid():N}@example.com"
			);

			using HttpResponseMessage response = await _Http.SendAsync(
				_CreateTenantRevokeRequest(staffToken, tenantId.ToString(), invitationId.ToString())
			);

			_ = response.StatusCode.Should().Be(HttpStatusCode.OK);

			using IServiceScope scope = _Fixture.Factory.Services.CreateScope();
			AppDbContext dbContext = scope.ServiceProvider
				.GetRequiredService<AppDbContext>();

			Invitation? invitation = await dbContext.Invitation.FindAsync(invitationId);
			_ = invitation.Should().NotBeNull();
			Assert.NotNull(invitation);
			_ = invitation.Status.Should().Be(InvitationStatus.Revoked);
			_ = invitation.RevokedAt.Should().NotBeNull();
		}

		[Fact]
		public async Task
		ItShouldAllowPermissionedNonAdminStaffUserToRevokeTenantInvitation() {
			string staffUserToken = await _CreateStaffUserTokenWithInvitationPermissionAsync(
				AppPermissions.Staff.Invitations.REVOKE_FOR_TENANT.Key
			);
			string staffAdminToken = await _AuthClient.LoginAsStaffAdminAsync();
			Guid tenantId = await TenantTestHelper.GetTenantIdByNameAsync(
				_Http,
				staffAdminToken,
				SeedConstants.Tenants.AcmeName
			);

			Guid invitationId = await _CreateTenantInvitationAsync(
				staffAdminToken,
				tenantId,
				$"tenant-revoke-permissioned-staff-{Guid.NewGuid():N}@example.com"
			);

			using HttpResponseMessage response = await _Http.SendAsync(
				_CreateTenantRevokeRequest(staffUserToken, tenantId.ToString(), invitationId.ToString())
			);

			_ = response.StatusCode.Should().Be(HttpStatusCode.OK);
		}

		[Fact]
		public async Task
		ItShouldReturnBadRequestWhenTenantInvitationIsAlreadyAccepted() {
			string staffToken = await _AuthClient.LoginAsStaffAdminAsync();
			Guid tenantId = await TenantTestHelper.GetTenantIdByNameAsync(
				_Http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);
			Guid invitationId = await _CreateTenantInvitationAsync(
				staffToken,
				tenantId,
				$"tenant-revoke-accepted-{Guid.NewGuid():N}@example.com"
			);

			await _MarkInvitationAcceptedAsync(invitationId);

			using HttpResponseMessage response = await _Http.SendAsync(
				_CreateTenantRevokeRequest(staffToken, tenantId.ToString(), invitationId.ToString())
			);

			_ = response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
		}

		[Fact]
		public async Task
		ItShouldReturnBadRequestWhenTenantIdIsMalformed() {
			string staffToken = await _AuthClient.LoginAsStaffAdminAsync();

			using HttpResponseMessage response = await _Http.SendAsync(
				_CreateTenantRevokeRequest(staffToken, "not-a-guid", Guid.NewGuid().ToString())
			);

			_ = response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
		}

		[Fact]
		public async Task
		ItShouldReturnBadRequestWhenInvitationIdIsMalformed() {
			string staffToken = await _AuthClient.LoginAsStaffAdminAsync();
			Guid tenantId = await TenantTestHelper.GetTenantIdByNameAsync(
				_Http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

			using HttpResponseMessage response = await _Http.SendAsync(
				_CreateTenantRevokeRequest(staffToken, tenantId.ToString(), "not-a-guid")
			);

			_ = response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
		}

		[Fact]
		public async Task
		ItShouldReturnNotFoundWhenInvitationDoesNotExist() {
			string staffToken = await _AuthClient.LoginAsStaffAdminAsync();
			Guid tenantId = await TenantTestHelper.GetTenantIdByNameAsync(
				_Http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

			using HttpResponseMessage response = await _Http.SendAsync(
				_CreateTenantRevokeRequest(staffToken, tenantId.ToString(), Guid.NewGuid().ToString())
			);

			_ = response.StatusCode.Should().Be(HttpStatusCode.NotFound);
		}

		[Fact]
		public async Task
		ItShouldReturnNotFoundWhenInvitationBelongsToDifferentTenant() {
			string staffToken = await _AuthClient.LoginAsStaffAdminAsync();
			Guid acmeTenantId = await TenantTestHelper.GetTenantIdByNameAsync(
				_Http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);
			Guid techStartTenantId = await TenantTestHelper.GetTenantIdByNameAsync(
				_Http,
				staffToken,
				SeedConstants.Tenants.TechStartName
			);

			Guid invitationId = await _CreateTenantInvitationAsync(
				staffToken,
				techStartTenantId,
				$"tenant-revoke-cross-tenant-{Guid.NewGuid():N}@example.com"
			);

			using HttpResponseMessage response = await _Http.SendAsync(
				_CreateTenantRevokeRequest(staffToken, acmeTenantId.ToString(), invitationId.ToString())
			);

			_ = response.StatusCode.Should().Be(HttpStatusCode.NotFound);

			using IServiceScope scope = _Fixture.Factory.Services.CreateScope();
			AppDbContext dbContext = scope.ServiceProvider
				.GetRequiredService<AppDbContext>();

			Invitation? invitation = await dbContext.Invitation.FindAsync(invitationId);
			_ = invitation.Should().NotBeNull();
			Assert.NotNull(invitation);
			_ = invitation.Status.Should().NotBe(InvitationStatus.Revoked);
		}

		[Fact]
		public async Task
		ItShouldReturnNotFoundWhenInvitationIsStaffScoped() {
			string staffToken = await _AuthClient.LoginAsStaffAdminAsync();
			Guid tenantId = await TenantTestHelper.GetTenantIdByNameAsync(
				_Http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

			Guid invitationId = await _CreateStaffInvitationAsync(
				staffToken,
				$"staff-scope-on-tenant-route-{Guid.NewGuid():N}@example.com"
			);

			using HttpResponseMessage response = await _Http.SendAsync(
				_CreateTenantRevokeRequest(staffToken, tenantId.ToString(), invitationId.ToString())
			);

			_ = response.StatusCode.Should().Be(HttpStatusCode.NotFound);
		}

		[Fact]
		public async Task
		ItShouldReturnUnauthorizedWithoutSession() {
			string staffToken = await _AuthClient.LoginAsStaffAdminAsync();
			Guid tenantId = await TenantTestHelper.GetTenantIdByNameAsync(
				_Http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);
			Guid invitationId = await _CreateTenantInvitationAsync(
				staffToken,
				tenantId,
				$"tenant-revoke-no-session-{Guid.NewGuid():N}@example.com"
			);

			using HttpResponseMessage response = await _Http.SendAsync(
				_CreateTenantRevokeRequest(null, tenantId.ToString(), invitationId.ToString())
			);

			_ = response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
		}

		[Fact]
		public async Task
		ItShouldReturnForbiddenForTenantUser() {
			string staffToken = await _AuthClient.LoginAsStaffAdminAsync();
			Guid tenantId = await TenantTestHelper.GetTenantIdByNameAsync(
				_Http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);
			Guid invitationId = await _CreateTenantInvitationAsync(
				staffToken,
				tenantId,
				$"tenant-revoke-tenant-user-{Guid.NewGuid():N}@example.com"
			);
			string tenantToken = await _AuthClient.LoginAsync(
				TestConstants.AcmeAdminEmail,
				TestConstants.SeedPassword
			);

			using HttpResponseMessage response = await _Http.SendAsync(
				_CreateTenantRevokeRequest(tenantToken, tenantId.ToString(), invitationId.ToString())
			);

			_ = response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
		}

		[Fact]
		public async Task
		ItShouldReturnForbiddenForStaffWithoutPermission() {
			string staffToken = await _AuthClient.LoginAsStaffAdminAsync();
			Guid tenantId = await TenantTestHelper.GetTenantIdByNameAsync(
				_Http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);
			Guid invitationId = await _CreateTenantInvitationAsync(
				staffToken,
				tenantId,
				$"tenant-revoke-no-permission-{Guid.NewGuid():N}@example.com"
			);
			string staffUserToken = await _CreateStaffUserTokenWithoutPermissionAsync();

			using HttpResponseMessage response = await _Http.SendAsync(
				_CreateTenantRevokeRequest(staffUserToken, tenantId.ToString(), invitationId.ToString())
			);

			_ = response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
		}

		[Fact]
		public async Task
		ItShouldReturnNotFoundWhenTenantInvitationIsRevokedThroughStaffInvitationRoute() {
			string staffToken = await _AuthClient.LoginAsStaffAdminAsync();
			Guid tenantId = await TenantTestHelper.GetTenantIdByNameAsync(
				_Http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);
			Guid invitationId = await _CreateTenantInvitationAsync(
				staffToken,
				tenantId,
				$"tenant-route-global-guard-{Guid.NewGuid():N}@example.com"
			);

			using HttpResponseMessage response = await _Http.SendAsync(
				_CreateStaffRevokeRequest(staffToken, invitationId.ToString())
			);

			_ = response.StatusCode.Should().Be(HttpStatusCode.NotFound);
		}

		[Fact]
		public async Task
		ItShouldRevokeStaffInvitationThroughStaffInvitationRoute() {
			string staffToken = await _AuthClient.LoginAsStaffAdminAsync();
			Guid invitationId = await _CreateStaffInvitationAsync(
				staffToken,
				$"staff-revoke-success-{Guid.NewGuid():N}@example.com"
			);

			using HttpResponseMessage response = await _Http.SendAsync(
				_CreateStaffRevokeRequest(staffToken, invitationId.ToString())
			);

			_ = response.StatusCode.Should().Be(HttpStatusCode.OK);

			using IServiceScope scope = _Fixture.Factory.Services.CreateScope();
			AppDbContext dbContext = scope.ServiceProvider
				.GetRequiredService<AppDbContext>();

			Invitation? invitation = await dbContext.Invitation.FindAsync(invitationId);
			_ = invitation.Should().NotBeNull();
			Assert.NotNull(invitation);
			_ = invitation.Scope.Should().Be(InvitationScope.Staff);
			_ = invitation.Status.Should().Be(InvitationStatus.Revoked);
		}

		[Fact]
		public async Task
		ItShouldAllowPermissionedNonAdminStaffUserToRevokeStaffInvitation() {
			string staffUserToken = await _CreateStaffUserTokenWithInvitationPermissionAsync(
				AppPermissions.Staff.Invitations.REVOKE_FOR_STAFF.Key
			);

			string staffAdminToken = await _AuthClient.LoginAsStaffAdminAsync();
			Guid invitationId = await _CreateStaffInvitationAsync(
				staffAdminToken,
				$"staff-revoke-permissioned-staff-{Guid.NewGuid():N}@example.com"
			);

			using HttpResponseMessage response = await _Http.SendAsync(
				_CreateStaffRevokeRequest(staffUserToken, invitationId.ToString())
			);

			_ = response.StatusCode.Should().Be(HttpStatusCode.OK);
		}

		private static HttpRequestMessage _CreateTenantRevokeRequest(
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

		private static HttpRequestMessage _CreateStaffRevokeRequest(
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

		private async Task<Guid> _CreateTenantInvitationAsync(
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

			using HttpResponseMessage response = await _Http.SendAsync(request);
			_ = response.StatusCode.Should().Be(HttpStatusCode.Created);

			InvitationCreatedResponse? body = await response.Content
				.ReadFromJsonAsync<InvitationCreatedResponse>();
			_ = body.Should().NotBeNull();

			Assert.NotNull(body);
			return body.InvitationId;
		}

		private async Task<string> _CreateStaffUserTokenWithoutPermissionAsync() {
			string email =
				$"invitation-revoke-no-permission-{Guid.NewGuid():N}@example.com";

			await StaffUserTestHelper.SeedStaffUserAsync(
				_Fixture,
				email
			);

			return await _AuthClient.LoginAsync(
				email,
				TestConstants.SeedPassword
			);
		}

		private async Task<string> _CreateStaffUserTokenWithInvitationPermissionAsync(
			string permissionKey
		) {
			string email =
				$"invitation-revoke-permissioned-{Guid.NewGuid():N}@example.com";
			Guid userId = await StaffUserTestHelper.SeedStaffUserAsync(
				_Fixture,
				email
			);

			using IServiceScope scope = _Fixture.Factory.Services.CreateScope();
			AppDbContext dbContext = scope.ServiceProvider
				.GetRequiredService<AppDbContext>();

			UserAccount staffAccount = await dbContext.UserAccount
				.Where(account =>
					account.UserId == userId
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

			return await _AuthClient.LoginAsync(
				email,
				TestConstants.SeedPassword
			);
		}

		private async Task _MarkInvitationAcceptedAsync(Guid invitationId) {
			using IServiceScope scope = _Fixture.Factory.Services.CreateScope();
			AppDbContext dbContext = scope.ServiceProvider
				.GetRequiredService<AppDbContext>();

			Invitation invitation = await dbContext.Invitation
				.Where(inv => inv.Id == invitationId)
				.FirstAsync();
			invitation.Status = InvitationStatus.Accepted;
			invitation.AcceptedAt = DateTime.UtcNow;

			_ = await dbContext.SaveChangesAsync();
		}

		private async Task<Guid> _CreateStaffInvitationAsync(
			string staffToken,
			string email
		) {
			using IServiceScope scope = _Fixture.Factory.Services.CreateScope();
			AppDbContext dbContext = scope.ServiceProvider
				.GetRequiredService<AppDbContext>();

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

			using HttpResponseMessage response = await _Http.SendAsync(request);
			_ = response.StatusCode.Should().Be(HttpStatusCode.Created);

			InvitationCreatedResponse? body = await response.Content
				.ReadFromJsonAsync<InvitationCreatedResponse>();
			_ = body.Should().NotBeNull();

			Assert.NotNull(body);
			return body.InvitationId;
		}

		private sealed record InvitationCreatedResponse {
			public required Guid InvitationId { get; init; }
		}
	}
}
