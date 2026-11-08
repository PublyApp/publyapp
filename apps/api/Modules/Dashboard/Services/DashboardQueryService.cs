using System.Globalization;

using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Modules.Dashboard.Services;

public record GetDashboardSeriesArgs(
	DateTime StartDate,
	DateTime EndDate
);

public record FindTopOrganisationsArgs(
	DateTime StartDate,
	DateTime EndDate,
	int Size
);

/// <summary>
/// One UTC calendar day of a dashboard series. The date is the wire
/// <c>YYYY-MM-DD</c> day, so the client never has to re-derive a timezone.
/// </summary>
public sealed class DashboardSeriesPoint {
	public required string Date { get; init; }
	public required int Value { get; init; }
}

/// <summary>
/// One organisation in the ranking, with the number of audit events in the
/// window attributed to it.
/// </summary>
public sealed class TopOrganisationItem {
	public required Guid Id { get; init; }
	public required string Name { get; init; }
	public required int Count { get; init; }
}

public interface IDashboardQueryService {
	Task<IReadOnlyList<DashboardSeriesPoint>> GetAuditEventSeriesAsync(
		GetDashboardSeriesArgs args,
		CancellationToken cancellationToken = default);

	Task<IReadOnlyList<TopOrganisationItem>> FindTopOrganisationsAsync(
		FindTopOrganisationsArgs args,
		CancellationToken cancellationToken = default);
}

[Service(ServiceLifetime.Scoped)]
public class DashboardQueryService : IDashboardQueryService {
	private readonly AppDbContext _DbContext;

	public DashboardQueryService(AppDbContext dbContext) {
		this._DbContext = dbContext;
	}

	public async Task<IReadOnlyList<DashboardSeriesPoint>>
		GetAuditEventSeriesAsync(
		GetDashboardSeriesArgs args,
		CancellationToken cancellationToken = default
	) {
		var endExclusive = args.EndDate.AddDays(1);

		// Grouped on the UTC day: audit timestamps are stored as UTC and the
		// API's reference clock is UTC everywhere, so a point is one UTC day.
		var dailyCounts = await (
			from auditLog in this._DbContext.AuditLog
				.AsNoTracking()
			where !auditLog.IsDeleted
				&& auditLog.Id != null
				&& auditLog.CreatedAt >= args.StartDate
				&& auditLog.CreatedAt < endExclusive
			group auditLog by auditLog.CreatedAt.Date into grouped
			select new {
				Day = grouped.Key,
				Count = grouped.Count(),
			}
		).ToListAsync(cancellationToken);

		var countsByDay = new Dictionary<DateTime, int>();
		foreach (var row in dailyCounts) {
			countsByDay[row.Day] = row.Count;
		}

		// Zero-filled on purpose: a day with no event is a real 0, not a gap.
		var points = new List<DashboardSeriesPoint>();
		for (var day = args.StartDate; day <= args.EndDate; day = day.AddDays(1)) {
			points.Add(new DashboardSeriesPoint {
				Date = day.ToString(
					"yyyy-MM-dd",
					CultureInfo.InvariantCulture
				),
				Value = countsByDay.TryGetValue(day, out var count)
					? count
					: 0,
			});
		}

		return points;
	}

	public async Task<IReadOnlyList<TopOrganisationItem>>
		FindTopOrganisationsAsync(
		FindTopOrganisationsArgs args,
		CancellationToken cancellationToken = default
	) {
		var endExclusive = args.EndDate.AddDays(1);

		// Same attribution rule as the tenant activity feed
		// (TenantActivityQueryService): an audit row belongs to a tenant when
		// it targets it, or when its actor holds (or held) a Tenant-scope
		// account in it. One row counts once per tenant even when both hold.
		// ponytail: one correlated count per tenant; fine at staff-scale
		// tenant counts. If the tenant table grows past a few thousand, split
		// this into two grouped queries (target / actor) and merge by id.
		var ranking =
			from tenant in this._DbContext.Tenant
				.AsNoTracking()
			where !tenant.IsDeleted
			let eventCount = (
				from auditLog in this._DbContext.AuditLog
					.AsNoTracking()
				where !auditLog.IsDeleted
					&& auditLog.Id != null
					&& auditLog.CreatedAt >= args.StartDate
					&& auditLog.CreatedAt < endExclusive
					&& (
						auditLog.TargetId == tenant.Id
						|| this._DbContext.UserAccount.Any(
							account =>
								account.UserId == auditLog.UserId
								&& account.TenantId == tenant.Id
								&& account.Scope
									== AccountScope.Tenant
						)
					)
				select auditLog.Id
			).Count()
			where eventCount > 0
			orderby eventCount descending, tenant.Name
			select new TopOrganisationItem {
				Id = tenant.Id ?? Guid.Empty,
				Name = tenant.Name,
				Count = eventCount,
			};

		return await ranking
			.Take(args.Size)
			.ToListAsync(cancellationToken);
	}
}
