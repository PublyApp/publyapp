using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Modules.Projects.Entities;
using PublyApp.Api.Modules.Publishing.Entities;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Modules.Tenants.Services;

/// <summary>
/// Flattened usage read-model for one tenant (#168). Plain class with init
/// properties — no EF entities cross the service boundary.
/// </summary>
public class TenantUsageSnapshot {
	public required Guid TenantId { get; init; }

	/// <summary>Members whose membership and identity rows are both live.</summary>
	public int UsersTotal { get; init; }

	/// <summary><see cref="UsersTotal"/> minus suspended memberships.</summary>
	public int UsersActive { get; init; }

	public int ProjectsCount { get; init; }

	/// <summary>Publications currently waiting in the scheduling pipeline.</summary>
	public int ScheduledPublicationsCount { get; init; }

	/// <summary>
	/// Tenant-level last-activity timestamp maintained (throttled) by
	/// <c>TenantAuthFilter</c>. It lags real activity by design — the API
	/// response carries <c>computedAt</c> so clients can show how fresh the
	/// whole snapshot is instead of presenting a stale number as live.
	/// </summary>
	public DateTime? LastActivityAt { get; init; }

	/// <summary>UTC instant this snapshot was computed at (freshness contract).</summary>
	public DateTime ComputedAt { get; init; }
}

public interface ITenantUsageService {
	/// <summary>
	/// Aggregates per-tenant usage counters for staff surfaces. Every query is
	/// tenant-scoped by construction (a WHERE on the tenant id) — never a
	/// whole-table scan across tenants. Returns null when the tenant does not
	/// exist.
	/// </summary>
	Task<TenantUsageSnapshot?> GetTenantUsageAsync(
		Guid tenantId,
		CancellationToken cancellationToken = default
	);
}

[Service(ServiceLifetime.Scoped)]
public class TenantUsageService : ITenantUsageService {
	private readonly AppDbContext _dbContext;

	public TenantUsageService(
		AppDbContext dbContext,
		ILogger<TenantUsageService> logger
	) {
		_dbContext = dbContext;
		_ = logger;
	}

	public async Task<TenantUsageSnapshot?> GetTenantUsageAsync(
		Guid tenantId,
		CancellationToken cancellationToken = default
	) {
		var now = DateTime.UtcNow;

		var exists = await (
			from tenant in _dbContext.Tenant.AsNoTracking()
			where tenant.Id == tenantId && !tenant.IsDeleted
			select tenant.Id
		).AnyAsync(cancellationToken);
		if (!exists) {
			return null;
		}

		var lastActivityAt = await LastActivityAtQuery(tenantId).FirstAsync(cancellationToken);

		// Membership counts mirror CountTenantUsersAsync parity rules: exclude
		// soft-deleted memberships AND members whose owning User row was
		// soft-deleted, so the number never drifts from the tenant users list.
		var usersTotal = await UsersTotalQuery(tenantId).CountAsync(cancellationToken);
		var usersActive = await UsersActiveQuery(tenantId).CountAsync(cancellationToken);
		var projectsCount = await ProjectsCountQuery(tenantId).CountAsync(cancellationToken);
		var scheduledPublicationsCount = await ScheduledPublicationsCountQuery(tenantId)
			.CountAsync(cancellationToken);

		return new TenantUsageSnapshot {
			TenantId = tenantId,
			UsersTotal = usersTotal,
			UsersActive = usersActive,
			ProjectsCount = projectsCount,
			ScheduledPublicationsCount = scheduledPublicationsCount,
			LastActivityAt = lastActivityAt,
			// One freshness stamp for the whole snapshot: every counter above
			// was computed inside this request, against this instant.
			ComputedAt = now,
		};
	}

	/// <summary>
	/// Returns the raw <c>LastActivityAt</c> query so tests can instrument it
	/// directly without going through the existence guard.
	/// </summary>
	protected internal IQueryable<DateTime?> LastActivityAtQuery(
		Guid tenantId
	) {
		return (
			from tenant in _dbContext.Tenant.AsNoTracking()
			where tenant.Id == tenantId && !tenant.IsDeleted
			select tenant.LastActivityAt
		);
	}

	/// <summary>
	/// Returns the raw <c>UsersTotal</c> query so tests can instrument it
	/// directly. Excludes soft-deleted memberships AND members whose owning
	/// User row was soft-deleted.
	/// </summary>
	protected internal IQueryable<UserAccount> UsersTotalQuery(
		Guid tenantId
	) {
		return (
			from ua in _dbContext.UserAccount.AsNoTracking()
			where ua.TenantId == tenantId
				&& ua.Scope == AccountScope.Tenant
				&& !ua.IsDeleted
				&& !ua.User.IsDeleted
			select ua
		);
	}

	/// <summary>
	/// Returns the raw <c>UsersActive</c> query so tests can instrument it
	/// directly. Mirrors <see cref="UsersTotalQuery"/> plus an Active status
	/// filter.
	/// </summary>
	protected internal IQueryable<UserAccount> UsersActiveQuery(
		Guid tenantId
	) {
		return (
			from ua in _dbContext.UserAccount.AsNoTracking()
			where ua.TenantId == tenantId
				&& ua.Scope == AccountScope.Tenant
				&& !ua.IsDeleted
				&& !ua.User.IsDeleted
				&& ua.Status == AccountStatus.Active
			select ua
		);
	}

	/// <summary>
	/// Returns the raw <c>ProjectsCount</c> query so tests can instrument it
	/// directly. Excludes soft-deleted projects.
	/// </summary>
	protected internal IQueryable<Project> ProjectsCountQuery(
		Guid tenantId
	) {
		return (
			from project in _dbContext.Project.AsNoTracking()
			where project.TenantId == tenantId
				&& !project.IsDeleted
			select project
		);
	}

	/// <summary>
	/// Returns the raw <c>ScheduledPublicationsCount</c> query so tests can
	/// instrument it directly. Excludes soft-deleted publications.
	/// </summary>
	protected internal IQueryable<Publication> ScheduledPublicationsCountQuery(
		Guid tenantId
	) {
		return (
			from publication in _dbContext.Publication.AsNoTracking()
			where publication.TenantId == tenantId
				&& !publication.IsDeleted
				&& publication.Status == PublicationStatus.Scheduled
			select publication
		);
	}
}
