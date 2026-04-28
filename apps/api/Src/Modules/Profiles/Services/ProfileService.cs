using MainApi.Src.Data.DbContext;
using MainApi.Src.Lib.DI;
using MainApi.Src.Modules.Permissions.Entities;
using MainApi.Src.Modules.Profiles.Entities;
using MainApi.Src.Modules.Users.Entities;

using Microsoft.EntityFrameworkCore;

namespace MainApi.Src.Modules.Profiles.Services;

public interface IProfileService {
	Task<List<ProfileItem>> GetUserProfilesWithPermissionsForTenantAsync(
		Guid userId,
		Guid tenantId,
		CancellationToken cancellationToken = default);

	Task<List<ProfileItem>> GetStaffProfilesWithPermissionsAsync(
		Guid userId,
		CancellationToken cancellationToken = default
	);
}

[Service(ServiceLifetime.Scoped)]
public class ProfileService : IProfileService {
	private readonly MainApiDbContext _dbContext;
	public ProfileService(MainApiDbContext dbContext) {
		_dbContext = dbContext;
	}

	/// <summary>
	/// Gets all profiles assigned to a user for a specific tenant, including their permissions.
	/// This method retrieves profiles that belong to the specified tenant and are associated
	/// with the user through UserAccountProfile relationships.
	/// </summary>
	/// <param name="userId">The ID of the user</param>
	/// <param name="tenantId">The ID of the tenant</param>
	/// <param name="cancellationToken">Cancellation token</param>
	/// <returns>List of ProfileItem objects containing profile details and permissions</returns>
	public async Task<List<ProfileItem>> GetUserProfilesWithPermissionsForTenantAsync(
		Guid userId,
		Guid tenantId,
		CancellationToken cancellationToken = default
	) {
		// Tenant auth data must only reflect active tenant-profile assignments and active
		// tenant-scoped permissions. Otherwise revoked links or wrong-scope permissions can
		// leak into the effective permission set returned to the frontend.
		//
		// Do not cap this read by MAX_PROFILES_PER_USER. The cap is a write-side business
		// rule; auth data must still reflect the full effective assignment set if historical
		// or inconsistent data already exists.
		var query =
			from p in _dbContext.Profile
			where p.Scope == ProfileScope.Tenant
				&& p.TenantId == tenantId
				&& !p.IsDeleted
				&& p.UserAccountProfiles.Any(uap =>
					!uap.IsDeleted
					&& !uap.UserAccount.IsDeleted
					&& !uap.UserAccount.User.IsDeleted
					&& uap.UserAccount.Scope == AccountScope.Tenant
					&& uap.UserAccount.UserId == userId
					&& uap.UserAccount.TenantId == tenantId
				)
			select new ProfileItem {
				Id = p.GetRequiredId(),
				Name = p.Name,
				Permissions = (
					from pp in p.ProfilePermissions
					where !pp.IsDeleted
						&& !pp.Permission.IsDeleted
						&& pp.Permission.Scope == PermissionScope.Tenant
					select pp.PermissionKey
				).ToList()
			};

		return await query.ToListAsync(cancellationToken);
	}

	/// <summary>
	/// Retrieves staff-level profiles assigned to a user with their associated permissions.
	/// This method queries profiles that have a ProfileScope of Staff and are associated
	/// with the user through UserAccountProfile relationships.
	/// </summary>
	/// <param name="userId">The ID of the user</param>
	/// <param name="cancellationToken">Cancellation token for async operation</param>
	/// <returns>List of ProfileItem objects containing staff profile details and their permissions</returns>
	public async Task<List<ProfileItem>> GetStaffProfilesWithPermissionsAsync(
		Guid userId,
		CancellationToken cancellationToken = default
	) {
		// The same read-side rule applies to staff auth data: return the full effective set,
		// even if historical data temporarily exceeds the configured write-time cap.
		var query =
			from p in _dbContext.Profile
			where p.Scope == ProfileScope.Staff
				&& !p.IsDeleted
				&& p.UserAccountProfiles.Any(uap =>
					!uap.IsDeleted
					&& !uap.UserAccount.IsDeleted
					&& !uap.UserAccount.User.IsDeleted
					&& uap.UserAccount.Scope == AccountScope.Staff
					&& uap.UserAccount.UserId == userId
				)
			select new ProfileItem {
				Id = p.GetRequiredId(),
				Name = p.Name,
				Permissions = (
					from pp in p.ProfilePermissions
					where !pp.IsDeleted
						&& !pp.Permission.IsDeleted
						&& pp.Permission.Scope == PermissionScope.Staff
					select pp.PermissionKey
				).ToList()
			};

		return await query.ToListAsync(cancellationToken);
	}
}

public class ProfileItem {
	public Guid Id { get; set; }
	public string Name { get; set; } = string.Empty;
	public List<string> Permissions { get; set; } = [];
}
