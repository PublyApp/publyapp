
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
using PublyApp.Api.Modules.Profiles.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

using AppRoutes = PublyApp.Api.Lib.Routes.Routes;

namespace PublyApp.Api.Lib.Filters;

/// <summary>
/// Security proof for #861: a tenant Admin must genuinely bypass the per-permission
/// check (AccountLevel.Admin short-circuit in TenantPermissionFilter), the bypass must
/// not leak into a different tenant, and non-Admin tenant users must still be governed
/// strictly by their profile-derived permissions.
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
	private const string PostsEndpoint = "/posts";

	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public TenantPermissionFilterSpec(
		ApiFixture fixture
	) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	// Creates a bare Acme tenant member with NO profiles at all (round 2: the
	// seeded AcmeUserEmail member gained publishing permissions via
	// demo-publishing-acme, so empty-derived-permission proofs need a fresh one).
	private async Task<(Guid TenantId, string Email)> CreateBareAcmeMemberAsync() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var acmeId = await TenantTestHelper.GetTenantIdByNameAsync(
			_http,
			staffToken,
			SeedConstants.Tenants.AcmeName
		);
		var email = $"perm-filter-{Guid.NewGuid():N}@example.com";

		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
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
			user.GetRequiredId(), acmeId, AccountLevel.User
		);
		account.ValidateAccountType();
		db.UserAccount.Add(account);
		await db.SaveChangesAsync();

		return (acmeId, email);
	}

	[Fact]
	public async Task
	ItShouldAllowTenantAdminWithNoProfilesToAccessPermissionGatedEndpoint() {
		// Acme's seeded Admin account has no profiles assigned by default — this is
		// exactly the #861 scenario: AccountLevel.Admin, Permissions derive to [].
		// Pre-fix (no Admin short-circuit in TenantPermissionFilter), this call fails
		// with 403 "user-does-not-have-the-necessary-permissions" (red-before).
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var acmeId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		var acmeAdminToken = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			PostsEndpoint
		)
			.WithSessionToken(acmeAdminToken)
			.WithTenantId(acmeId);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
	}

	[Fact]
	public async Task
	ItShouldReturn403ForNonAdminTenantUserWithoutRequiredPermission() {
		// Round 2: the seeded Acme member now carries publishing permissions through
		// the demo profile, so this denial pin uses a dedicated profile-less member
		// whose derived permission set is provably empty.
		var (bareTenantId, bareEmail) = await CreateBareAcmeMemberAsync();

		var acmeUserToken = await _authClient.LoginAsync(
			bareEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			PostsEndpoint
		)
			.WithSessionToken(acmeUserToken)
			.WithTenantId(bareTenantId);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Forbidden);

		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should()
			.Be("user-does-not-have-the-necessary-permissions");
	}

	[Fact]
	public async Task
	ItShouldReturn200ForNonAdminTenantUserWithRequiredPermission() {
		// Regression guard: profile-derived permissions must still grant access for
		// non-admin users exactly as before the Admin bypass was introduced.
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var acmeId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		var createdProfileIds = new List<Guid>();

		try {
			var profileId = await CreateTenantProfileWithPermissionsAsync(
				acmeId,
				[AppPermissions.Tenant.Posts.VIEW.Key]
			);
			createdProfileIds.Add(profileId);

			await AssignProfileToTenantUserAsync(
				TestConstants.AcmeUserEmail,
				acmeId,
				createdProfileIds
			);

			var acmeUserToken = await _authClient.LoginAsync(
				TestConstants.AcmeUserEmail,
				TestConstants.SeedPassword
			);

			using var request = new HttpRequestMessage(
				HttpMethod.Get,
				PostsEndpoint
			)
				.WithSessionToken(acmeUserToken)
				.WithTenantId(acmeId);

			using var response =
				await _http.SendAsync(request);

			response.StatusCode.Should().Be(HttpStatusCode.OK);
		} finally {
			await CleanupTenantProfileArtifactsAsync(createdProfileIds);
		}
	}

	[Fact]
	public async Task
	ItShouldNotLeakTheAdminBypassIntoADifferentTenantForTheSameUser() {
		// Charlie is seeded as Admin in Acme but only a non-admin User in Global
		// Solutions (see UserAccountSeeder cross-tenant fixtures). The bypass earned in
		// Acme must not follow the user into a different tenant scope.
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var acmeId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);
		var globalId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.GlobalName
			);

		var charlieToken = await _authClient.LoginAsync(
			TestConstants.CharlieEmail,
			TestConstants.SeedPassword
		);

		using (var acmeRequest = new HttpRequestMessage(
			HttpMethod.Get,
			PostsEndpoint
		)
			.WithSessionToken(charlieToken)
			.WithTenantId(acmeId)) {
			using var acmeResponse =
				await _http.SendAsync(acmeRequest);

			// Admin in Acme: bypass applies.
			acmeResponse.StatusCode.Should().Be(HttpStatusCode.OK);
		}

		using (var globalRequest = new HttpRequestMessage(
			HttpMethod.Get,
			PostsEndpoint
		)
			.WithSessionToken(charlieToken)
			.WithTenantId(globalId)) {
			using var globalResponse =
				await _http.SendAsync(globalRequest);

			// Non-admin in Global Solutions, no profiles assigned: must be denied.
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
	ItShouldNotLeakTheTenantAdminBypassIntoAStaffScopePermissionCheck() {
		// A tenant Admin has no staff account at all (staff/tenant scope exclusivity).
		// Hitting a staff-scope permission-gated endpoint must be rejected by
		// StaffAuthFilter before any permission check runs — proving the tenant Admin
		// bypass cannot cross into staff-scope enforcement.
		var acmeAdminToken = await _authClient.LoginAsync(
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
			await _http.SendAsync(request);

		response.StatusCode.Should()
			.Be(HttpStatusCode.Forbidden);

		var problem = await response.Content
			.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be("not-a-staff-user");
	}

	private async Task<Guid> CreateTenantProfileWithPermissionsAsync(
		Guid tenantId,
		IEnumerable<string> permissionKeys
	) {
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var profile = Profile.CreateTenantProfile(
			tenantId,
			"Tenant Permission Filter Spec " + Guid.NewGuid().ToString("N")[..8],
			"Created for TenantPermissionFilter permission assertions"
		);
		profile.ValidateProfileType();

		_ = await dbContext.Profile.AddAsync(profile);
		await dbContext.SaveChangesAsync();

		var profileId = profile.GetRequiredId();

		foreach (var permissionKey in permissionKeys) {
			_ = await dbContext.ProfilePermission.AddAsync(
				new ProfilePermission {
					ProfileId = profileId,
					PermissionKey = permissionKey
				}
			);
		}

		await dbContext.SaveChangesAsync();

		return profileId;
	}

	private async Task AssignProfileToTenantUserAsync(
		string email,
		Guid tenantId,
		IReadOnlyCollection<Guid> profileIds
	) {
		var trimmedEmail = email.Trim();

		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
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

		foreach (var profileId in profileIds) {
			_ = await dbContext.UserAccountProfile.AddAsync(
				new UserAccountProfile {
					UserAccountId = tenantUserAccount.Id.Value,
					ProfileId = profileId
				}
			);
		}

		await dbContext.SaveChangesAsync();
	}

	private async Task CleanupTenantProfileArtifactsAsync(
		IReadOnlyCollection<Guid> profileIds
	) {
		if (profileIds.Count == 0) {
			return;
		}

		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var profileIdList = profileIds.ToList();

		var linksToRemove = await (
			from uap in dbContext.UserAccountProfile
			where profileIdList.Contains(uap.ProfileId)
			select uap
		).ToListAsync();

		if (linksToRemove.Count > 0) {
			dbContext.ForceHardDeleteRange(linksToRemove);
		}

		var permissionsToRemove = await (
			from pp in dbContext.ProfilePermission
			where profileIdList.Contains(pp.ProfileId)
			select pp
		).ToListAsync();

		if (permissionsToRemove.Count > 0) {
			dbContext.ForceHardDeleteRange(permissionsToRemove);
		}

		var profilesToRemove = (await (
			from p in dbContext.Profile
			select p
		).ToListAsync())
			.Where(profile => profileIdList.Contains(profile.GetRequiredId()))
			.ToList();

		if (profilesToRemove.Count > 0) {
			dbContext.ForceHardDeleteRange(profilesToRemove);
			await dbContext.SaveChangesAsync();
		}
	}

	private sealed record TenantUserAccountLookup(
		Guid? Id,
		string Email
	);
}
