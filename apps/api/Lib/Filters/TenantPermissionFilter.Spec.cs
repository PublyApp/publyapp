
using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Auth.Utils;
using PublyApp.Api.Modules.Roles.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

using AppRoutes = PublyApp.Api.Lib.Routes.Routes;

namespace PublyApp.Api.Lib.Filters;

/// <summary>
/// Security proof for #861: a holder of the tenant's full-access `Owner` role must
/// genuinely bypass the per-permission check (the full-access short-circuit in
/// TenantPermissionFilter), the bypass must not leak into a different tenant, and tenant
/// members without that role must still be governed strictly by their
/// role-derived permissions.
///
/// Exercises the real HTTP pipeline via the real tenant posts endpoint GET /posts
/// (Program.cs: MapPostEndpointsForTenant), gated with
/// .WithTenantPermission([AppPermissions.Tenant.Posts.VIEW]) — the same pattern
/// TenantAuthFilterSpec uses against /test, but now against the first real
/// permission-gated tenant CRUD surface (B1 #637) after the Testing-only
/// /test-permission scaffold was removed.
/// </summary>
public sealed class TenantPermissionFilterSpec
	: IClassFixture<ApiFixture> {
	private const string _PostsEndpoint = "/posts";

	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public TenantPermissionFilterSpec(
		ApiFixture fixture
	) {
		this._Fixture = fixture;
		this._Http = fixture.HttpClient;
		this._AuthClient = new TestAuthClient(this._Http);
	}

	// Creates a fresh Acme tenant member with no role assignments at all. Seeded
	// members carry their own roles, so permission proofs seed a dedicated member.
	private async Task<(Guid TenantId, string Email, Guid UserAccountId)>
	_CreateBareAcmeMemberAsync() {
		var staffToken = await this._AuthClient.LoginAsStaffAdminAsync();
		var acmeId = await TenantTestHelper.GetTenantIdByNameAsync(
			this._Http,
			staffToken,
			SeedConstants.Tenants.AcmeName
		);
		var email = $"perm-filter-{Guid.NewGuid():N}@example.com";

		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var user = new User {
			Email = email,
			Password = PasswordUtils.HashPassword(TestConstants.SeedPassword),
			IsVerified = true,
			Status = UserStatus.Active,
		};
		db.User.Add(user);
		await db.SaveChangesAsync();

		var account = UserAccount.CreateTenantAccount(
			user.GetRequiredId(), acmeId
		);
		account.ValidateAccountType();
		db.UserAccount.Add(account);
		await db.SaveChangesAsync();

		return (acmeId, email, account.GetRequiredId());
	}

	[Fact]
	public async Task
	ItShouldAllowTenantFullAccessMemberWithNoRolePermissionsToAccessPermissionGatedEndpoint() {
		// The #861 scenario under the role-based model: a tenant member holding ONLY
		// the tenant Owner full-access role — no role_permissions rows — derives
		// the wildcard permission and passes every gate.
		var (acmeId, email, userAccountId) = await this._CreateBareAcmeMemberAsync();

		await using (var scope = this._Fixture.Factory.Services.CreateAsyncScope()) {
			var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
			var ownerRoleId = await FullAccessRoleTestHelper.EnsureTenantRoleAsync(
				db,
				acmeId
			);
			await FullAccessRoleTestHelper.AssignAsync(db, userAccountId, ownerRoleId);

			var permissionRowCount = await (
				from pp in db.RolePermission
				where pp.RoleId == ownerRoleId
				select pp
			).CountAsync();
			permissionRowCount.Should().Be(0);
		}

		var fullAccessToken = await this._AuthClient.LoginAsync(
			email,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			TenantPermissionFilterSpec._PostsEndpoint
		)
			.WithSessionToken(fullAccessToken)
			.WithTenantId(acmeId);

		using var response =
			await this._Http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
	}

	[Fact]
	public async Task
	ItShouldReturn403ForTenantMemberWithRestrictedRole() {
		// A member whose only role carries a permission other than posts.view is
		// still governed strictly by the role-derived permission set.
		var (acmeId, email, _) = await this._CreateBareAcmeMemberAsync();
		var createdRoleIds = new List<Guid>();

		try {
			var roleId = await this._CreateTenantRoleWithPermissionsAsync(
				acmeId,
				[AppPermissions.Tenant.Posts.CREATE.Key]
			);
			createdRoleIds.Add(roleId);

			await this._AssignRoleToTenantUserAsync(
				email,
				acmeId,
				createdRoleIds
			);

			var memberToken = await this._AuthClient.LoginAsync(
				email,
				TestConstants.SeedPassword
			);

			using var request = new HttpRequestMessage(
				HttpMethod.Get,
				TenantPermissionFilterSpec._PostsEndpoint
			)
				.WithSessionToken(memberToken)
				.WithTenantId(acmeId);

			using var response =
				await this._Http.SendAsync(request);

			response.StatusCode.Should()
				.Be(HttpStatusCode.Forbidden);

			var problem = await response.Content
				.ReadFromJsonAsync<AppProblemDetails>();
			problem.Should().NotBeNull();
			Assert.NotNull(problem);
			problem.TranslationKey.Should()
				.Be("user-does-not-have-the-necessary-permissions");
		} finally {
			await this._CleanupTenantRoleArtifactsAsync(createdRoleIds);
		}
	}

	[Fact]
	public async Task
	ItShouldReturn200ForTenantMemberWithRequiredRolePermission() {
		// Regression guard: role-derived permissions must still grant access for
		// members without the full-access role exactly as before the bypass existed.
		var staffToken =
			await this._AuthClient.LoginAsStaffAdminAsync();
		var acmeId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				this._Http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		var createdRoleIds = new List<Guid>();

		try {
			var roleId = await this._CreateTenantRoleWithPermissionsAsync(
				acmeId,
				[AppPermissions.Tenant.Posts.VIEW.Key]
			);
			createdRoleIds.Add(roleId);

			await this._AssignRoleToTenantUserAsync(
				TestConstants.AcmeUserEmail,
				acmeId,
				createdRoleIds
			);

			var acmeUserToken = await this._AuthClient.LoginAsync(
				TestConstants.AcmeUserEmail,
				TestConstants.SeedPassword
			);

			using var request = new HttpRequestMessage(
				HttpMethod.Get,
				TenantPermissionFilterSpec._PostsEndpoint
			)
				.WithSessionToken(acmeUserToken)
				.WithTenantId(acmeId);

			using var response =
				await this._Http.SendAsync(request);

			response.StatusCode.Should().Be(HttpStatusCode.OK);
		} finally {
			await this._CleanupTenantRoleArtifactsAsync(createdRoleIds);
		}
	}

	[Fact]
	public async Task
	ItShouldNotLeakTheFullAccessBypassIntoADifferentTenantForTheSameUser() {
		// Charlie holds the Acme Owner full-access role but is only a non-full-access
		// member in Global Solutions (see UserAccountSeeder cross-tenant fixtures). The
		// bypass earned in Acme must not follow the user into a different tenant scope.
		var staffToken =
			await this._AuthClient.LoginAsStaffAdminAsync();
		var acmeId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				this._Http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);
		var globalId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				this._Http,
				staffToken,
				SeedConstants.Tenants.GlobalName
			);

		var charlieToken = await this._AuthClient.LoginAsync(
			TestConstants.CharlieEmail,
			TestConstants.SeedPassword
		);

		using (var acmeRequest = new HttpRequestMessage(
			HttpMethod.Get,
			TenantPermissionFilterSpec._PostsEndpoint
		)
			.WithSessionToken(charlieToken)
			.WithTenantId(acmeId)) {
			using var acmeResponse =
				await this._Http.SendAsync(acmeRequest);

			// Full access in Acme: bypass applies.
			acmeResponse.StatusCode.Should().Be(HttpStatusCode.OK);
		}

		using (var globalRequest = new HttpRequestMessage(
			HttpMethod.Get,
			TenantPermissionFilterSpec._PostsEndpoint
		)
			.WithSessionToken(charlieToken)
			.WithTenantId(globalId)) {
			using var globalResponse =
				await this._Http.SendAsync(globalRequest);

			// Not full access in Global Solutions, no roles assigned: must be denied.
			globalResponse.StatusCode.Should()
				.Be(HttpStatusCode.Forbidden);

			var problem = await globalResponse.Content
				.ReadFromJsonAsync<AppProblemDetails>();
			problem.Should().NotBeNull();
			Assert.NotNull(problem);
			problem.TranslationKey.Should()
				.Be("user-does-not-have-the-necessary-permissions");
		}
	}

	[Fact]
	public async Task
	ItShouldNotLeakTheTenantFullAccessBypassIntoAStaffScopePermissionCheck() {
		// A tenant full-access member has no staff account at all (staff/tenant scope
		// exclusivity). Hitting a staff-scope permission-gated endpoint must be rejected
		// by StaffAuthFilter before any permission check runs — proving the tenant
		// full-access bypass cannot cross into staff-scope enforcement.
		var acmeAdminToken = await this._AuthClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		var url = PathUtils.Join(
			AppRoutes.Staff.Root,
			AppRoutes.Users.ForStaff.Root,
			AppRoutes.Users.ForStaff.Find
		);

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
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be("not-a-staff-user");
	}

	private async Task<Guid> _CreateTenantRoleWithPermissionsAsync(
		Guid tenantId,
		IEnumerable<string> permissionKeys
	) {
		await using var scope =
			this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var role = Role.CreateTenantRole(
			tenantId,
			"Tenant Permission Filter Spec " + Guid.NewGuid().ToString("N")[..8],
			"Created for TenantPermissionFilter permission assertions"
		);
		role.ValidateRoleType();

		_ = await dbContext.Role.AddAsync(role);
		await dbContext.SaveChangesAsync();

		var roleId = role.GetRequiredId();

		foreach (var permissionKey in permissionKeys) {
			_ = await dbContext.RolePermission.AddAsync(
				new RolePermission {
					RoleId = roleId,
					PermissionKey = permissionKey
				}
			);
		}

		await dbContext.SaveChangesAsync();

		return roleId;
	}

	private async Task _AssignRoleToTenantUserAsync(
		string email,
		Guid tenantId,
		IReadOnlyCollection<Guid> roleIds
	) {
		var trimmedEmail = email.Trim();

		await using var scope =
			this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var tenantUserAccounts = await (
			from ua in dbContext.UserAccount
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

		if (tenantUserAccount is null || tenantUserAccount.Id is null) {
			throw new InvalidOperationException(
				"Expected tenant user account to exist for permission-filter test"
			);
		}

		foreach (var roleId in roleIds) {
			_ = await dbContext.UserAccountRole.AddAsync(
				new UserAccountRole {
					UserAccountId = tenantUserAccount.Id.Value,
					RoleId = roleId
				}
			);
		}

		await dbContext.SaveChangesAsync();
	}

	private async Task _CleanupTenantRoleArtifactsAsync(
		IReadOnlyCollection<Guid> roleIds
	) {
		if (roleIds.Count == 0) {
			return;
		}

		await using var scope =
			this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var roleIdList = roleIds.ToList();

		var linksToRemove = await (
			from uap in dbContext.UserAccountRole
			where roleIdList.Contains(uap.RoleId)
			select uap
		).ToListAsync();

		if (linksToRemove.Count > 0) {
			dbContext.ForceHardDeleteRange(linksToRemove);
		}

		var permissionsToRemove = await (
			from pp in dbContext.RolePermission
			where roleIdList.Contains(pp.RoleId)
			select pp
		).ToListAsync();

		if (permissionsToRemove.Count > 0) {
			dbContext.ForceHardDeleteRange(permissionsToRemove);
		}

		var rolesToRemove = (await (
			from p in dbContext.Role
			select p
		).ToListAsync())
			.Where(role => roleIdList.Contains(role.GetRequiredId()))
			.ToList();

		if (rolesToRemove.Count > 0) {
			dbContext.ForceHardDeleteRange(rolesToRemove);
			await dbContext.SaveChangesAsync();
		}
	}

	private sealed record TenantUserAccountLookup(
		Guid? Id,
		string Email
	);
}
