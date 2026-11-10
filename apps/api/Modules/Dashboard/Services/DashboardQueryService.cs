using System.Globalization;

using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.Tenants.Entities;
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
/// The active-organisations series, plus the day the lifecycle history starts:
/// <c>null</c> when nothing was ever recorded, otherwise the UTC day of the
/// earliest transition. Days before it are not measured values (#2349).
/// </summary>
public sealed record ActiveTenantSeries(
	IReadOnlyList<DashboardSeriesPoint> Points,
	DateTime? RecordedSince
);

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

	Task<IReadOnlyList<DashboardSeriesPoint>> GetSignInSeriesAsync(
		GetDashboardSeriesArgs args,
		CancellationToken cancellationToken = default);

	Task<IReadOnlyList<DashboardSeriesPoint>> GetFailedSignInSeriesAsync(
		GetDashboardSeriesArgs args,
		CancellationToken cancellationToken = default);

	Task<ActiveTenantSeries> GetActiveTenantSeriesAsync(
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

	public Task<IReadOnlyList<DashboardSeriesPoint>>
		GetAuditEventSeriesAsync(
		GetDashboardSeriesArgs args,
		CancellationToken cancellationToken = default
	) {
		return this._GetDailySeriesAsync(args, action: null, cancellationToken);
	}

	public Task<IReadOnlyList<DashboardSeriesPoint>>
		GetSignInSeriesAsync(
		GetDashboardSeriesArgs args,
		CancellationToken cancellationToken = default
	) {
		return this._GetDailySeriesAsync(
			args,
			AuditActions.LoginSucceeded,
			cancellationToken
		);
	}

	public Task<IReadOnlyList<DashboardSeriesPoint>>
		GetFailedSignInSeriesAsync(
		GetDashboardSeriesArgs args,
		CancellationToken cancellationToken = default
	) {
		return this._GetDailySeriesAsync(
			args,
			AuditActions.LoginFailed,
			cancellationToken
		);
	}

	/// <summary>
	/// Organisations active at the end of each UTC day, from the lifecycle
	/// history written by the <c>tenants_record_status_history</c> trigger.
	/// Zero-filled on purpose: a day where nothing changed still has a count.
	/// The days before <see cref="ActiveTenantSeries.RecordedSince"/> are not
	/// measured values — the caller must not present them as such.
	/// </summary>
	public async Task<ActiveTenantSeries>
		GetActiveTenantSeriesAsync(
		GetDashboardSeriesArgs args,
		CancellationToken cancellationToken = default
	) {
		var endExclusive = args.EndDate.AddDays(1);

		// The first recorded transition is the day history starts. The baseline
		// row of the migration is dated then, never at the tenant's creation.
		var recordedSince = await this._DbContext.TenantStatusHistory
			.AsNoTracking()
			.MinAsync(
				history => (DateTime?)history.OccurredAt,
				cancellationToken
			);

		// Every transition up to the end of the window, oldest first. Rows
		// before the window are replayed too: they are what the first day's
		// state is built from.
		// ponytail: the whole history in memory (a few narrow rows per tenant).
		// If it grows past ~100k rows, read a per-tenant baseline row before
		// the window plus the window's rows only.
		var transitions = await (
			from history in this._DbContext.TenantStatusHistory
				.AsNoTracking()
			where history.OccurredAt < endExclusive
			orderby history.OccurredAt, history.Id
			select new {
				history.TenantId,
				history.Status,
				history.OccurredAt,
			}
		).ToListAsync(cancellationToken);

		var statusByTenant = new Dictionary<Guid, TenantLifecycleStatus>();
		var activeCount = 0;
		var cursor = 0;
		var points = new List<DashboardSeriesPoint>();

		for (var day = args.StartDate; day <= args.EndDate; day = day.AddDays(1)) {
			var dayEnd = day.AddDays(1);
			while (cursor < transitions.Count
				&& transitions[cursor].OccurredAt < dayEnd
			) {
				var transition = transitions[cursor];
				var wasActive = statusByTenant.TryGetValue(
					transition.TenantId,
					out var previous
				) && previous == TenantLifecycleStatus.Active;
				var isActive = transition.Status == TenantLifecycleStatus.Active;

				if (wasActive != isActive) {
					activeCount += isActive ? 1 : -1;
				}

				statusByTenant[transition.TenantId] = transition.Status;
				cursor++;
			}

			points.Add(new DashboardSeriesPoint {
				Date = day.ToString(
					"yyyy-MM-dd",
					CultureInfo.InvariantCulture
				),
				Value = activeCount,
			});
		}

		return new ActiveTenantSeries(points, recordedSince);
	}

	/// <summary>
	/// One UTC-day series over the audit log, optionally narrowed to a single
	/// action. Zero-filled on purpose: a day with no event is a real 0.
	/// </summary>
	private async Task<IReadOnlyList<DashboardSeriesPoint>>
		_GetDailySeriesAsync(
		GetDashboardSeriesArgs args,
		string? action,
		CancellationToken cancellationToken
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
				&& (action == null || auditLog.Action == action)
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
