using MainApi.Src.Data.DbContext;
using MainApi.Src.Lib;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace MainApi.Src.Modules.Shared.Profiles;

public interface IProfileService {
	Task<List<ProfileItem>> GetUserProfilesWithPermissionsForTenantAsync(
		Guid userId,
		Guid tenantId,
		int? maxProfilesPerUser = null,
		CancellationToken cancellationToken = default);

	Task<List<ProfileItem>> GetStaffProfilesWithPermissionsAsync(
		Guid userId,
		int? maxProfilesPerUser = null,
		CancellationToken cancellationToken = default
	);
}

public class ProfileService : IProfileService {
	private readonly MainApiDbContext _dbContext;
	private readonly IOptions<AppSettings> _appSettings;
	public ProfileService(MainApiDbContext dbContext, IOptions<AppSettings> appSettings) {
		_dbContext = dbContext;
		_appSettings = appSettings;
	}

	/// <summary>
	/// Gets all profiles assigned to a user for a specific tenant, including their permissions.
	/// This method retrieves profiles that belong to the specified tenant and are associated
	/// with the user through UserAccountProfile relationships.
	/// </summary>
	/// <param name="userId">The ID of the user</param>
	/// <param name="tenantId">The ID of the tenant</param>
	/// <param name="maxProfilesPerUser">Maximum number of profiles to return per user</param>
	/// <param name="cancellationToken">Cancellation token</param>
	/// <returns>List of ProfileItem objects containing profile details and permissions</returns>
	public async Task<List<ProfileItem>> GetUserProfilesWithPermissionsForTenantAsync(
		Guid userId,
		Guid tenantId,
		int? maxProfilesPerUser = null,
		CancellationToken cancellationToken = default
	) {
		var query = from p in _dbContext.Profile
								where p.TenantId == tenantId &&
										p.UserAccountProfiles.Any(uap =>
											uap.UserAccount.UserId == userId &&
											uap.UserAccount.TenantId == tenantId)
								select new ProfileItem {
									Id = p.GetRequiredId(),
									Name = p.Name,
									Permissions =
										(
											from pp in p.ProfilePermissions
											select pp.PermissionKey
										).ToList()
								};

		return await query
			.Take(maxProfilesPerUser ?? _appSettings.Value.MAX_PROFILES_PER_USER)
			.ToListAsync(cancellationToken);


	}

	/// <summary>
	/// Retrieves staff-level profiles assigned to a user with their associated permissions.
	/// This method queries profiles that have a ProfileScope of Staff and are associated
	/// with the user through UserAccountProfile relationships, limited to maxProfilesPerUser.
	/// </summary>
	/// <param name="userId">The ID of the user</param>
	/// <param name="maxProfilesPerUser">Maximum number of staff profiles to return per user</param>
	/// <param name="cancellationToken">Cancellation token for async operation</param>
	/// <returns>List of ProfileItem objects containing staff profile details and their permissions</returns>
	public async Task<List<ProfileItem>> GetStaffProfilesWithPermissionsAsync(
		Guid userId,
		int? maxProfilesPerUser = null,
		CancellationToken cancellationToken = default
	) {
		var query =
			from p in _dbContext.Profile
			where p.Scope == ProfileScope.Staff &&
					p.UserAccountProfiles.Any(uap => uap.UserAccount.UserId == userId)
			select new ProfileItem {
				Id = p.GetRequiredId(),
				Name = p.Name,
				Permissions =
					(
						from pp in p.ProfilePermissions
						select pp.PermissionKey
					).ToList()
			};

		return await query
			.Take(maxProfilesPerUser ?? _appSettings.Value.MAX_PROFILES_PER_USER)
			.ToListAsync(cancellationToken);
	}
}

public class ProfileItem {
	public Guid Id { get; set; }
	public string Name { get; set; } = string.Empty;
	public List<string> Permissions { get; set; } = [];
}
