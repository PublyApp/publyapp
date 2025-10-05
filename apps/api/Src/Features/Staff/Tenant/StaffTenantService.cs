using MainApi.Src.Data.DbContext;
using MainApi.Src.Lib;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using CommonTenantNs = MainApi.Src.Features.Common.Tenant;

namespace MainApi.Src.Features.Staff.Tenant;

public interface IStaffTenantService {
	Task<CommonTenantNs.Tenant> CreateTenant(CommonTenantNs.Tenant tenant, CancellationToken cancellationToken = default);
	Task<CommonTenantNs.Tenant?> GetTenantAsync(Guid tenantId, CancellationToken cancellationToken = default);
	Task<List<CommonTenantNs.Tenant>> FindTenantsAsync(
		int? page = 1,
		int? pageSize = null,
		CancellationToken cancellationToken = default
	);
	Task<int> CountTenantsAsync(CancellationToken cancellationToken = default);
}

public class StaffTenantService : IStaffTenantService {
	private readonly MainApiDbContext _dbContext;
	private readonly IOptions<AppSettings> _appSettings;

	public StaffTenantService(MainApiDbContext dbContext, IOptions<AppSettings> appSettings) {
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
		int? page = 1,
		int? pageSize = null,
		CancellationToken cancellationToken = default
	) {
		var effectivePageSize = pageSize ?? _appSettings.Value.PAGINATION_DEFAULT_LIMIT;

		var query =
			from tenant in _dbContext.Tenant
			where tenant.IsDeleted != true
			select tenant;

		return await query.Skip((page ?? 1) * effectivePageSize).Take(effectivePageSize)
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
