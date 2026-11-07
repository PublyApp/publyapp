using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Modules.Permissions.Entities;
using PublyApp.Api.Modules.Roles.Entities;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Modules.Roles.Services;

public interface IRoleService {
	Task<List<RoleItem>> GetUserRolesWithPermissionsForTenantAsync(
		Guid userId,
		Guid tenantId,
		CancellationToken cancellationToken = default);

	Task<List<RoleItem>> GetStaffRolesWithPermissionsAsync(
		Guid userId,
		CancellationToken cancellationToken = default
	);
}

[Service(ServiceLifetime.Scoped)]
public class RoleService : IRoleService {
	private readonly AppDbContext _DbContext;
	public RoleService(AppDbContext dbContext) {
		this._DbContext = dbContext;
	}

	/// <summary>
	/// Gets all roles assigned to a user for a specific tenant, including their permissions.
	/// This method retrieves roles that belong to the specified tenant and are associated
	/// with the user through UserAccountRole relationships.
	/// </summary>
	/// <param name="userId">The ID of the user</param>
	/// <param name="tenantId">The ID of the tenant</param>
	/// <param name="cancellationToken">Cancellation token</param>
	/// <returns>List of RoleItem objects containing role details and permissions</returns>
	public async Task<List<RoleItem>> GetUserRolesWithPermissionsForTenantAsync(
		Guid userId,
		Guid tenantId,
		CancellationToken cancellationToken = default
	) {
		// Tenant auth data must only reflect current tenant-role assignments and active
		// tenant-scoped permissions. Revoked assignments have no junction row, while deleted
		// users/accounts/roles still need explicit filters.
		//
		// Do not cap this read by MAX_ROLES_PER_USER. The cap is a write-side business
		// rule; auth data must still reflect the full effective assignment set if historical
		// or inconsistent data already exists.
		var query =
			from p in this._DbContext.Role
			where p.Scope == RoleScope.Tenant
				&& p.TenantId == tenantId
				&& !p.IsDeleted
				&& p.UserAccountRoles.Any(uap =>
					!uap.UserAccount.IsDeleted
					&& !uap.UserAccount.User.IsDeleted
					&& uap.UserAccount.Scope == AccountScope.Tenant
					&& uap.UserAccount.UserId == userId
					&& uap.UserAccount.TenantId == tenantId
				)
			select new RoleItem {
				Id = p.GetRequiredId(),
				Name = p.Name,
				IsFullAccess = p.IsFullAccess,
				Permissions = (
					from pp in p.RolePermissions
					where !pp.Permission.IsDeleted
						&& pp.Permission.Scope == PermissionScope.Tenant
					select pp.PermissionKey
				).ToList()
			};

		var items = await query.ToListAsync(cancellationToken);
		return items
			.Select(item => item.IsFullAccess
				? new RoleItem {
					Id = item.Id,
					Name = item.Name,
					IsFullAccess = true,
					Permissions = ["*"],
				}
				: item)
			.ToList();
	}

	/// <summary>
	/// Retrieves staff-level roles assigned to a user with their associated permissions.
	/// This method queries roles that have a RoleScope of Staff and are associated
	/// with the user through UserAccountRole relationships.
	/// </summary>
	/// <param name="userId">The ID of the user</param>
	/// <param name="cancellationToken">Cancellation token for async operation</param>
	/// <returns>List of RoleItem objects containing staff role details and their permissions</returns>
	public async Task<List<RoleItem>> GetStaffRolesWithPermissionsAsync(
		Guid userId,
		CancellationToken cancellationToken = default
	) {
		// The same read-side rule applies to staff auth data: row existence means assigned,
		// and the write-time MAX_ROLES_PER_USER cap must not hide existing permissions.
		var query =
			from p in this._DbContext.Role
			where p.Scope == RoleScope.Staff
				&& !p.IsDeleted
				&& p.UserAccountRoles.Any(uap =>
					!uap.UserAccount.IsDeleted
					&& !uap.UserAccount.User.IsDeleted
					&& uap.UserAccount.Scope == AccountScope.Staff
					&& uap.UserAccount.UserId == userId
				)
			select new RoleItem {
				Id = p.GetRequiredId(),
				Name = p.Name,
				IsFullAccess = p.IsFullAccess,
				Permissions = (
					from pp in p.RolePermissions
					where !pp.Permission.IsDeleted
						&& pp.Permission.Scope == PermissionScope.Staff
					select pp.PermissionKey
				).ToList()
			};

		var items = await query.ToListAsync(cancellationToken);
		return items
			.Select(item => item.IsFullAccess
				? new RoleItem {
					Id = item.Id,
					Name = item.Name,
					IsFullAccess = true,
					Permissions = ["*"],
				}
				: item)
			.ToList();
	}
}

public class RoleItem {
	public Guid Id { get; set; }
	public string Name { get; set; } = string.Empty;
	public bool IsFullAccess { get; set; }
	public List<string> Permissions { get; set; } = [];
}
