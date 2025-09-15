namespace MainApi.Src.Features.Staff.Tenant;

using MainApi.Src.Data.DbContext;
using MainApi.Src.Features.Common.Tenant;

public interface ITenantStaffService {
	Task<Tenant> CreateTenant(Tenant tenant);
}

public class TenantStaffService : ITenantStaffService {
	private readonly MainApiDbContext _dbContext;

	public TenantStaffService(MainApiDbContext dbContext) {
		_dbContext = dbContext;
	}

	public async Task<Tenant> CreateTenant(Tenant tenant) {
		var result = await _dbContext.Tenant.AddAsync(tenant);
		await _dbContext.SaveChangesAsync();
		return result.Entity;
	}
}
