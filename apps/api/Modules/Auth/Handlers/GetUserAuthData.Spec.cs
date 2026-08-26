using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Modules.Profiles.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Auth.Handlers;

/// <summary>
/// Proves GET /auth/user-auth-data carries `tenantPermissionKeys` — the
/// EFFECTIVE tenant permission set (C3 A4): `"*"` for a seeded tenant Admin
/// (the #861 AccountLevel.Admin short-circuit, whose raw profile-derived set
/// is empty), and exactly the assigned profile keys for a non-Admin holder.
///
/// The private profile helpers are copied verbatim from
/// TenantPermissionFilter.Spec.cs — they are private there, so this spec
/// cannot reuse them (issue #1447 follow-up).
/// </summary>
public sealed class GetUserAuthDataSpec : IClassFixture<ApiFixture> {
	private const string UserAuthDataEndpoint = "/auth/user-auth-data";

	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public GetUserAuthDataSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	[Fact]
	public async Task ItShouldExposeWildcardSentinelForSeededTenantAdmin() {
		// Seeded Acme admin holds no profiles by default (the #861 scenario proven
		// in TenantPermissionFilter.Spec.cs): the effective set comes from the
		// AccountLevel.Admin short-circuit, which this endpoint materialises as "*".
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var acmeId = await TenantTestHelper.GetTenantIdByNameAsync(
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
			$"{UserAuthDataEndpoint}?tenant_id={acmeId}"
		)
			.WithSessionToken(acmeAdminToken);
		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var payload = await response.Content.ReadFromJsonAsync<JsonElement>();
		var keys = payload.GetProperty("tenantPermissionKeys")
			.EnumerateArray()
			.Select(k => k.GetString())
			.ToList();

		keys.Should().BeEquivalentTo(["*"]);
	}

	[Fact]
	public async Task ItShouldExposeProfileDerivedKeysWithoutWildcardForNonAdminHolder() {
		var staffToken = await _authClient.LoginAsStaffAdminAsync();
		var acmeId = await TenantTestHelper.GetTenantIdByNameAsync(
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
				$"{UserAuthDataEndpoint}?tenant_id={acmeId}"
			)
				.WithSessionToken(acmeUserToken);
			using var response = await _http.SendAsync(request);

			response.StatusCode.Should().Be(HttpStatusCode.OK);

			var payload = await response.Content.ReadFromJsonAsync<JsonElement>();
			var keys = payload.GetProperty("tenantPermissionKeys")
				.EnumerateArray()
				.Select(k => k.GetString())
				.ToList();

			keys.Should().BeEquivalentTo(["tenant.posts.view"]);
		} finally {
			await CleanupTenantProfileArtifactsAsync(createdProfileIds);
		}
	}

	[Fact]
	public async Task ItShouldExposeEmptyKeysWithoutTenantScope() {
		// The endpoint sits behind session auth only: without ?tenant_id= there
		// is no scope to resolve permissions in, so the payload gates everything
		// closed with an empty array (never null).
		var acmeAdminToken = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(HttpMethod.Get, UserAuthDataEndpoint)
			.WithSessionToken(acmeAdminToken);
		using var response = await _http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var payload = await response.Content.ReadFromJsonAsync<JsonElement>();
		payload.TryGetProperty("tenantPermissionKeys", out var keys).Should().BeTrue();
		keys.ValueKind.Should().Be(JsonValueKind.Array);
		keys.GetArrayLength().Should().Be(0);
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
			"GetUserAuthData Spec " + Guid.NewGuid().ToString("N")[..8],
			"Created for GetUserAuthData permission assertions"
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
				"Expected tenant user account to exist for GetUserAuthData permission test"
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
