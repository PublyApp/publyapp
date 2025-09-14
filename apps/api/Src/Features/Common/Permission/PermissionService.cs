using MainApi.Src.Data.DbContext;
using MainApi.Src.Features.Common.Profile;
using MainApi.Src.Features.Common.Account;
using MainApi.Src.Lib.Filters;
using Microsoft.EntityFrameworkCore;

namespace MainApi.Src.Features.Common.Permission;

public class PermissionService
{
	private readonly MainApiDbContext _context;

	public PermissionService(MainApiDbContext context)
	{
		_context = context;
	}

	/// <summary>
	/// Gets all effective permissions for a user across all their profiles.
	/// This method works seamlessly with the existing PermissionFilter.
	/// </summary>
	/// <param name="userId">The user ID</param>
	/// <param name="tenantId">Optional tenant ID for tenant-scoped permissions</param>
	/// <returns>HashSet of permission keys</returns>
	public async Task<HashSet<string>> GetEffectivePermissionsAsync(Guid userId, Guid? tenantId = null)
	{
		var permissions = new HashSet<string>();

		// Get staff permissions (always available for staff users)
		var Permissions = await GetPermissionsAsync(userId);
		permissions.UnionWith(Permissions);

		// Get tenant permissions (if in tenant context)
		if (tenantId.HasValue)
		{
			var tenantPermissions = await GetTenantPermissionsAsync(userId, tenantId.Value);
			permissions.UnionWith(tenantPermissions);
		}

		return permissions;
	}

	/// <summary>
	/// Gets staff permissions for a user (from staff profiles)
	/// </summary>
	public async Task<HashSet<string>> GetPermissionsAsync(Guid userId)
	{
		return await _context.Set<ProfilePermission>()
			.Join(_context.Set<UserAccountProfile>(),
				pp => pp.ProfileId,
				uap => uap.ProfileId,
				(pp, uap) => new { pp.PermissionKey, uap.UserAccountId })
			.Join(_context.Set<UserAccount>(),
				joined => joined.UserAccountId,
				ua => ua.Id,
				(joined, ua) => new { joined.PermissionKey, ua.UserId, ua.AccountType })
			.Where(x => x.UserId == userId && x.AccountType == AccountType.Staff)
			.Select(x => x.PermissionKey)
			.ToHashSetAsync();
	}

	/// <summary>
	/// Gets tenant permissions for a user in a specific tenant
	/// </summary>
	private async Task<HashSet<string>> GetTenantPermissionsAsync(Guid userId, Guid tenantId)
	{
		return await _context.Set<ProfilePermission>()
			.Join(_context.Set<UserAccountProfile>(),
				pp => pp.ProfileId,
				uap => uap.ProfileId,
				(pp, uap) => new { pp.PermissionKey, uap.UserAccountId })
			.Join(_context.Set<UserAccount>(),
				joined => joined.UserAccountId,
				ua => ua.Id,
				(joined, ua) => new { joined.PermissionKey, ua.UserId, ua.TenantId, ua.AccountType })
			.Where(x => x.UserId == userId && x.TenantId == tenantId && x.AccountType == AccountType.Tenant)
			.Select(x => x.PermissionKey)
			.ToHashSetAsync();
	}

	/// <summary>
	/// Gets permissions for specific profile IDs (backward compatibility with existing filter)
	/// </summary>
	public async Task<HashSet<string>> GetPermissionsForProfilesAsync(List<Guid> profileIds)
	{
		return await _context.Set<ProfilePermission>()
			.Where(pp => profileIds.Contains(pp.ProfileId))
			.Select(pp => pp.PermissionKey)
			.ToHashSetAsync();
	}
}
