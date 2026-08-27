
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
using PublyApp.Api.Modules.Profiles.Entities;
using PublyApp.Api.Modules.Tenants.Services;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Settings.Handlers.Tenant;

// Reads the shared seeded Acme tenant and (in one test) temporarily assigns a
// profile to its seeded non-admin user; joins the DisableParallelization
// collection so it never races the classes that touch Acme
// (TenantAuthFilterSpec, UpdateTenantAsStaffSpec, ...).
[Collection("AcmeTenantMutation")]
public sealed class GetTenantSettingsForTenantSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public GetTenantSettingsForTenantSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	private static string GetUrl() {
		return PathUtils.Join(
			Routes.Tenant.Root,
			Routes.Settings.ForTenant.Root,
			Routes.Settings.ForTenant.General
		);
	}

	[Fact]
	public async Task
	ItShouldReturnTheGeneralSettingsForAnAdmin() {
		var (acmeId, acmeAdminToken) =
			await LoginAsAcmeAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl()
		)
			.WithSessionToken(acmeAdminToken)
			.WithTenantId(acmeId);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);
		var result = await response.Content
			.ReadFromJsonAsync<TenantSettingsGeneralResult>();
		result.Should().NotBeNull();
		Assert.NotNull(result);

		var persisted = await GetTenantRowAsync(acmeId);
		result.Id.Should().Be(acmeId);
		result.Code.Should().Be(persisted.Code);
		result.Name.Should().Be(persisted.Name);
		result.LogoUrl.Should().Be(persisted.LogoUrl);
		result.LegalName.Should().Be(persisted.LegalName);
		result.Description.Should().Be(persisted.Description);
		result.WebsiteUrl.Should().Be(persisted.WebsiteUrl);
		result.BillingEmail.Should().Be(persisted.BillingEmail);
		result.SupportEmail.Should().Be(persisted.SupportEmail);
		result.DefaultLocale.Should().Be(persisted.DefaultLocale);
		result.Timezone.Should().Be(persisted.Timezone);
	}

	[Fact]
	public async Task
	ItShouldReturnForbiddenForANonAdminTenantUserWithoutSettingsView() {
		var acmeId = await GetAcmeIdAsync();
		// Round 2: the seeded Acme member holds publishing permissions via the demo
		// profile, but nothing grants settings.* here, so the check must still deny.
		var acmeUserToken = await _authClient.LoginAsync(
			TestConstants.AcmeUserEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetUrl()
		)
			.WithSessionToken(acmeUserToken)
			.WithTenantId(acmeId);

		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task
	ItShouldAllowANonAdminTenantUserWithSettingsView() {
		var acmeId = await GetAcmeIdAsync();
		var createdProfileIds = new List<Guid>();

		try {
			var profileId = await CreateTenantProfileWithPermissionsAsync(
				acmeId,
				[AppPermissions.Tenant.Settings.VIEW.Key]
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
				GetUrl()
			)
				.WithSessionToken(acmeUserToken)
				.WithTenantId(acmeId);

			using var response = await _http.SendAsync(request);

			response.StatusCode.Should().Be(HttpStatusCode.OK);
		} finally {
			await CleanupTenantProfileArtifactsAsync(createdProfileIds);
		}
	}

	// The TenantAuthFilter (same membership predicate) already answers 403 for
	// anyone without an active tenant account, so the handler's NotFound branch
	// is only reachable if the tenant vanishes between the filter and the
	// handler. The service seam is where that contract lives — a null result
	// (missing or suspended tenant, via TenantService.GetTenantByIdAsync's
	// IsTenantActive filter) must map to NotFound in the handler.
	[Fact]
	public async Task
	ItShouldReturnNullWhenTheTenantIsMissingOrSuspended() {
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var service = scope.ServiceProvider
			.GetRequiredService<ITenantService>();

		var result = await service.GetTenantByIdAsync(
			Guid.NewGuid()
		);

		result.Should().BeNull();
	}

	private async Task<(Guid TenantId, string Token)>
	LoginAsAcmeAdminAsync() {
		var tenantId = await GetAcmeIdAsync();
		var token = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		return (tenantId, token);
	}

	private async Task<Guid> GetAcmeIdAsync() {
		var staffToken =
			await _authClient.LoginAsStaffAdminAsync();
		return await TenantTestHelper.GetTenantIdByNameAsync(
			_http,
			staffToken,
			SeedConstants.Tenants.AcmeName
		);
	}

	private async Task<TenantRow> GetTenantRowAsync(Guid tenantId) {
		await using var scope =
			_fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		return await dbContext.Tenant
			.AsNoTracking()
			.Where(tenant => tenant.Id == tenantId)
			.Select(tenant => new TenantRow(
				tenant.Code,
				tenant.Name,
				tenant.LogoUrl,
				tenant.LegalName,
				tenant.Description,
				tenant.WebsiteUrl,
				tenant.BillingEmail,
				tenant.SupportEmail,
				tenant.DefaultLocale,
				tenant.Timezone
			))
			.SingleAsync();
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
			"Tenant Settings General Spec " + Guid.NewGuid().ToString("N")[..8],
			"Created for tenant settings general permission assertions"
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
				"Expected tenant user account to exist for settings spec"
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

	private sealed record TenantRow(
		string Code,
		string Name,
		string? LogoUrl,
		string? LegalName,
		string? Description,
		string? WebsiteUrl,
		string? BillingEmail,
		string? SupportEmail,
		string? DefaultLocale,
		string? Timezone
	);
}
