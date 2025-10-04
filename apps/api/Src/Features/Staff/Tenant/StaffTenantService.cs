using MainApi.Src.Data.DbContext;
using CommonTenantNs = MainApi.Src.Features.Common.Tenant;

namespace MainApi.Src.Features.Staff.Tenant;

public interface IStaffTenantService {
	Task<CommonTenantNs.Tenant> CreateTenant(CommonTenantNs.Tenant tenant);
}

public class StaffTenantService : IStaffTenantService {
	private readonly MainApiDbContext _dbContext;

	public StaffTenantService(MainApiDbContext dbContext) {
		_dbContext = dbContext;
	}

	public async Task<CommonTenantNs.Tenant> CreateTenant(CommonTenantNs.Tenant tenant) {
		var result = await _dbContext.Tenant.AddAsync(tenant);
		await _dbContext.SaveChangesAsync();
		return result.Entity;
	}
}
