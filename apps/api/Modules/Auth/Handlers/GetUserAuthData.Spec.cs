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
using PublyApp.Api.Modules.Roles.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Auth.Handlers;

/// <summary>
/// Proves GET /auth/user-auth-data carries `tenantPermissionKeys` — the
/// EFFECTIVE tenant permission set (C3 A4): `"*"` for a tenant member holding
/// the full-access `Owner` role (the #861 full-access bypass, whose raw
/// role-derived set is empty), and exactly the assigned role keys for a
/// member without that role.
///
/// The private role helpers are copied verbatim from
/// TenantPermissionFilter.Spec.cs — they are private there, so this spec
/// cannot reuse them (issue #1447 follow-up).
/// </summary>
public sealed class GetUserAuthDataSpec : IClassFixture<ApiFixture> {
	private const string _UserAuthDataEndpoint = "/auth/user-auth-data";

	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public GetUserAuthDataSpec(ApiFixture fixture) {
		this._Fixture = fixture;
		this._Http = fixture.HttpClient;
		this._AuthClient = new TestAuthClient(this._Http);
	}

	[Fact]
	public async Task ItShouldExposeWildcardSentinelForSeededTenantAdmin() {
		// Seeded Acme admin holds the tenant `Owner` full-access role (the #861
		// scenario proven in TenantPermissionFilter.Spec.cs): the effective set comes
		// from the full-access role, which this endpoint materialises as "*".
		var staffToken = await this._AuthClient.LoginAsStaffAdminAsync();
		var acmeId = await TenantTestHelper.GetTenantIdByNameAsync(
			this._Http,
			staffToken,
			SeedConstants.Tenants.AcmeName
		);

		var acmeAdminToken = await this._AuthClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			$"{GetUserAuthDataSpec._UserAuthDataEndpoint}?tenant_id={acmeId}"
		)
			.WithSessionToken(acmeAdminToken);
		using var response = await this._Http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var payload = await response.Content.ReadFromJsonAsync<JsonElement>();
		var keys = payload.GetProperty("tenantPermissionKeys")
			.EnumerateArray()
			.Select(k => k.GetString())
			.ToList();

		keys.Should().BeEquivalentTo(["*"]);
	}

	[Fact]
	public async Task ItShouldExposeRoleDerivedKeysWithoutWildcardForNonAdminHolder() {
		var staffToken = await this._AuthClient.LoginAsStaffAdminAsync();
		var acmeId = await TenantTestHelper.GetTenantIdByNameAsync(
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
				$"{GetUserAuthDataSpec._UserAuthDataEndpoint}?tenant_id={acmeId}"
			)
				.WithSessionToken(acmeUserToken);
			using var response = await this._Http.SendAsync(request);

			response.StatusCode.Should().Be(HttpStatusCode.OK);

			var payload = await response.Content.ReadFromJsonAsync<JsonElement>();
			var keys = payload.GetProperty("tenantPermissionKeys")
				.EnumerateArray()
				.Select(k => k.GetString())
				.ToList();

			keys.Should().BeEquivalentTo(["tenant.posts.view"]);
		} finally {
			await this._CleanupTenantRoleArtifactsAsync(createdRoleIds);
		}
	}

	[Fact]
	public async Task ItShouldExposeEmptyKeysWithoutTenantScope() {
		// The endpoint sits behind session auth only: without ?tenant_id= there
		// is no scope to resolve permissions in, so the payload gates everything
		// closed with an empty array (never null).
		var acmeAdminToken = await this._AuthClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(HttpMethod.Get, GetUserAuthDataSpec._UserAuthDataEndpoint)
			.WithSessionToken(acmeAdminToken);
		using var response = await this._Http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var payload = await response.Content.ReadFromJsonAsync<JsonElement>();
		payload.TryGetProperty("tenantPermissionKeys", out var keys).Should().BeTrue();
		keys.ValueKind.Should().Be(JsonValueKind.Array);
		keys.GetArrayLength().Should().Be(0);
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
			"GetUserAuthData Spec " + Guid.NewGuid().ToString("N")[..8],
			"Created for GetUserAuthData permission assertions"
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
				"Expected tenant user account to exist for GetUserAuthData permission test"
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
