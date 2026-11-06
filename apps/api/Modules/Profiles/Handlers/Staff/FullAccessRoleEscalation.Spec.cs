using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Auth.Utils;
using PublyApp.Api.Modules.Permissions.Entities;
using PublyApp.Api.Modules.Profiles.Entities;
using PublyApp.Api.Modules.Profiles.Services;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Profiles.Handlers.Staff;

/// <summary>
/// Privilege escalation (#2289, behaviour 6). Since #2289 the full-access role is an ordinary
/// profile row flagged <see cref="Profile.IsFullAccess"/>, so every endpoint that can hand a
/// profile to somebody is a potential self-grant of every permission. A staff member who holds
/// the route permission but not the full-access role must be refused on every such surface.
///
/// Each test grants the actor exactly the route permission(s), so a 403 here can only come from
/// <see cref="ProfileAssignmentGuard"/> — never from the route permission filter. The full-access
/// actor is exercised as the positive control on the two assignment write paths.
/// </summary>
public sealed class FullAccessRoleEscalationSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public FullAccessRoleEscalationSpec(ApiFixture fixture) {
		this._Fixture = fixture;
		this._Http = fixture.HttpClient;
		this._AuthClient = new TestAuthClient(this._Http);
	}

	// -------------------------------------------------------------------------------------
	// 1. Staff user profile assignment (PUT /staff/users/{userId}/profiles)
	// -------------------------------------------------------------------------------------

	[Fact]
	public async Task ItShouldRefuseToSelfAssignTheStaffFullAccessRole() {
		var (token, userId) = await this._SeedActorAsync(
			AppPermissions.Staff.Users.UPDATE_PROFILES_FOR_STAFF
		);
		var staffOwnerId = await this._GetStaffFullAccessProfileIdAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Put,
			$"/staff/users/{userId}/profiles"
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { profileIds = new[] { staffOwnerId } });

		using var response = await this._Http.SendAsync(request);

		await FullAccessRoleEscalationSpec._AssertForbiddenAsync(response);
		(await this._IsStaffAssignedAsync(userId, staffOwnerId))
			.Should().BeFalse("a non-full-access actor must not grant itself the full-access role");
	}

	[Fact]
	public async Task ItShouldAllowAFullAccessActorToAssignTheStaffFullAccessRole() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var targetUserId = await this._GetStaffUserIdByEmailAsync(
			TestConstants.StaffUserEmail
		);
		var staffOwnerId = await this._GetStaffFullAccessProfileIdAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Put,
			$"/staff/users/{targetUserId}/profiles"
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { profileIds = new[] { staffOwnerId } });

		using var response = await this._Http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		(await this._IsStaffAssignedAsync(targetUserId, staffOwnerId))
			.Should().BeTrue("the guard must not block a full-access actor");
	}

	// -------------------------------------------------------------------------------------
	// 2. Staff invitation (POST /staff/invitations)
	// -------------------------------------------------------------------------------------

	[Fact]
	public async Task ItShouldRefuseAStaffInvitationCarryingTheFullAccessRole() {
		var (token, _) = await this._SeedActorAsync(
			AppPermissions.Staff.Invitations.CREATE_FOR_STAFF
		);
		var staffOwnerId = await this._GetStaffFullAccessProfileIdAsync();
		var email = $"escalation-{Guid.NewGuid():N}@example.com";

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			"/staff/invitations/"
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { email, profileId = staffOwnerId });

		using var response = await this._Http.SendAsync(request);

		await FullAccessRoleEscalationSpec._AssertForbiddenAsync(response);
		(await this._InvitationExistsAsync(email))
			.Should().BeFalse("the invitation must not be created");
	}

	// -------------------------------------------------------------------------------------
	// 3. Bulk staff invitations (POST /staff/invitations/bulk)
	// -------------------------------------------------------------------------------------

	[Fact]
	public async Task ItShouldRefuseABulkStaffInvitationCarryingTheFullAccessRole() {
		var (token, _) = await this._SeedActorAsync(
			AppPermissions.Staff.Invitations.CREATE_FOR_STAFF
		);
		var staffOwnerId = await this._GetStaffFullAccessProfileIdAsync();
		var email = $"escalation-bulk-{Guid.NewGuid():N}@example.com";

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			"/staff/invitations/bulk"
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new {
			invitations = new[] {
				new { email, profileIds = new[] { staffOwnerId } },
			},
		});

		using var response = await this._Http.SendAsync(request);

		await FullAccessRoleEscalationSpec._AssertForbiddenAsync(response);
		(await this._InvitationExistsAsync(email))
			.Should().BeFalse("the bulk invitation must not be created");
	}

	// -------------------------------------------------------------------------------------
	// 4. Tenant invitation (POST /staff/tenants/{tenantId}/users/invitations)
	// -------------------------------------------------------------------------------------

	[Fact]
	public async Task ItShouldRefuseATenantInvitationCarryingTheFullAccessRole() {
		var (token, _) = await this._SeedActorAsync(
			AppPermissions.Staff.Users.CREATE_FOR_TENANT
		);
		var tenantId = await this._GetSeededTenantIdAsync();
		var ownerProfileId = await this._GetTenantFullAccessProfileIdAsync(tenantId);
		var email = $"escalation-tenant-{Guid.NewGuid():N}@example.com";

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			$"/staff/tenants/{tenantId}/users/invitations"
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new { email, profileIds = new[] { ownerProfileId } });

		using var response = await this._Http.SendAsync(request);

		await FullAccessRoleEscalationSpec._AssertForbiddenAsync(response);
		(await this._InvitationExistsAsync(email))
			.Should().BeFalse("the tenant invitation must not be created");
	}

	// -------------------------------------------------------------------------------------
	// 5. Bulk tenant invitations (POST /staff/tenants/{tenantId}/users/invitations/bulk)
	// -------------------------------------------------------------------------------------

	[Fact]
	public async Task ItShouldRefuseABulkTenantInvitationCarryingTheFullAccessRole() {
		var (token, _) = await this._SeedActorAsync(
			AppPermissions.Staff.Users.CREATE_FOR_TENANT
		);
		var tenantId = await this._GetSeededTenantIdAsync();
		var ownerProfileId = await this._GetTenantFullAccessProfileIdAsync(tenantId);
		var email = $"escalation-tenant-bulk-{Guid.NewGuid():N}@example.com";

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			$"/staff/tenants/{tenantId}/users/invitations/bulk"
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new {
			invitations = new[] {
				new { email, profileIds = new[] { ownerProfileId } },
			},
		});

		using var response = await this._Http.SendAsync(request);

		await FullAccessRoleEscalationSpec._AssertForbiddenAsync(response);
		(await this._InvitationExistsAsync(email))
			.Should().BeFalse("the bulk tenant invitation must not be created");
	}

	// -------------------------------------------------------------------------------------
	// 6. Tenant profile membership (POST /staff/tenants/{tenantId}/profiles/{id}/users/{account})
	// -------------------------------------------------------------------------------------

	[Fact]
	public async Task ItShouldRefuseAssigningTheTenantFullAccessRoleToAMember() {
		var (token, _) = await this._SeedActorAsync(
			AppPermissions.Staff.Profiles.UPDATE_FOR_TENANT,
			AppPermissions.Staff.Users.UPDATE_FOR_TENANT
		);
		var tenantId = await this._GetSeededTenantIdAsync();
		var ownerProfileId = await this._GetTenantFullAccessProfileIdAsync(tenantId);
		var memberAccountId = await this._GetAnyTenantMemberAccountIdAsync(tenantId);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			$"/staff/tenants/{tenantId}/profiles/{ownerProfileId}/users/{memberAccountId}"
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);

		await FullAccessRoleEscalationSpec._AssertForbiddenAsync(response);
		(await this._IsTenantAssignedAsync(memberAccountId, ownerProfileId))
			.Should().BeFalse("a non-full-access actor must not hand out the tenant full-access role");
	}

	[Fact]
	public async Task ItShouldAllowAFullAccessActorToAssignTheTenantFullAccessRole() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();
		var tenantId = await this._GetSeededTenantIdAsync();
		var ownerProfileId = await this._GetTenantFullAccessProfileIdAsync(tenantId);
		var memberAccountId = await this._GetAnyTenantMemberAccountIdAsync(tenantId);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			$"/staff/tenants/{tenantId}/profiles/{ownerProfileId}/users/{memberAccountId}"
		).WithSessionToken(token);

		using var response = await this._Http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.NoContent);
		(await this._IsTenantAssignedAsync(memberAccountId, ownerProfileId))
			.Should().BeTrue("the guard must not block a full-access actor");
	}

	// -------------------------------------------------------------------------------------
	// 7. Tenant creation with an owner (POST /staff/tenants)
	// -------------------------------------------------------------------------------------

	[Fact]
	public async Task ItShouldRefuseCreatingATenantWithAnOwnerWithoutFullAccess() {
		var (token, _) = await this._SeedActorAsync(AppPermissions.Staff.Tenants.CREATE);
		var suffix = Guid.NewGuid().ToString("N")[..8];
		var code = $"escalation-{suffix}";

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			"/staff/tenants/"
		).WithSessionToken(token);
		request.Content = JsonContent.Create(new {
			name = $"Escalation Tenant {suffix}",
			code,
			initialUsers = new[] {
				new { email = $"owner-{suffix}@example.com", role = "owner" },
			},
		});

		using var response = await this._Http.SendAsync(request);

		await FullAccessRoleEscalationSpec._AssertForbiddenAsync(response);
		(await this._TenantExistsAsync(code))
			.Should().BeFalse("the tenant must not be created with an owner invitation");
	}

	// -------------------------------------------------------------------------------------
	// Helpers
	// -------------------------------------------------------------------------------------

	/// <summary>
	/// Creates a staff account that holds ONLY <paramref name="permissions"/>, so the route
	/// permission filter passes and the escalation guard is the only thing left to refuse.
	/// </summary>
	private async Task<(string Token, Guid UserId)> _SeedActorAsync(params Permission[] permissions) {
		var email = $"escalation-actor-{Guid.NewGuid():N}@example.com";

		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var user = new User {
			Email = email,
			Password = PasswordUtils.HashPassword(TestConstants.SeedPassword),
			FirstName = "Escalation",
			LastName = "Actor",
			IsVerified = true,
			Status = UserStatus.Active,
		};
		_ = dbContext.User.Add(user);
		_ = await dbContext.SaveChangesAsync();

		var account = UserAccount.CreateStaffAccount(user.GetRequiredId());
		account.ValidateAccountType();
		_ = dbContext.UserAccount.Add(account);
		_ = await dbContext.SaveChangesAsync();

		var profile = Profile.CreateStaffProfile(
			$"escalation-profile-{Guid.NewGuid():N}",
			"Test-only profile holding the route permission under test"
		);
		profile.ValidateProfileType();
		_ = dbContext.Profile.Add(profile);
		_ = await dbContext.SaveChangesAsync();

		foreach (var permission in permissions) {
			_ = dbContext.ProfilePermission.Add(new ProfilePermission {
				ProfileId = profile.GetRequiredId(),
				PermissionKey = permission.Key,
			});
		}
		_ = dbContext.UserAccountProfile.Add(new UserAccountProfile {
			UserAccountId = account.GetRequiredId(),
			ProfileId = profile.GetRequiredId(),
		});
		_ = await dbContext.SaveChangesAsync();

		var token = await this._AuthClient.LoginAsync(email, TestConstants.SeedPassword);
		return (token, user.GetRequiredId());
	}

	private static async Task _AssertForbiddenAsync(HttpResponseMessage response) {
		if (response.StatusCode != HttpStatusCode.Forbidden) {
			var body = await response.Content.ReadAsStringAsync();
			throw new Xunit.Sdk.XunitException(
				$"Expected 403 Forbidden from the full-access assignment guard, got "
				+ $"{(int)response.StatusCode}. Body: {body}"
			);
		}

		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(ResponseKeys.Forbidden);
	}

	private async Task<Guid> _GetStaffFullAccessProfileIdAsync() {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		return await FullAccessProfileTestHelper.EnsureStaffProfileAsync(dbContext);
	}

	private async Task<Guid> _GetTenantFullAccessProfileIdAsync(Guid tenantId) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		return await FullAccessProfileTestHelper.EnsureTenantProfileAsync(dbContext, tenantId);
	}

	private async Task<Guid> _GetSeededTenantIdAsync() {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		return await dbContext.Tenant
			.Where(tenant => tenant.Code == SeedConstants.Tenants.AcmeCode)
			.Select(tenant => tenant.GetRequiredId())
			.FirstAsync();
	}

	private async Task<Guid> _GetAnyTenantMemberAccountIdAsync(Guid tenantId) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		// A member that is NOT already full access, so "was it assigned?" is a real signal.
		return await (
			from account in dbContext.UserAccount
			where account.TenantId == tenantId
				&& account.Scope == AccountScope.Tenant
				&& !(
					from uap in dbContext.UserAccountProfile
					join p in dbContext.Profile on uap.ProfileId equals p.Id
					where uap.UserAccountId == account.Id && p.IsFullAccess
					select 1
				).Any()
			select account.GetRequiredId()
		).FirstAsync();
	}

	private async Task<Guid> _GetStaffUserIdByEmailAsync(string email) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		return await dbContext.User
			.Where(user => user.Email == email)
			.Select(user => user.GetRequiredId())
			.FirstAsync();
	}

	private async Task<bool> _IsStaffAssignedAsync(Guid userId, Guid profileId) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		return await (
			from uap in dbContext.UserAccountProfile
			join account in dbContext.UserAccount on uap.UserAccountId equals account.Id
			where account.UserId == userId
				&& uap.ProfileId == profileId
				&& account.Scope == AccountScope.Staff
			select uap.ProfileId
		).AnyAsync();
	}

	private async Task<bool> _IsTenantAssignedAsync(Guid userAccountId, Guid profileId) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		return await dbContext.UserAccountProfile
			.AnyAsync(uap => uap.UserAccountId == userAccountId && uap.ProfileId == profileId);
	}

	private async Task<bool> _InvitationExistsAsync(string email) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		return await dbContext.Invitation.AnyAsync(invitation => invitation.Email == email);
	}

	private async Task<bool> _TenantExistsAsync(string code) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		return await dbContext.Tenant.AnyAsync(tenant => tenant.Code == code);
	}
}
