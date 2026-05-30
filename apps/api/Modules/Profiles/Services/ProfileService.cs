using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Modules.Permissions.Entities;
using PublyApp.Api.Modules.Profiles.Entities;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Modules.Profiles.Services;

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
	private readonly AppDbContext _dbContext;
	public ProfileService(AppDbContext dbContext) {
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
		// Tenant auth data must only reflect current tenant-profile assignments and active
		// tenant-scoped permissions. Revoked assignments have no junction row, while deleted
		// users/accounts/profiles still need explicit filters.
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
					!uap.UserAccount.IsDeleted
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
					where !pp.Permission.IsDeleted
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
		// The same read-side rule applies to staff auth data: row existence means assigned,
		// and the write-time MAX_PROFILES_PER_USER cap must not hide existing permissions.
		var query =
			from p in _dbContext.Profile
			where p.Scope == ProfileScope.Staff
				&& !p.IsDeleted
				&& p.UserAccountProfiles.Any(uap =>
					!uap.UserAccount.IsDeleted
					&& !uap.UserAccount.User.IsDeleted
					&& uap.UserAccount.Scope == AccountScope.Staff
					&& uap.UserAccount.UserId == userId
				)
			select new ProfileItem {
				Id = p.GetRequiredId(),
				Name = p.Name,
				Permissions = (
					from pp in p.ProfilePermissions
					where !pp.Permission.IsDeleted
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
