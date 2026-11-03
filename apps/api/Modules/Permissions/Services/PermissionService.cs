using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Modules.Profiles.Entities;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Modules.Permissions.Services;

public interface IPermissionService {
	Task<HashSet<string>> GetEffectivePermissionsAsync(Guid userId, Guid? tenantId = null, Guid? projectId = null);
	Task<HashSet<string>> GetPermissionsAsync(Guid userId);
	Task<HashSet<string>> GetTenantPermissionsAsync(Guid userId, Guid tenantId);
	Task<HashSet<string>> GetPermissionsForProfilesAsync(List<Guid> profileIds);
}

[Service(ServiceLifetime.Scoped)]
public class PermissionService : IPermissionService {
	/// <summary>
	/// Sentinel placed in an EFFECTIVE permission set for a holder of the scope's
	/// full-access system profile. It is never persisted: the full-access profile has
	/// no <c>profile_permissions</c> rows, which keeps "has every right" in one place.
	/// </summary>
	public const string WildcardPermission = "*";

	private readonly AppDbContext _Context;

	public PermissionService(AppDbContext context) {
		this._Context = context;
	}

	/// <summary>
	/// Gets all effective permissions for a user across all their profiles.
	/// This method works seamlessly with the existing PermissionFilter.
	/// Optimized query that uses proper indexing for better performance.
	/// </summary>
	/// <param name="userId">The user ID</param>
	/// <param name="tenantId">Optional tenant ID for tenant-scoped permissions</param>
	/// <param name="projectId">Optional project ID for project-scoped permissions</param>
	/// <returns>HashSet of permission keys</returns>
	public async Task<HashSet<string>> GetEffectivePermissionsAsync(Guid userId, Guid? tenantId = null, Guid? projectId = null) {
		if (await this._HasFullAccessProfileAsync(userId, tenantId, projectId)) {
			return [PermissionService.WildcardPermission];
		}

		// Join tables are active-state only. Do not add IsDeleted filters here:
		// removing a profile or permission assignment physically removes the row.
		var userPermissions = await this._Context.Set<ProfilePermission>()
			.Join(this._Context.Set<UserAccountProfile>(),
				pp => pp.ProfileId,
				uap => uap.ProfileId,
				(pp, uap) => new { pp.PermissionKey, uap.UserAccountId })
			.Join(this._Context.Set<UserAccount>()
				.Where(ua => !ua.IsDeleted && ua.Status != AccountStatus.Suspended),
				joined => joined.UserAccountId,
				ua => ua.Id,
				(joined, ua) => new {
					joined.PermissionKey,
					ua.UserId,
					ua.TenantId,
					ua.ProjectId,
					ua.Scope
				})
			.Where(x => x.UserId == userId)
			// Apply scope filtering if provided
			.Where(x => tenantId == null || x.TenantId == tenantId)
			.Where(x => projectId == null || x.ProjectId == projectId)
			.Select(x => x.PermissionKey)
			.Distinct() // Remove duplicates
			.ToHashSetAsync();

		return userPermissions;
	}

	/// <summary>
	/// Gets staff permissions for a user (from staff profiles)
	/// </summary>
	public async Task<HashSet<string>> GetPermissionsAsync(Guid userId) {
		if (await this._HasFullAccessProfileAsync(userId, tenantId: null, projectId: null, staffScope: true)) {
			return [PermissionService.WildcardPermission];
		}

		// Important: respect soft-deletes on user/account entities. Junction rows are hard
		// deleted when unassigned, so row existence is the active membership state.
		return await this._Context.Set<ProfilePermission>()
			.Join(
				this._Context.Set<UserAccountProfile>(),
				pp => pp.ProfileId,
				uap => uap.ProfileId,
				(pp, uap) => new { pp.PermissionKey, uap.UserAccountId }
			)
			.Join(
				this._Context.Set<UserAccount>()
					.Where(ua =>
						!ua.IsDeleted
						&& ua.Scope == AccountScope.Staff
						&& ua.Status != AccountStatus.Suspended
					),
				joined => joined.UserAccountId,
				ua => ua.Id,
				(joined, ua) => new { joined.PermissionKey, ua.UserId }
			)
			.Where(x => x.UserId == userId)
			.Select(x => x.PermissionKey)
			.Distinct()
			.ToHashSetAsync();
	}

