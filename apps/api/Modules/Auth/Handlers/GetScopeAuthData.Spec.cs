
using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Modules.Auth.Utils;
using PublyApp.Api.Modules.Roles.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Auth.Handlers;

public sealed class GetScopeAuthDataSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public GetScopeAuthDataSpec(
		ApiFixture fixture
	) {
		this._Fixture = fixture;
		this._Http = fixture.HttpClient;
		this._AuthClient = new TestAuthClient(this._Http);
	}

	[Fact]
	public async Task
	ItShouldReturnOkForActiveTenant() {
		var (_, acmeId) = await this._AuthClient.LoginAsStaffWithTenantAsync(
			SeedConstants.Tenants.AcmeName
		);

		var acmeAdminToken = await this._AuthClient.LoginAsAcmeAdminAsync();

		var url = $"{Routes.Auth.GetScopeAuthData}"
			+ $"?scope={acmeId}";
		var result = await this._Http.GetOkAsync<TenantScopeAuthDataResponse>(url, acmeAdminToken);
		result.Id.Should().Be(acmeId);
		result.Code.Should().Be(
			SeedConstants.Tenants.AcmeCode
		);
		result.Name.Should().Be(
			SeedConstants.Tenants.AcmeName
		);
		result.IsAdmin.Should().BeTrue();
	}

	[Fact]
	public async Task
	ItShouldReturnCanonicalTenantModulePermissionKeys() {
		var (staffToken, acmeId) = await this._AuthClient.LoginAsStaffWithTenantAsync(
			SeedConstants.Tenants.AcmeName
		);

		var rolePermissions = new[] {
			new[] {
				AppPermissions.Tenant.Modules.ACCESS_DASHBOARD.Key,
				AppPermissions.Tenant.Modules.ACCESS_BILLING.Key
			},
			[
				AppPermissions.Tenant.Modules.ACCESS_BILLING.Key,
				AppPermissions.Tenant.Modules.ACCESS_SETTINGS.Key
			]
		};
		var createdRoleIds = new List<Guid>();

		try {
			foreach (var permissions in rolePermissions) {
				createdRoleIds.Add(
					await this._CreateTenantRoleWithPermissionsAsync(
						acmeId,
						permissions
					)
				);
			}

			// The seeded Acme admin holds the full-access Owner role (wildcard), so the
			// exact role-derived set is proven on a member with no seeded roles.
			var memberEmail = await this._CreateBareTenantMemberAsync(acmeId);

			await this._AssignRoleToTenantUserAsync(
				memberEmail,
				acmeId,
				createdRoleIds
			);

			var acmeMemberToken = await this._AuthClient.LoginAsync(
				memberEmail,
				TestConstants.SeedPassword
			);

			var url = $"{Routes.Auth.GetScopeAuthData}"
				+ $"?scope={acmeId}";
			using var request = new HttpRequestMessage(
				HttpMethod.Get,
				url
			).WithSessionToken(acmeMemberToken);

			using var response =
				await this._Http.SendAsync(request);

			response.StatusCode.Should().Be(HttpStatusCode.OK);

			var result = await response.Content
				.ReadFromJsonAsync<TenantScopeAuthDataResponse>();
			result.Should().NotBeNull();

			var expectedPermissions = rolePermissions
				.SelectMany(permissions => permissions)
				.Distinct(StringComparer.OrdinalIgnoreCase)
				.ToList();

			Assert.NotNull(result);
			result.Permissions.Should().BeEquivalentTo(expectedPermissions);
			result.Permissions.Should().OnlyHaveUniqueItems();
			result.Permissions.Should().OnlyContain(permission =>
				permission.StartsWith(
					"tenant.modules.",
				StringComparison.Ordinal
				)
			);
			result.Permissions.Should().NotContain(permission =>
				permission.StartsWith(
					"can_access_",
					StringComparison.Ordinal
				)
			);
			result.Permissions.Should().NotContain(
				AppPermissions.Tenant.Modules.ACCESS_USERS.Key
			);
		} finally {
			await this._CleanupScopeAuthDataTestArtifactsAsync(createdRoleIds);
		}
	}

	[Fact]
	public async Task
	ItShouldExcludeRevokedDeletedAndWrongScopePermissionsFromTenantScopeAuthData() {
		var (_, acmeId) = await this._AuthClient.LoginAsStaffWithTenantAsync(
			SeedConstants.Tenants.AcmeName
		);

		var createdRoleIds = new List<Guid>();

		try {
			var activeRoleId = await this._CreateTenantRoleWithPermissionsAsync(
				acmeId,
				[AppPermissions.Tenant.Modules.ACCESS_DASHBOARD.Key]
			);
			var revokedPermissionRoleId = await this._CreateTenantRoleWithPermissionsAsync(
				acmeId,
				[AppPermissions.Tenant.Modules.ACCESS_USERS.Key]
			);
			var softDeletedLinkRoleId = await this._CreateTenantRoleWithPermissionsAsync(
				acmeId,
				[AppPermissions.Tenant.Modules.ACCESS_BILLING.Key]
			);
			var wrongScopeRoleId = await this._CreateTenantRoleWithPermissionsAsync(
				acmeId,
				[]
			);

			createdRoleIds.AddRange(
				[
					activeRoleId,
					revokedPermissionRoleId,
					softDeletedLinkRoleId,
					wrongScopeRoleId,
				]
			);

			// The seeded Acme admin holds the full-access Owner role (wildcard), so the
			// leak-proof set is proven on a member with no seeded roles.
			var memberEmail = await this._CreateBareTenantMemberAsync(acmeId);

			await this._AssignRoleToTenantUserAsync(
				memberEmail,
				acmeId,
				createdRoleIds
			);

			await this._ConfigureTenantAuthPermissionLeakScenarioAsync(
				tenantId: acmeId,
				email: memberEmail,
				revokedPermissionRoleId: revokedPermissionRoleId,
				revokedPermissionKey: AppPermissions.Tenant.Modules.ACCESS_USERS.Key,
				softDeletedLinkRoleId: softDeletedLinkRoleId,
				wrongScopeRoleId: wrongScopeRoleId,
				wrongScopePermissionKey: AppPermissions.Staff.Users.LIST_FOR_STAFF.Key
			);

			var acmeMemberToken = await this._AuthClient.LoginAsync(
				memberEmail,
				TestConstants.SeedPassword
			);

			var url = $"{Routes.Auth.GetScopeAuthData}"
				+ $"?scope={acmeId}";
			var result = await this._Http.GetOkAsync<TenantScopeAuthDataResponse>(
				url,
				acmeMemberToken
			);
			result.Permissions.Should().BeEquivalentTo(
							[AppPermissions.Tenant.Modules.ACCESS_DASHBOARD.Key]
						);
		} finally {
			await this._CleanupScopeAuthDataTestArtifactsAsync(createdRoleIds);
		}
	}

	[Fact]
	public async Task
	ItShouldReturnAllAssignedTenantRolesEvenWhenTheyExceedConfiguredCap() {
		var (staffToken, acmeId) = await this._AuthClient.LoginAsStaffWithTenantAsync(
			SeedConstants.Tenants.AcmeName
		);

		var createdRoleIds = new List<Guid>();
		var requestedRoleCount = AppEnvironment.Instance.MAX_ROLES_PER_USER + 1;

		try {
			for (var index = 0; index < requestedRoleCount; index++) {
				createdRoleIds.Add(
					await this._CreateTenantRoleWithPermissionsAsync(
						acmeId,
						[AppPermissions.Tenant.Modules.ACCESS_DASHBOARD.Key]
					)
				);
			}

			// Auth data must expose the full effective role set even if historical data grows
			// past the configurable write-time cap. A member with no seeded roles keeps the
			// expected set exactly the created roles.
			var memberEmail = await this._CreateBareTenantMemberAsync(acmeId);

			await this._AssignRoleToTenantUserAsync(
				memberEmail,
				acmeId,
				createdRoleIds
			);

			var acmeMemberToken = await this._AuthClient.LoginAsync(
				memberEmail,
				TestConstants.SeedPassword
			);

			var url = $"{Routes.Auth.GetScopeAuthData}"
				+ $"?scope={acmeId}";
			var result = await this._Http.GetOkAsync<TenantScopeAuthDataResponse>(
				url,
				acmeMemberToken
			);
			result.Roles.Should().HaveCount(requestedRoleCount);
			result.Roles.Select(role => role.Id)
				.Should()
				.BeEquivalentTo(createdRoleIds);
		} finally {
			await this._CleanupScopeAuthDataTestArtifactsAsync(createdRoleIds);
		}
	}

	[Fact]
	public async Task
	ItShouldReturnStaffDataForStaffScope() {
		var staffToken =
			await this._AuthClient.LoginAsStaffAdminAsync();

		var url = $"{Routes.Auth.GetScopeAuthData}"
			+ "?scope=staff";
		var result = await this._Http.GetOkAsync<StaffScopeAuthDataResponse>(url, staffToken);
		result.Code.Should().Be("staff");
		result.IsAdmin.Should().BeTrue();
	}

	[Fact]
	public async Task
	ItShouldReturnForbiddenWhenNonStaffAccessesStaffScope() {
		var acmeAdminToken = await this._AuthClient.LoginAsAcmeAdminAsync();

		var url = $"{Routes.Auth.GetScopeAuthData}"
			+ "?scope=staff";
		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			url
		).WithSessionToken(acmeAdminToken);

		using var response =
			await this._Http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Forbidden);

		await response.ShouldBeProblemAsync("not-a-staff-user");
	}

	[Fact]
	public async Task
	ItShouldReturnForbiddenForInvalidTenantGuid() {
		var acmeAdminToken = await this._AuthClient.LoginAsAcmeAdminAsync();

		var url = $"{Routes.Auth.GetScopeAuthData}"
			+ "?scope=not-a-valid-guid";
		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			url
		).WithSessionToken(acmeAdminToken);

		using var response =
			await this._Http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Forbidden);

		await response.ShouldBeProblemAsync("forbidden");
	}

	[Fact]
	public async Task
	ItShouldReturn403WithKeyForSuspendedTenant() {
		var (staffToken, acmeId) = await this._AuthClient.LoginAsStaffWithTenantAsync(
			SeedConstants.Tenants.AcmeName
		);

		// Suspend Acme
		using var suspend =
			await TenantTestHelper.SuspendTenantAsync(
				this._Http, staffToken, acmeId
			);
		suspend.StatusCode.Should().Be(HttpStatusCode.OK);

		try {
			var acmeAdminToken =
				await this._AuthClient.LoginAsAcmeAdminAsync();

			var url = $"{Routes.Auth.GetScopeAuthData}"
				+ $"?scope={acmeId}";
			using var request = new HttpRequestMessage(
				HttpMethod.Get,
				url
			).WithSessionToken(acmeAdminToken);

			using var response =
				await this._Http.SendAsync(request);

			response.StatusCode.Should()
				.Be(HttpStatusCode.Forbidden);

			await response.ShouldBeProblemAsync("tenant-suspended");
		} finally {
			using var cleanup =
				await TenantTestHelper
					.ReactivateTenantAsync(
						this._Http, staffToken, acmeId
					);
		}
	}

	[Fact]
	public async Task
	ItShouldReturn403ForNonMember() {
		var (_, techStartId) = await this._AuthClient.LoginAsStaffWithTenantAsync(
			SeedConstants.Tenants.TechStartName
		);

		// Acme admin is NOT a member of TechStart
		var acmeAdminToken = await this._AuthClient.LoginAsAcmeAdminAsync();

		var url = $"{Routes.Auth.GetScopeAuthData}"
			+ $"?scope={techStartId}";
		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			url
		).WithSessionToken(acmeAdminToken);

		using var response =
			await this._Http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Forbidden);

		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		// Non-member: generic forbidden, NOT
		// "tenant-suspended"
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be("forbidden");
	}

	[Fact]
	public async Task
	ItShouldReturnOkAfterReactivation() {
		var (staffToken, acmeId) = await this._AuthClient.LoginAsStaffWithTenantAsync(
			SeedConstants.Tenants.AcmeName
		);

		// Suspend then reactivate
		using var suspend =
			await TenantTestHelper.SuspendTenantAsync(
				this._Http, staffToken, acmeId
			);
		suspend.StatusCode.Should().Be(HttpStatusCode.OK);

		using var reactivate =
			await TenantTestHelper.ReactivateTenantAsync(
				this._Http, staffToken, acmeId
			);
		reactivate.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		// Now access should work again
		var acmeAdminToken = await this._AuthClient.LoginAsAcmeAdminAsync();

		var url = $"{Routes.Auth.GetScopeAuthData}"
			+ $"?scope={acmeId}";
		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			url
		).WithSessionToken(acmeAdminToken);

		using var response =
			await this._Http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
	}

	[Fact]
	public async Task
	ItShouldReturnUnauthorizedForGloballySuspendedUser() {
		var (_, acmeId) = await this._AuthClient.LoginAsStaffWithTenantAsync(
			SeedConstants.Tenants.AcmeName
		);

		var acmeAdminToken = await this._AuthClient.LoginAsAcmeAdminAsync();

		await this._SetUserSuspendedByEmailAsync(
			TestConstants.AcmeAdminEmail,
			isSuspended: true
		);

		try {
			var url = $"{Routes.Auth.GetScopeAuthData}"
				+ $"?scope={acmeId}";
			using var request = new HttpRequestMessage(
				HttpMethod.Get,
				url
			).WithSessionToken(acmeAdminToken);

			using var response =
				await this._Http.SendAsync(request);

			response.StatusCode.Should()
				.Be(HttpStatusCode.Unauthorized);
		} finally {
			await this._SetUserSuspendedByEmailAsync(
				TestConstants.AcmeAdminEmail,
				isSuspended: false
			);
		}
	}

	private async Task _SetUserSuspendedByEmailAsync(
		string email,
		bool isSuspended
	) {
		var trimmedEmail = email.Trim();

		await using var db = this._Fixture.OpenDb();

		var matchedUser = await (
			from u in db.Context.User
			where !u.IsDeleted
			select new UserEmailLookup(u.Id, u.Email)
		).ToListAsync();

		var user = matchedUser.FirstOrDefault(candidate =>
			string.Equals(
				candidate.Email,
				trimmedEmail,
				StringComparison.OrdinalIgnoreCase
			)
		);

		if (user is null) {
			throw new InvalidOperationException(
				"Expected user to exist for suspension test"
			);
		}

		var userId = user.Id;
		if (userId is null) {
			throw new InvalidOperationException(
				"Expected user id to exist for suspension test"
			);
		}

		var updatedCount = await db.Context.User
			.Where(u => u.Id == userId)
			.ExecuteUpdateAsync(setters => setters
				.SetProperty(
					u => u.Status,
					isSuspended
						? UserStatus.Suspended
						: UserStatus.Active
				)
				.SetProperty(u => u.UpdatedAt, DateTime.UtcNow));

		updatedCount.Should().Be(1);
	}

	private async Task<Guid> _CreateTenantRoleWithPermissionsAsync(
		Guid tenantId,
		IEnumerable<string> permissionKeys
	) {
		await using var db = this._Fixture.OpenDb();

		var role = Role.CreateTenantRole(
			tenantId,
			"Tenant Auth Data Spec " + Guid.NewGuid().ToString("N")[..8],
			"Created for tenant auth data permission assertions"
		);
		role.ValidateRoleType();

		_ = await db.Context.Role.AddAsync(role);
		await db.Context.SaveChangesAsync();

		var roleId = role.GetRequiredId();

		foreach (var permissionKey in permissionKeys) {
			_ = await db.Context.RolePermission.AddAsync(
				new RolePermission {
					RoleId = roleId,
					PermissionKey = permissionKey
				}
			);
		}

		await db.Context.SaveChangesAsync();

		return roleId;
	}

	// Seeds a tenant member with no role assignments, so a role-derived permission
	// assertion is not polluted by the seeded admin's full-access Owner role.
	private async Task<string> _CreateBareTenantMemberAsync(Guid tenantId) {
		await using var db = this._Fixture.OpenDb();

		var email = $"auth-data-{Guid.NewGuid():N}@example.com";
		var user = new User {
			Email = email,
			Password = PasswordUtils.HashPassword(TestConstants.SeedPassword),
			FirstName = "AuthData",
			LastName = "Member",
			Status = UserStatus.Active,
			IsVerified = true,
		};
		_ = await db.Context.User.AddAsync(user);
		await db.Context.SaveChangesAsync();

		var account = UserAccount.CreateTenantAccount(user.GetRequiredId(), tenantId);
		account.ValidateAccountType();
		_ = await db.Context.UserAccount.AddAsync(account);
		await db.Context.SaveChangesAsync();

		return email;
	}

	private async Task _AssignRoleToTenantUserAsync(
		string email,
		Guid tenantId,
		IReadOnlyCollection<Guid> roleIds
	) {
		var trimmedEmail = email.Trim();

		await using var db = this._Fixture.OpenDb();

		var tenantUserAccounts = await (
			from ua in db.Context.UserAccount
			where ua.Scope == AccountScope.Tenant
				&& ua.TenantId == tenantId
				&& !ua.IsDeleted
				&& !ua.User.IsDeleted
			select new TenantUserAccountLookup(
				ua.Id,
				ua.User.Email
			)
		).ToListAsync();

		var tenantUserAccount = tenantUserAccounts.FirstOrDefault(
			account => string.Equals(
				account.Email,
				trimmedEmail,
				StringComparison.OrdinalIgnoreCase
			)
		);

		if (tenantUserAccount is null) {
			throw new InvalidOperationException(
				"Expected tenant user account to exist for auth-data test"
			);
		}

		if (tenantUserAccount.Id is null) {
			throw new InvalidOperationException(
				"Expected tenant user account id to exist for auth-data test"
			);
		}

		foreach (var roleId in roleIds) {
			_ = await db.Context.UserAccountRole.AddAsync(
				new UserAccountRole {
					UserAccountId = tenantUserAccount.Id.Value,
					RoleId = roleId
				}
			);
		}

		await db.Context.SaveChangesAsync();
	}

	private async Task _ConfigureTenantAuthPermissionLeakScenarioAsync(
		Guid tenantId,
		string email,
		Guid revokedPermissionRoleId,
		string revokedPermissionKey,
		Guid softDeletedLinkRoleId,
		Guid wrongScopeRoleId,
		string wrongScopePermissionKey
	) {
		var trimmedEmail = email.Trim();

		await using var db = this._Fixture.OpenDb();

		var tenantUserAccounts = await (
			from ua in db.Context.UserAccount
			where ua.Scope == AccountScope.Tenant
				&& ua.TenantId == tenantId
				&& !ua.IsDeleted
				&& !ua.User.IsDeleted
			select new {
				ua.Id,
				ua.User.Email
			}
		).ToListAsync();

		var tenantUserAccount = tenantUserAccounts.FirstOrDefault(
			account => string.Equals(
				account.Email,
				trimmedEmail,
				StringComparison.OrdinalIgnoreCase
			)
		);

		if (tenantUserAccount is null || tenantUserAccount.Id is null) {
			throw new InvalidOperationException(
				"Expected tenant user account to exist for auth-data test"
			);
		}

		var revokedPermission = await (
			from pp in db.Context.RolePermission
			where pp.RoleId == revokedPermissionRoleId
				&& pp.PermissionKey == revokedPermissionKey
			select pp
		).FirstOrDefaultAsync();

		if (revokedPermission is null) {
			throw new InvalidOperationException(
				"Expected role permission to exist for auth-data test"
			);
		}

		// Revoked permission membership is represented by no RolePermission row.
		db.Context.RolePermission.Remove(revokedPermission);

		var softDeletedLink = await (
			from uap in db.Context.UserAccountRole
			where uap.RoleId == softDeletedLinkRoleId
				&& uap.UserAccountId == tenantUserAccount.Id
			select uap
		).FirstOrDefaultAsync();

		if (softDeletedLink is null) {
			throw new InvalidOperationException(
				"Expected user-account role link to exist for auth-data test"
			);
		}

		// Revoked role membership is represented by no UserAccountRole row.
		db.Context.UserAccountRole.Remove(softDeletedLink);

		_ = await db.Context.RolePermission.AddAsync(
			new RolePermission {
				RoleId = wrongScopeRoleId,
				PermissionKey = wrongScopePermissionKey
			}
		);

		await db.Context.SaveChangesAsync();
	}

	private async Task _CleanupScopeAuthDataTestArtifactsAsync(
		IReadOnlyCollection<Guid> roleIds
	) {
		if (roleIds.Count == 0) {
			return;
		}

		await using var db = this._Fixture.OpenDb();

		var roleIdList = roleIds.ToList();

		var linksToRemove = await (
			from uap in db.Context.UserAccountRole
			where roleIdList.Contains(uap.RoleId)
			select uap
		).ToListAsync();

		if (linksToRemove.Count > 0) {
			db.Context.ForceHardDeleteRange(linksToRemove);
		}

		var permissionsToRemove = await (
			from pp in db.Context.RolePermission
			where roleIdList.Contains(pp.RoleId)
			select pp
		).ToListAsync();

		if (permissionsToRemove.Count > 0) {
			db.Context.ForceHardDeleteRange(permissionsToRemove);
		}

		var rolesToRemove = (await (
			from p in db.Context.Role
			select p
		).ToListAsync())
			.Where(role => roleIdList.Contains(role.GetRequiredId()))
			.ToList();

		if (rolesToRemove.Count > 0) {
			db.Context.ForceHardDeleteRange(rolesToRemove);
			await db.Context.SaveChangesAsync();
		}
	}

	private sealed record TenantUserAccountLookup(
		Guid? Id,
		string Email
	);

	private sealed record UserEmailLookup(
		Guid? Id,
		string Email
	);

	private record TenantScopeAuthDataResponse {
		public Guid Id { get; init; }
		public string Name { get; init; } = string.Empty;
		public string Code { get; init; } = string.Empty;
		public List<AuthRoleResponse> Roles { get; init; } = [];
		public bool IsAdmin { get; init; }
		public List<string> Permissions { get; init; } = [];
	}

	private record StaffScopeAuthDataResponse {
		public string Code { get; init; } = string.Empty;
		public List<AuthRoleResponse> Roles { get; init; } = [];
		public bool IsAdmin { get; init; }
		public List<string> Permissions { get; init; } = [];
	}

	private record AuthRoleResponse {
		public Guid Id { get; init; }
		public string Name { get; init; } = string.Empty;
		public List<string> Permissions { get; init; } = [];
	}
}
