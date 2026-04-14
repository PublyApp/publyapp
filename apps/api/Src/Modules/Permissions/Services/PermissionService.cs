using MainApi.Src.Data.DbContext;
using MainApi.Src.Modules.Profiles.Entities;
using MainApi.Src.Modules.Users.Entities;

using Microsoft.EntityFrameworkCore;

namespace MainApi.Src.Modules.Permissions.Services;

public interface IPermissionService {
	Task<HashSet<string>> GetEffectivePermissionsAsync(Guid userId, Guid? tenantId = null, Guid? projectId = null);
	Task<HashSet<string>> GetPermissionsAsync(Guid userId);
	Task<HashSet<string>> GetPermissionsForProfilesAsync(List<Guid> profileIds);
}

public class PermissionService : IPermissionService {
	private readonly MainApiDbContext _context;

	public PermissionService(MainApiDbContext context) {
		_context = context;
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
		// Optimized query using proper indexing
		// This query leverages the new composite indexes for better performance
		var userPermissions = await _context.Set<ProfilePermission>()
			.Where(pp => !pp.IsDeleted)
			.Join(_context.Set<UserAccountProfile>()
				.Where(uap => !uap.IsDeleted),
				pp => pp.ProfileId,
				uap => uap.ProfileId,
				(pp, uap) => new { pp.PermissionKey, uap.UserAccountId })
			.Join(_context.Set<UserAccount>()
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
		// Important: respect soft-deletes on all involved entities.
		// Otherwise, "unassigned" profiles (soft-deleted UserAccountProfile rows) would still grant permissions.
		return await _context.Set<ProfilePermission>()
			.Where(pp => !pp.IsDeleted)
			.Join(
				_context.Set<UserAccountProfile>().Where(uap => !uap.IsDeleted),
				pp => pp.ProfileId,
				uap => uap.ProfileId,
				(pp, uap) => new { pp.PermissionKey, uap.UserAccountId }
			)
			.Join(
				_context.Set<UserAccount>()
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
		return await _context.Set<ProfilePermission>()
			.Where(pp => !pp.IsDeleted)
			.Join(_context.Set<UserAccountProfile>().Where(uap => !uap.IsDeleted),
				pp => pp.ProfileId,
				uap => uap.ProfileId,
				(pp, uap) => new { pp.PermissionKey, uap.UserAccountId })
			.Join(_context.Set<UserAccount>().Where(ua => !ua.IsDeleted && ua.Status != AccountStatus.Suspended),
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
		return await _context.Set<ProfilePermission>()
			.Where(pp => !pp.IsDeleted)
			.Join(_context.Set<UserAccountProfile>().Where(uap => !uap.IsDeleted),
				pp => pp.ProfileId,
				uap => uap.ProfileId,
				(pp, uap) => new { pp.PermissionKey, uap.UserAccountId })
			.Join(_context.Set<UserAccount>().Where(ua => !ua.IsDeleted && ua.Status != AccountStatus.Suspended),
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
		return await _context.Set<ProfilePermission>()
			.Where(pp => !pp.IsDeleted && profileIds.Contains(pp.ProfileId))
			.Select(pp => pp.PermissionKey)
			.Distinct()
			.ToHashSetAsync();
	}
}
