using MainApi.Src.Data.DbContext;
using MainApi.Src.Lib;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace MainApi.Src.Features.Common.Tenant;

public interface ITenantService {
	Task<Tenant?> GetStaffTenantAsync(CancellationToken cancellationToken = default);
	Task<Tenant?> GetTenantAsync(Guid tenantId, CancellationToken cancellationToken = default);
}

public class TenantService : ITenantService {
	private readonly MainApiDbContext _dbContext;
	private readonly IOptions<AppSettings> _appSettings;

	public TenantService(MainApiDbContext context, IOptions<AppSettings> appSettings) {
		_dbContext = context;
		_appSettings = appSettings;
	}

	public async Task<Tenant?> GetStaffTenantAsync(CancellationToken cancellationToken = default) {
		return await _dbContext.Tenant
			.Where(x => x.Code == _appSettings.Value.STAFF_TENANT_CODE)
			.FirstOrDefaultAsync(cancellationToken)
			.ConfigureAwait(false);
	}

	public async Task<Tenant?> GetTenantAsync(Guid tenantId, CancellationToken cancellationToken = default) {
		return await _dbContext.Tenant
			.Where(x => x.Id == tenantId)
			.FirstOrDefaultAsync(cancellationToken)
			.ConfigureAwait(false);
	}

}
