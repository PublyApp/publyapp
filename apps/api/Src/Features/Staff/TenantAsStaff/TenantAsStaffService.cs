using MainApi.Src.Data.DbContext;
using MainApi.Src.Lib;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using CommonTenantNs = MainApi.Src.Features.Common.Tenant;
using MainApi.Src.Features.Common.Account;

namespace MainApi.Src.Features.Staff.TenantAsStaff;

public class TenantAsStaffItem {
	public CommonTenantNs.Tenant Tenant { get; set; } = new CommonTenantNs.Tenant {
		Code = string.Empty,
		Name = string.Empty,
	};
	public int UsersCount { get; set; }
}

public interface ITenantAsStaffService {
	Task<CommonTenantNs.Tenant> CreateTenant(CommonTenantNs.Tenant tenant, CancellationToken cancellationToken = default);
	Task<CommonTenantNs.Tenant?> GetTenantAsync(Guid tenantId, CancellationToken cancellationToken = default);
	Task<List<TenantAsStaffItem>> FindTenantsAsync(
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

	public async Task<List<TenantAsStaffItem>> FindTenantsAsync(
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
			join userAccount in _dbContext.UserAccount
				.Where(ua => ua.Scope == AccountScope.Tenant && ua.IsDeleted != true)
				on tenant.Id equals userAccount.TenantId into userAccounts
			select new TenantAsStaffItem {
				Tenant = tenant,
				UsersCount = userAccounts.Count()
			};

		if (sortId is not null) {
			query = sortId.ToLower() switch {
				"createdat" => effectiveSortOrder == SortOrder.Asc
					? query.OrderBy(t => t.Tenant.CreatedAt)
					: query.OrderByDescending(t => t.Tenant.CreatedAt),
				"updatedat" => effectiveSortOrder == SortOrder.Asc
					? query.OrderBy(t => t.Tenant.UpdatedAt)
					: query.OrderByDescending(t => t.Tenant.UpdatedAt),
				"code" => effectiveSortOrder == SortOrder.Asc
					? query.OrderBy(t => t.Tenant.Code)
					: query.OrderByDescending(t => t.Tenant.Code),
				"name" => effectiveSortOrder == SortOrder.Asc
					? query.OrderBy(t => t.Tenant.Name)
					: query.OrderByDescending(t => t.Tenant.Name),
				"userscount" => effectiveSortOrder == SortOrder.Asc
					? query.OrderBy(t => t.UsersCount)
					: query.OrderByDescending(t => t.UsersCount),
				_ => query // Default: no sorting for unsupported fields
			};
		}

		query = query
			.Skip((effectivePage - 1) * effectiveLimit)
			.Take(effectiveLimit);

		return await query
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
