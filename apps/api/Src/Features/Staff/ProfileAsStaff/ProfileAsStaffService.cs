using MainApi.Src.Data.DbContext;
using MainApi.Src.Features.Common.Profile;
using MainApi.Src.Lib;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace MainApi.Src.Features.Staff.ProfileAsStaff;

public interface IProfileAsStaffService {
	Task<List<Profile>> FindTenantProfilesAsync(
		Guid tenantId,
		int? page = null,
		int? limit = null,
		string? sortId = null,
		SortOrder? sortOrder = null,
		CancellationToken cancellationToken = default
	);
}

public class ProfileAsStaffService : IProfileAsStaffService {
	private readonly MainApiDbContext _dbContext;
	private readonly IOptions<AppSettings> _appSettings;
	public ProfileAsStaffService(MainApiDbContext dbContext, IOptions<AppSettings> appSettings) {
		_dbContext = dbContext;
		_appSettings = appSettings;
	}

	public async Task<List<Profile>> FindTenantProfilesAsync(
		Guid tenantId,
		int? page = null,
		int? limit = null,
		string? sortId = null,
		SortOrder? sortOrder = null,
		CancellationToken cancellationToken = default
	) {
		var effectivePage = page ?? 1;
		var effectiveSortOrder = sortOrder ?? SortOrder.Desc;
		var effectiveLimit = limit ?? _appSettings.Value.PAGINATION_DEFAULT_LIMIT;

		var query =
			from p in _dbContext.Profile
			where p.ProfileScope == ProfileScope.Tenant
			&& p.TenantId == tenantId
			select p;

		return await query
			.Skip((effectivePage - 1) * effectiveLimit)
			.Take(effectiveLimit)
			.ToListAsync(cancellationToken);
	}
}
