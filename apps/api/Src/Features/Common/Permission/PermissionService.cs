using MainApi.Src.Data.DbContext;
using MainApi.Src.Features.Common.Profile;
using MainApi.Src.Features.Common.Account;
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
	/// This method works seamlessly with the existing StaffPermissionFilter.
	/// </summary>
	/// <param name="userId">The user ID</param>
	/// <param name="tenantId">Optional tenant ID for tenant-scoped permissions</param>
	/// <returns>HashSet of permission keys</returns>
	public async Task<HashSet<string>> GetEffectivePermissionsAsync(Guid userId, Guid? tenantId = null)
	{
		var permissions = new HashSet<string>();

		// Get staff permissions (always available for staff users)
		var staffPermissions = await GetStaffPermissionsAsync(userId);
		permissions.UnionWith(staffPermissions);

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
	public async Task<HashSet<string>> GetStaffPermissionsAsync(Guid userId)
	{
		return await _context.Set<ProfilePermission>()
			.Join(_context.Set<UserAccountProfile>(),
				pp => pp.ProfileId,
				uap => uap.ProfileId,
				(pp, uap) => new { pp.PermissionKey, uap.AccountId })
			.Join(_context.Set<UserAccount>(),
				joined => joined.AccountId,
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
				(pp, uap) => new { pp.PermissionKey, uap.AccountId })
			.Join(_context.Set<UserAccount>(),
				joined => joined.AccountId,
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

	/// <summary>
	/// Seeds the permissions table with all permission keys from StaffPermissionEnum
	/// </summary>
	public async Task SeedPermissionsAsync()
	{
		// This would be called during application startup or migration
		// to ensure all permission keys from your enum are in the database

		var existingPermissions = await _context.Set<Permission>()
			.Select(p => p.Key)
			.ToHashSetAsync();

		// Add any missing permissions from your StaffPermissionEnum
		// You would implement this based on your actual enum values
		var enumPermissions = GetPermissionKeysFromEnum();

		var missingPermissions = enumPermissions
			.Where(key => !existingPermissions.Contains(key))
			.Select(key => new Permission
			{
				Key = key,
				Description = GetPermissionDescription(key),
				Scope = GetPermissionScope(key)
			});

		if (missingPermissions.Any())
		{
			_context.Set<Permission>().AddRange(missingPermissions);
			await _context.SaveChangesAsync();
		}
	}

	private List<string> GetPermissionKeysFromEnum()
	{
		// TODO: Implement this to return all keys from your StaffPermissionEnum
		// This ensures your database stays in sync with your code
		return new List<string>();
	}

	private string GetPermissionDescription(string key)
	{
		// TODO: Implement this to return human-readable descriptions
		return $"Permission: {key}";
	}

	private PermissionScope GetPermissionScope(string key)
	{
		// TODO: Implement this to determine if a permission is staff, tenant, or both
		// Based on your business logic
		return PermissionScope.Both;
	}
}