	/// <summary>
	/// Gets tenant permissions for a user in a specific tenant
	/// </summary>
	public async Task<HashSet<string>> GetTenantPermissionsAsync(Guid userId, Guid tenantId) {
		if (await this._HasFullAccessProfileAsync(userId, tenantId, projectId: null)) {
			return [PermissionService.WildcardPermission];
		}

		// Tenant-scoped auth uses the same row-existence contract as staff auth.
		return await this._Context.Set<ProfilePermission>()
			.Join(this._Context.Set<UserAccountProfile>(),
				pp => pp.ProfileId,
				uap => uap.ProfileId,
				(pp, uap) => new { pp.PermissionKey, uap.UserAccountId })
			.Join(this._Context.Set<UserAccount>().Where(ua => !ua.IsDeleted && ua.Status != AccountStatus.Suspended),
				joined => joined.UserAccountId,
				ua => ua.Id,
				(joined, ua) => new { joined.PermissionKey, ua.UserId, ua.TenantId, ua.Scope })
			.Where(x => x.UserId == userId && x.TenantId == tenantId && x.Scope == AccountScope.Tenant)
			.Select(x => x.PermissionKey)
			.Distinct()
			.ToHashSetAsync();
	}

	/// <summary>
	/// Gets project permissions for a user in a specific project
	/// </summary>
	public async Task<HashSet<string>> GetProjectPermissionsAsync(Guid userId, Guid tenantId, Guid projectId) {
		// Project permissions still travel through profile membership, so the two junction
		// tables remain the only active-state filters before account scope checks.
		return await this._Context.Set<ProfilePermission>()
			.Join(this._Context.Set<UserAccountProfile>(),
				pp => pp.ProfileId,
				uap => uap.ProfileId,
				(pp, uap) => new { pp.PermissionKey, uap.UserAccountId })
			.Join(this._Context.Set<UserAccount>().Where(ua => !ua.IsDeleted && ua.Status != AccountStatus.Suspended),
				joined => joined.UserAccountId,
				ua => ua.Id,
				(joined, ua) => new { joined.PermissionKey, ua.UserId, ua.TenantId, ua.ProjectId, ua.Scope })
			.Where(x => x.UserId == userId && x.TenantId == tenantId && x.ProjectId == projectId && x.Scope == AccountScope.Project)
			.Select(x => x.PermissionKey)
			.Distinct()
			.ToHashSetAsync();
	}

	/// <summary>
	/// Gets permissions for specific profile IDs (backward compatibility with existing filter)
	/// </summary>
	public async Task<HashSet<string>> GetPermissionsForProfilesAsync(List<Guid> profileIds) {
		var hasFullAccessProfile = await this._Context.Set<Profile>()
			.Where(p => p.Id != null && profileIds.Contains(p.Id.Value) && p.IsFullAccess && !p.IsDeleted)
			.AnyAsync();
		if (hasFullAccessProfile) {
			return [PermissionService.WildcardPermission];
		}

		// A missing ProfilePermission row is the only revoked state for a profile permission.
		return await this._Context.Set<ProfilePermission>()
			.Where(pp => profileIds.Contains(pp.ProfileId))
			.Select(pp => pp.PermissionKey)
			.Distinct()
			.ToHashSetAsync();
	}

	private async Task<bool> _HasFullAccessProfileAsync(
		Guid userId,
		Guid? tenantId,
		Guid? projectId,
		bool staffScope = false
	) {
		// Same liveness contract as every effective-permission read: the junction row means
		// "assigned", while the account and profile must be live and the account active.
		var query =
			from uap in this._Context.Set<UserAccountProfile>()
			join ua in this._Context.Set<UserAccount>() on uap.UserAccountId equals ua.Id
			join p in this._Context.Set<Profile>() on uap.ProfileId equals p.Id
			where ua.UserId == userId
				&& !ua.IsDeleted
				&& ua.Status != AccountStatus.Suspended
				&& !p.IsDeleted
				&& p.IsFullAccess
			select new { ua.TenantId, ua.ProjectId, ua.Scope };

		if (staffScope) {
			query = query.Where(x => x.Scope == AccountScope.Staff);
		} else if (tenantId is not null && projectId is null) {
			query = query.Where(x => x.Scope == AccountScope.Tenant && x.TenantId == tenantId);
		} else if (tenantId is not null && projectId is not null) {
			query = query.Where(x =>
				x.Scope == AccountScope.Project
				&& x.TenantId == tenantId
				&& x.ProjectId == projectId
			);
		}

		return await query.AnyAsync();
	}
}
