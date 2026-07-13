using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Modules.Tenants.Entities;

namespace PublyApp.Api.Modules.Tenants.Services;

public interface ITenantService {
	Task<Tenant?> GetTenantByIdAsync(Guid tenantId, CancellationToken cancellationToken = default);
	Task<Tenant?> GetTenantByIdIncludingSuspendedAsync(
		Guid tenantId,
		CancellationToken cancellationToken = default
	);

	// Targeted, throttled write for tenant-scoped request activity tracking.
	// Callers decide staleness (see TenantAuthFilter) so this never runs an extra
	// read query on the hot path.
	Task TouchLastActivityAsync(Guid tenantId, CancellationToken cancellationToken = default);
}

[Service(ServiceLifetime.Scoped)]
public class TenantService : ITenantService {
	private readonly AppDbContext _dbContext;

	public TenantService(AppDbContext context) {
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

	public async Task TouchLastActivityAsync(
		Guid tenantId,
		CancellationToken cancellationToken = default
	) {
		// Self-guarding: repeats the staleness check from the WHERE clause
		// (TenantAuthFilter's in-memory check is a cheap short-circuit, not this
		// guard) so concurrent requests in the same burst don't all issue a
		// write — losers match zero rows and take no row lock.
		var cutoff = DateTime.UtcNow
			- TimeSpan.FromMinutes(AppEnvironment.Instance.TENANT_ACTIVITY_THROTTLE_MINUTES);

		await _dbContext.Tenant
			// == null (not "is null") is required: this is an expression tree,
			// the PUBLY0008 carve-out for that context.
			.Where(t => t.Id == tenantId && (t.LastActivityAt == null || t.LastActivityAt <= cutoff))
			.ExecuteUpdateAsync(
				setters => setters
					.SetProperty(t => t.LastActivityAt, DateTime.UtcNow),
				cancellationToken
			);
	}
}
