using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Roles.Entities;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Lib.Testing.Helpers;

/// <summary>
/// Role and permission seeding/cleanup shared by specs that must build a role
/// outside the API. Each method was lifted byte-for-byte from its private copies.
/// </summary>
internal static class RoleTestHelper {
	/// <summary>Hard-deletes role links, permissions and roles for the given ids.</summary>
	public static async Task CleanupTenantRoleArtifactsAsync(
		ApiFixture fixture,
		IReadOnlyCollection<Guid> roleIds
	) {
		if (roleIds.Count == 0) {
			return;
		}

		await using var db = fixture.OpenDb();

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

	/// <summary>Creates a tenant role and its permission rows.</summary>
	public static async Task<Guid> CreateTenantRoleWithPermissionsAsync(
		ApiFixture fixture,
		Guid tenantId,
		IEnumerable<string> permissionKeys
	) {
		await using var db = fixture.OpenDb();

		var role = Role.CreateTenantRole(
			tenantId,
			"Tenant Settings General Spec " + Guid.NewGuid().ToString("N")[..8],
			"Created for tenant settings general permission assertions"
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

	/// <summary>Inserts a user-account/role junction row, including cross-tenant ones.</summary>
	public static async Task CreateCorruptCrossTenantJunctionRowAsync(
		ApiFixture fixture,
		Guid userAccountId,
		Guid roleId
	) {
		await using var db = fixture.OpenDb();

		_ = db.Context.UserAccountRole.Add(new UserAccountRole {
			UserAccountId = userAccountId,
			RoleId = roleId,
		});
		_ = await db.Context.SaveChangesAsync();
	}

	/// <summary>Creates a tenant role with the given name.</summary>
	public static async Task<Guid> SeedTenantRoleWithNameAsync(
		ApiFixture fixture,
		Guid tenantId,
		string name
	) {
		await using var db = fixture.OpenDb();

		var role = Role.CreateTenantRole(tenantId, name, isDefault: false);
		await db.Context.Role.AddAsync(role);
		await db.Context.SaveChangesAsync();

		return role.GetRequiredId();
	}
}
