using MainApi.Src.Data.DbContext;
using MainApi.Src.Features.Common.Permission;
using MainApi.Src.Features.Common.Profile;
using Microsoft.EntityFrameworkCore;

namespace MainApi.Src.Lib.Filters;

/// <summary>
/// Updated StaffPermissionFilter that works with the new relational permission system.
/// This maintains backward compatibility with the existing filter interface.
/// </summary>
public class StaffPermissionFilterV2
{
	private readonly MainApiDbContext _context;
	private readonly PermissionService _permissionService;

	public StaffPermissionFilterV2(MainApiDbContext context, PermissionService permissionService)
	{
		_context = context;
		_permissionService = permissionService;
	}

	/// <summary>
	/// Gets effective permissions for a user - works exactly like the original filter
	/// but uses the new relational schema
	/// </summary>
	public async Task<HashSet<string>> GetUserPermissionsAsync(Guid userId, Guid? tenantId = null)
	{
		// Use the new permission service
		return await _permissionService.GetEffectivePermissionsAsync(userId, tenantId);
	}

	/// <summary>
	/// Gets permissions for specific profile IDs - backward compatibility method
	/// </summary>
	public async Task<HashSet<string>> GetPermissionsForProfilesAsync(List<Guid> profileIds)
	{
		return await _permissionService.GetPermissionsForProfilesAsync(profileIds);
	}

	/// <summary>
	/// Checks if a user has a specific permission
	/// </summary>
	public async Task<bool> HasPermissionAsync(Guid userId, string permissionKey, Guid? tenantId = null)
	{
		var permissions = await GetUserPermissionsAsync(userId, tenantId);
		return permissions.Contains(permissionKey);
	}

	/// <summary>
	/// Checks if a user has any of the specified permissions
	/// </summary>
	public async Task<bool> HasAnyPermissionAsync(Guid userId, List<string> permissionKeys, Guid? tenantId = null)
	{
		var permissions = await GetUserPermissionsAsync(userId, tenantId);
		return permissionKeys.Any(key => permissions.Contains(key));
	}

	/// <summary>
	/// Checks if a user has all of the specified permissions
	/// </summary>
	public async Task<bool> HasAllPermissionsAsync(Guid userId, List<string> permissionKeys, Guid? tenantId = null)
	{
		var permissions = await GetUserPermissionsAsync(userId, tenantId);
		return permissionKeys.All(key => permissions.Contains(key));
	}
}
