using MainApi.Src.Data.DbContext;
using Microsoft.EntityFrameworkCore;

namespace MainApi.Src.Features.Common.Profile;

public interface IProfileService {
	Task<List<ProfileItem>> GetUserProfilesWithPermissionsForTenantAsync(
		Guid userId,
		Guid tenantId,
		int maxProfilesPerUser,
		CancellationToken cancellationToken = default);
}

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
	/// <param name="maxProfilesPerUser">Maximum number of profiles to return per user</param>
	/// <param name="cancellationToken">Cancellation token</param>
	/// <returns>List of ProfileItem objects containing profile details and permissions</returns>
	public async Task<List<ProfileItem>> GetUserProfilesWithPermissionsForTenantAsync(
		Guid userId,
		Guid tenantId,
		int maxProfilesPerUser,
		CancellationToken cancellationToken = default) {

		return await _dbContext.Profile
			.Where(p => p.TenantId == tenantId &&
				p.UserAccountProfiles.Any(uap =>
					uap.UserAccount.UserId == userId &&
					uap.UserAccount.TenantId == tenantId))
			.Select(p => new ProfileItem {
				Id = p.Id,
				Name = p.Name,
				Permissions = p.ProfilePermissions
					.Select(pp => pp.PermissionKey)
					.ToList()
			})
			.Take(maxProfilesPerUser)
			.ToListAsync(cancellationToken)
			.ConfigureAwait(false);
	}
}

public class ProfileItem {
	public Guid Id { get; set; }
	public string Name { get; set; } = string.Empty;
	public List<string> Permissions { get; set; } = [];
}
