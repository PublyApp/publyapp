using MainApi.Src.Data.DbContext;
using MainApi.Src.Modules.Tenants.Entities;

using Microsoft.EntityFrameworkCore;

namespace MainApi.Src.Modules.Tenants.Services;

public interface ITenantService {
	Task<Tenant?> GetTenantByIdAsync(Guid tenantId, CancellationToken cancellationToken = default);
	Task<Tenant?> GetTenantByIdIncludingSuspendedAsync(
		Guid tenantId,
		CancellationToken cancellationToken = default
	);
}

public class TenantService : ITenantService {
	private readonly MainApiDbContext _dbContext;

	public TenantService(MainApiDbContext context) {
		_dbContext = context;
	}

	public async Task<Tenant?> GetTenantByIdAsync(Guid tenantId, CancellationToken cancellationToken = default) {
		var query =
			from tenant in _dbContext.Tenant
			where tenant.Id == tenantId
			select tenant;

		var foundTenant = await query.FirstOrDefaultAsync(cancellationToken);

		if (foundTenant is not null && !Tenant.IsTenantActive(foundTenant)) {
			return null;
		}

		return foundTenant;
	}

	// Returns tenant even if suspended (but not if deleted)
	public async Task<Tenant?> GetTenantByIdIncludingSuspendedAsync(
		Guid tenantId,
		CancellationToken cancellationToken = default
	) {
		return await (
			from tenant in _dbContext.Tenant
			where tenant.Id == tenantId && !tenant.IsDeleted
			select tenant
		).FirstOrDefaultAsync(cancellationToken);
	}
}
