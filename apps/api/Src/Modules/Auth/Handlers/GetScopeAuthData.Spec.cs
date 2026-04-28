namespace MainApi.Src.Modules.Auth.Handlers;

using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using MainApi.Src.Data.DbContext;
using MainApi.Src.Data.Seeding;
using MainApi.Src.Lib;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Lib.Routes;
using MainApi.Src.Lib.Testing.Fixtures;
using MainApi.Src.Lib.Testing.Helpers;
using MainApi.Src.Modules.Profiles.Entities;
using MainApi.Src.Modules.Users.Entities;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using Xunit;

public sealed class GetScopeAuthDataSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public GetScopeAuthDataSpec(
		ApiFixture fixture
	) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	[Fact]
	public async Task
	ItShouldReturnOkForActiveTenant() {
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

		var url = $"{Routes.Auth.GetScopeAuthData}"
			+ $"?scope={acmeId}";
		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			url
		).WithSessionToken(acmeAdminToken);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<TenantScopeAuthDataResponse>();
		result.Should().NotBeNull();
		result!.Id.Should().Be(acmeId);
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
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var acmeId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		var profilePermissions = new[] {
			new[] {
				AppPermissions.Tenant.Modules.ACCESS_DASHBOARD.Key,
				AppPermissions.Tenant.Modules.ACCESS_BILLING.Key
			},
			new[] {
				AppPermissions.Tenant.Modules.ACCESS_BILLING.Key,
				AppPermissions.Tenant.Modules.ACCESS_SETTINGS.Key
			}
		};
		var createdProfileIds = new List<Guid>();

		try {
			foreach (var permissions in profilePermissions) {
				createdProfileIds.Add(
					await CreateTenantProfileWithPermissionsAsync(
						acmeId,
						permissions
					)
				);
			}

			await AssignProfileToTenantUserAsync(
				TestConstants.AcmeAdminEmail,
				acmeId,
				createdProfileIds
			);

			var acmeAdminToken = await _authClient.LoginAsync(
				TestConstants.AcmeAdminEmail,
				TestConstants.SeedPassword
			);

			var url = $"{Routes.Auth.GetScopeAuthData}"
				+ $"?scope={acmeId}";
			using var request = new HttpRequestMessage(
				HttpMethod.Get,
				url
			).WithSessionToken(acmeAdminToken);

			using var response =
				await _http.SendAsync(request);

			response.StatusCode.Should().Be(HttpStatusCode.OK);

			var result = await response.Content
				.ReadFromJsonAsync<TenantScopeAuthDataResponse>();
			result.Should().NotBeNull();

			var expectedPermissions = profilePermissions
				.SelectMany(permissions => permissions)
				.Distinct(StringComparer.OrdinalIgnoreCase)
				.ToList();

			result!.Permissions.Should().BeEquivalentTo(expectedPermissions);
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
			await CleanupScopeAuthDataTestArtifactsAsync(createdProfileIds);
		}
	}

	[Fact]
	public async Task
	ItShouldExcludeRevokedDeletedAndWrongScopePermissionsFromTenantScopeAuthData() {
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
			var activeProfileId = await CreateTenantProfileWithPermissionsAsync(
				acmeId,
				new[] { AppPermissions.Tenant.Modules.ACCESS_DASHBOARD.Key }
			);
			var revokedPermissionProfileId = await CreateTenantProfileWithPermissionsAsync(
				acmeId,
				new[] { AppPermissions.Tenant.Modules.ACCESS_USERS.Key }
			);
			var softDeletedLinkProfileId = await CreateTenantProfileWithPermissionsAsync(
				acmeId,
				new[] { AppPermissions.Tenant.Modules.ACCESS_BILLING.Key }
			);
			var wrongScopeProfileId = await CreateTenantProfileWithPermissionsAsync(
				acmeId,
				Array.Empty<string>()
			);

			createdProfileIds.AddRange(
				new[] {
					activeProfileId,
					revokedPermissionProfileId,
					softDeletedLinkProfileId,
					wrongScopeProfileId
				}
			);

			await AssignProfileToTenantUserAsync(
				TestConstants.AcmeAdminEmail,
				acmeId,
				createdProfileIds
			);

			await ConfigureTenantAuthPermissionLeakScenarioAsync(
				tenantId: acmeId,
				email: TestConstants.AcmeAdminEmail,
				revokedPermissionProfileId: revokedPermissionProfileId,
				revokedPermissionKey: AppPermissions.Tenant.Modules.ACCESS_USERS.Key,
				softDeletedLinkProfileId: softDeletedLinkProfileId,
				wrongScopeProfileId: wrongScopeProfileId,
				wrongScopePermissionKey: AppPermissions.Staff.Users.LIST_FOR_STAFF.Key
			);

			var acmeAdminToken = await _authClient.LoginAsync(
				TestConstants.AcmeAdminEmail,
				TestConstants.SeedPassword
			);

			var url = $"{Routes.Auth.GetScopeAuthData}"
				+ $"?scope={acmeId}";
			using var request = new HttpRequestMessage(
				HttpMethod.Get,
				url
			).WithSessionToken(acmeAdminToken);

			using var response =
				await _http.SendAsync(request);

			response.StatusCode.Should().Be(HttpStatusCode.OK);

			var result = await response.Content
				.ReadFromJsonAsync<TenantScopeAuthDataResponse>();
			result.Should().NotBeNull();
			result!.Permissions.Should().BeEquivalentTo(
				new[] { AppPermissions.Tenant.Modules.ACCESS_DASHBOARD.Key }
			);
		} finally {
			await CleanupScopeAuthDataTestArtifactsAsync(createdProfileIds);
		}
	}

	[Fact]
	public async Task
	ItShouldReturnAllAssignedTenantProfilesEvenWhenTheyExceedConfiguredCap() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var acmeId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		var createdProfileIds = new List<Guid>();
		var requestedProfileCount = AppEnvironment.Instance.MAX_PROFILES_PER_USER + 1;

		try {
			for (var index = 0; index < requestedProfileCount; index++) {
				createdProfileIds.Add(
					await CreateTenantProfileWithPermissionsAsync(
						acmeId,
						new[] { AppPermissions.Tenant.Modules.ACCESS_DASHBOARD.Key }
					)
				);
			}

			// Auth data must expose the full effective profile set even if historical data grows
			// past the configurable write-time cap.
			await AssignProfileToTenantUserAsync(
				TestConstants.AcmeAdminEmail,
				acmeId,
				createdProfileIds
			);

			var acmeAdminToken = await _authClient.LoginAsync(
				TestConstants.AcmeAdminEmail,
				TestConstants.SeedPassword
			);

			var url = $"{Routes.Auth.GetScopeAuthData}"
				+ $"?scope={acmeId}";
			using var request = new HttpRequestMessage(
				HttpMethod.Get,
				url
			).WithSessionToken(acmeAdminToken);

			using var response =
				await _http.SendAsync(request);

			response.StatusCode.Should().Be(HttpStatusCode.OK);

			var result = await response.Content
				.ReadFromJsonAsync<TenantScopeAuthDataResponse>();
			result.Should().NotBeNull();
			result!.Profiles.Should().HaveCount(requestedProfileCount);
			result.Profiles.Select(profile => profile.Id)
				.Should()
				.BeEquivalentTo(createdProfileIds);
		} finally {
			await CleanupScopeAuthDataTestArtifactsAsync(createdProfileIds);
		}
	}

	[Fact]
	public async Task
	ItShouldReturnStaffDataForStaffScope() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();

		var url = $"{Routes.Auth.GetScopeAuthData}"
			+ "?scope=staff";
		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			url
		).WithSessionToken(staffToken);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<StaffScopeAuthDataResponse>();
		result.Should().NotBeNull();
		result!.Code.Should().Be("staff");
		result.IsAdmin.Should().BeTrue();
	}

	[Fact]
	public async Task
	ItShouldReturnForbiddenWhenNonStaffAccessesStaffScope() {
		var acmeAdminToken = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		var url = $"{Routes.Auth.GetScopeAuthData}"
			+ "?scope=staff";
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
		problem!.TranslationKey.Should()
			.Be("not-a-staff-user");
	}

	[Fact]
	public async Task
	ItShouldReturnForbiddenForInvalidTenantGuid() {
		var acmeAdminToken = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		var url = $"{Routes.Auth.GetScopeAuthData}"
			+ "?scope=not-a-valid-guid";
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
		problem!.TranslationKey.Should().Be("forbidden");
	}

	[Fact]
	public async Task
	ItShouldReturn403WithKeyForSuspendedTenant() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var acmeId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		// Suspend Acme
		using var suspend =
			await TenantTestHelper.SuspendTenantAsync(
				_http, staffToken, acmeId
			);
		suspend.StatusCode.Should().Be(HttpStatusCode.OK);

		try {
			var acmeAdminToken =
				await _authClient.LoginAsync(
					TestConstants.AcmeAdminEmail,
					TestConstants.SeedPassword
				);

			var url = $"{Routes.Auth.GetScopeAuthData}"
				+ $"?scope={acmeId}";
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
			problem!.TranslationKey.Should()
				.Be("tenant-suspended");
		} finally {
			using var cleanup =
				await TenantTestHelper
					.ReactivateTenantAsync(
						_http, staffToken, acmeId
					);
		}
	}

	[Fact]
	public async Task
	ItShouldReturn403ForNonMember() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var techStartId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.TechStartName
			);

		// Acme admin is NOT a member of TechStart
		var acmeAdminToken = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		var url = $"{Routes.Auth.GetScopeAuthData}"
			+ $"?scope={techStartId}";
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
		// Non-member: generic forbidden, NOT
		// "tenant-suspended"
		problem!.TranslationKey.Should().Be("forbidden");
	}

	[Fact]
	public async Task
	ItShouldReturnOkAfterReactivation() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		var acmeId =
			await TenantTestHelper.GetTenantIdByNameAsync(
				_http,
				staffToken,
				SeedConstants.Tenants.AcmeName
			);

		// Suspend then reactivate
		using var suspend =
			await TenantTestHelper.SuspendTenantAsync(
				_http, staffToken, acmeId
			);
		suspend.StatusCode.Should().Be(HttpStatusCode.OK);

		using var reactivate =
			await TenantTestHelper.ReactivateTenantAsync(
				_http, staffToken, acmeId
			);
		reactivate.StatusCode.Should()
			.Be(HttpStatusCode.OK);

		// Now access should work again
		var acmeAdminToken = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		var url = $"{Routes.Auth.GetScopeAuthData}"
			+ $"?scope={acmeId}";
		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			url
		).WithSessionToken(acmeAdminToken);

		using var response =
			await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
	}

	[Fact]
	public async Task
	ItShouldReturnUnauthorizedForGloballySuspendedUser() {
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

		await SetUserSuspendedByEmailAsync(
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
				await _http.SendAsync(request);

			response.StatusCode.Should()
				.Be(HttpStatusCode.Unauthorized);
		} finally {
			await SetUserSuspendedByEmailAsync(
				TestConstants.AcmeAdminEmail,
				isSuspended: false
			);
		}
	}

	private async Task SetUserSuspendedByEmailAsync(
		string email,
		bool isSuspended
	) {
		var trimmedEmail = email.Trim();

		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<MainApiDbContext>();

		var matchedUser = await (
			from u in dbContext.User
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

		var updatedCount = await dbContext.User
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

	private async Task<Guid> CreateTenantProfileWithPermissionsAsync(
		Guid tenantId,
		IEnumerable<string> permissionKeys
	) {
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<MainApiDbContext>();

		var profile = Profile.CreateTenantProfile(
			tenantId,
			"Tenant Auth Data Spec " + Guid.NewGuid().ToString("N")[..8],
			"Created for tenant auth data permission assertions"
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
			.GetRequiredService<MainApiDbContext>();

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

	private async Task ConfigureTenantAuthPermissionLeakScenarioAsync(
		Guid tenantId,
		string email,
		Guid revokedPermissionProfileId,
		string revokedPermissionKey,
		Guid softDeletedLinkProfileId,
		Guid wrongScopeProfileId,
		string wrongScopePermissionKey
	) {
		var trimmedEmail = email.Trim();

		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<MainApiDbContext>();

		var tenantUserAccounts = await (
			from ua in dbContext.UserAccount
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
			from pp in dbContext.ProfilePermission
			where pp.ProfileId == revokedPermissionProfileId
				&& pp.PermissionKey == revokedPermissionKey
			select pp
		).FirstOrDefaultAsync();

		if (revokedPermission is null) {
			throw new InvalidOperationException(
				"Expected profile permission to exist for auth-data test"
			);
		}

		revokedPermission.IsDeleted = true;
		revokedPermission.DeletedAt = DateTime.UtcNow;
		revokedPermission.UpdatedAt = DateTime.UtcNow;

		var softDeletedLink = await (
			from uap in dbContext.UserAccountProfile
			where uap.ProfileId == softDeletedLinkProfileId
				&& uap.UserAccountId == tenantUserAccount.Id
			select uap
		).FirstOrDefaultAsync();

		if (softDeletedLink is null) {
			throw new InvalidOperationException(
				"Expected user-account profile link to exist for auth-data test"
			);
		}

		softDeletedLink.IsDeleted = true;
		softDeletedLink.DeletedAt = DateTime.UtcNow;
		softDeletedLink.UpdatedAt = DateTime.UtcNow;

		_ = await dbContext.ProfilePermission.AddAsync(
			new ProfilePermission {
				ProfileId = wrongScopeProfileId,
				PermissionKey = wrongScopePermissionKey
			}
		);

		await dbContext.SaveChangesAsync();
	}

	private async Task CleanupScopeAuthDataTestArtifactsAsync(
		IReadOnlyCollection<Guid> profileIds
	) {
		if (profileIds.Count == 0) {
			return;
		}

		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<MainApiDbContext>();

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

	private sealed record UserEmailLookup(
		Guid? Id,
		string Email
	);

	private record TenantScopeAuthDataResponse {
		public Guid Id { get; init; }
		public string Name { get; init; } = string.Empty;
		public string Code { get; init; } = string.Empty;
		public List<AuthProfileResponse> Profiles { get; init; } = [];
		public string AccountLevel { get; init; }
			= string.Empty;
		public bool IsAdmin { get; init; }
		public List<string> Permissions { get; init; } = [];
	}

	private record StaffScopeAuthDataResponse {
		public string Code { get; init; } = string.Empty;
		public List<AuthProfileResponse> Profiles { get; init; } = [];
		public string AccountLevel { get; init; }
			= string.Empty;
		public bool IsAdmin { get; init; }
		public List<string> Permissions { get; init; } = [];
	}

	private record AuthProfileResponse {
		public Guid Id { get; init; }
		public string Name { get; init; } = string.Empty;
		public List<string> Permissions { get; init; } = [];
	}
}
