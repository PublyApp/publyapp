using MainApi.Src.Data.DbContext;
using MainApi.Src.Lib;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using CommonTenantNs = MainApi.Src.Features.Common.Tenant;

namespace MainApi.Src.Features.Staff.TenantAsStaff;

public interface ITenantAsStaffService {
	Task<CommonTenantNs.Tenant> CreateTenant(CommonTenantNs.Tenant tenant, CancellationToken cancellationToken = default);
	Task<CommonTenantNs.Tenant?> GetTenantAsync(Guid tenantId, CancellationToken cancellationToken = default);
	Task<List<CommonTenantNs.Tenant>> FindTenantsAsync(
		int? page = null,
		int? limit = null,
		string? sortId = null,
		SortOrder? sortOrder = null,
		CancellationToken cancellationToken = default
	);
	Task<int> CountTenantsAsync(CancellationToken cancellationToken = default);
}

public class TenantAsStaffService : ITenantAsStaffService {
	private readonly MainApiDbContext _dbContext;
	private readonly IOptions<AppSettings> _appSettings;

	public TenantAsStaffService(MainApiDbContext dbContext, IOptions<AppSettings> appSettings) {
		_dbContext = dbContext;
		_appSettings = appSettings;
	}

	public async Task<CommonTenantNs.Tenant> CreateTenant(CommonTenantNs.Tenant tenant, CancellationToken cancellationToken = default) {
		var result = await _dbContext.Tenant.AddAsync(tenant, cancellationToken);
		await _dbContext.SaveChangesAsync(cancellationToken);
		return result.Entity;
	}

	public async Task<CommonTenantNs.Tenant?> GetTenantAsync(Guid tenantId, CancellationToken cancellationToken = default) {
		var query =
			from tenant in _dbContext.Tenant
			where tenant.Id == tenantId
			select tenant;
		return await query.FirstOrDefaultAsync(cancellationToken).ConfigureAwait(false);
	}

	public async Task<List<CommonTenantNs.Tenant>> FindTenantsAsync(
		int? page = null,
		int? limit = null,
		string? sortId = null,
		SortOrder? sortOrder = null,
		CancellationToken cancellationToken = default
	) {
		var effectiveLimit = limit ?? _appSettings.Value.PAGINATION_DEFAULT_LIMIT;
		var effectivePage = page ?? 1;
		var effectiveSortOrder = sortOrder ?? SortOrder.Desc;

		var query =
			from tenant in _dbContext.Tenant
			where tenant.IsDeleted != true
			select tenant;

		if (sortId is not null) {
			query = sortId.ToLower() switch {
				"createdat" => effectiveSortOrder == SortOrder.Asc
					? query.OrderBy(t => t.CreatedAt)
					: query.OrderByDescending(t => t.CreatedAt),
				"updatedat" => effectiveSortOrder == SortOrder.Asc
					? query.OrderBy(t => t.UpdatedAt)
					: query.OrderByDescending(t => t.UpdatedAt),
				"code" => effectiveSortOrder == SortOrder.Asc
					? query.OrderBy(t => t.Code)
					: query.OrderByDescending(t => t.Code),
				"name" => effectiveSortOrder == SortOrder.Asc
					? query.OrderBy(t => t.Name)
					: query.OrderByDescending(t => t.Name),
				_ => query // Default: no sorting for unsupported fields
			};
		}

		return await query
			.Skip((effectivePage - 1) * effectiveLimit)
			.Take(effectiveLimit)
			.ToListAsync(cancellationToken)
			.ConfigureAwait(false);
	}

	public async Task<int> CountTenantsAsync(CancellationToken cancellationToken = default) {
		var query =
			from tenant in _dbContext.Tenant
			where tenant.IsDeleted != true
			select tenant;

		return await query.CountAsync(cancellationToken).ConfigureAwait(false);
	}
}
