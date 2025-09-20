namespace MainApi.Src.Features.Common.Tenant;

using MainApi.Src.Data.DbContext;
using MainApi.Src.Lib;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

public interface ITenantService {
	Task<bool> IsUserStaffMemberAsync(Guid userId, CancellationToken cancellationToken = default);
	Task<Tenant?> GetStaffTenantAsync(CancellationToken cancellationToken = default);
	Task<Tenant?> GetTenantAsync(Guid tenantId, CancellationToken cancellationToken = default);
	Task<bool> IsUserMemberOfTenantAsync(Guid userId, Guid tenantId, CancellationToken cancellationToken = default);
}

public class TenantService : ITenantService {
	private readonly MainApiDbContext _dbContext;
	private readonly IOptions<AppSettings> _appSettings;

	public TenantService(MainApiDbContext context, IOptions<AppSettings> appSettings) {
		_dbContext = context;
		_appSettings = appSettings;
	}
	public async Task<bool> IsUserStaffMemberAsync(Guid userId, CancellationToken cancellationToken = default) {
		// Check if user account exists where userId matches and tenant code is "staff"
		return await _dbContext.UserAccount
			.Join(_dbContext.Tenant, ua => ua.TenantId, t => t.Id, (ua, t) => new { ua.Id, ua.UserId, t.Code })
			.AnyAsync(x => x.UserId == userId && x.Code == _appSettings.Value.STAFF_TENANT_CODE, cancellationToken)
			.ConfigureAwait(false);
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

	public async Task<bool> IsUserMemberOfTenantAsync(Guid userId, Guid tenantId, CancellationToken cancellationToken = default) {
		return await _dbContext.UserAccount
			.Where(x => x.UserId == userId && x.TenantId == tenantId)
			.AnyAsync(cancellationToken)
			.ConfigureAwait(false);
	}
}
