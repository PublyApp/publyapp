using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Modules.Roles.Entities;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Lib.Testing.Helpers;

/// <summary>
/// Seeds the scope's full-access system role exactly like production does: full access
/// is a role assignment, never a flag on the account. Specs that used to say
/// "an admin account" now say "this account holds the full-access role".
/// </summary>
internal static class FullAccessRoleTestHelper {
	/// <summary>The staff-scope full-access role, created on first use.</summary>
	public static async Task<Guid> EnsureStaffRoleAsync(
		AppDbContext dbContext,
		CancellationToken cancellationToken = default
	) {
		var existing = await (
			from p in dbContext.Role
			where p.Scope == RoleScope.Staff
				&& p.Name == SystemRoleNames.StaffFullAccess
				&& !p.IsDeleted
			select p.Id
		).FirstOrDefaultAsync(cancellationToken);

		if (existing is Guid existingId) {
			return existingId;
		}

		var role = Role.CreateStaffRole(
			SystemRoleNames.StaffFullAccess,
			"Platform owner with full system access",
			isFullAccess: true
		);
		await dbContext.Role.AddAsync(role, cancellationToken);
		await dbContext.SaveChangesAsync(cancellationToken);
		return role.GetRequiredId();
	}

	/// <summary>The tenant-scope full-access role for <paramref name="tenantId"/>, created on first use.</summary>
	public static async Task<Guid> EnsureTenantRoleAsync(
		AppDbContext dbContext,
		Guid tenantId,
		CancellationToken cancellationToken = default
	) {
		var existing = await (
			from p in dbContext.Role
			where p.Scope == RoleScope.Tenant
				&& p.TenantId == tenantId
				&& p.Name == SystemRoleNames.TenantFullAccess
				&& !p.IsDeleted
			select p.Id
		).FirstOrDefaultAsync(cancellationToken);

		if (existing is Guid existingId) {
			return existingId;
		}

		var role = Role.CreateTenantRole(
			tenantId,
			SystemRoleNames.TenantFullAccess,
			"Organization owner with full access",
			isFullAccess: true
		);
		await dbContext.Role.AddAsync(role, cancellationToken);
		await dbContext.SaveChangesAsync(cancellationToken);
		return role.GetRequiredId();
	}

	/// <summary>Grants <paramref name="roleId"/> to the account; idempotent.</summary>
	public static async Task AssignAsync(
		AppDbContext dbContext,
		Guid userAccountId,
		Guid roleId,
		CancellationToken cancellationToken = default
	) {
		var exists = await dbContext.UserAccountRole.AnyAsync(
			uap => uap.UserAccountId == userAccountId && uap.RoleId == roleId,
			cancellationToken
		);
		if (exists) {
			return;
		}

		await dbContext.UserAccountRole.AddAsync(new UserAccountRole {
			UserAccountId = userAccountId,
			RoleId = roleId,
		}, cancellationToken);
		await dbContext.SaveChangesAsync(cancellationToken);
	}

	/// <summary>Makes a tenant member full-access (what "Admin" used to mean).</summary>
	public static async Task MakeTenantFullAccessAsync(
		AppDbContext dbContext,
		Guid tenantId,
		Guid userAccountId,
		CancellationToken cancellationToken = default
	) {
		var roleId = await FullAccessRoleTestHelper.EnsureTenantRoleAsync(
			dbContext, tenantId, cancellationToken
		);
		await FullAccessRoleTestHelper.AssignAsync(
			dbContext, userAccountId, roleId, cancellationToken
		);
	}
}
