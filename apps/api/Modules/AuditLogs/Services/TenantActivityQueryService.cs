using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Modules.AuditLogs.Services;

public record FindTenantActivityArgs(
	Guid TenantId,
	Guid Cursor,
	int Limit,
	string SortId,
	SortOrder SortOrder
);

public abstract record FindTenantActivityResult {
	public sealed record Success(
		CursorPaginatedResult<AuditLogListItem> Data
	) : FindTenantActivityResult;

	public sealed record CursorNotFound(
		string Cursor
	) : FindTenantActivityResult;

	public sealed record InvalidSortId(
		string SortId
	) : FindTenantActivityResult;
}

/// <summary>
/// Tenant-scoped read model over the audit log (issue #364).
///
/// The <c>audit_logs</c> table carries no tenant column, so tenant scope is
/// derived server-side: an entry belongs to a tenant when it TARGETS the
/// tenant (<c>target_id</c>) or when its acting user holds (or held) a
/// Tenant-scope account in that tenant. The tenant id comes only from the
/// route segment; this service exposes no scope filters, so a caller can
/// never widen the feed toward another tenant.
///
/// Identity note: <see cref="AuditLog.UserId"/> stores the GLOBAL user id
/// (the same value as <c>users.id</c>), while tenancy lives on
/// <c>UserAccount</c> rows. Membership joins therefore go through
/// <c>UserAccount.UserId == AuditLog.UserId</c>, and the displayed name is
/// resolved off the global id with soft-delete filters ignored so history
/// outlives removed memberships and deleted identities.
/// </summary>
public interface ITenantActivityQueryService {
	Task<FindTenantActivityResult> FindForTenantAsync(
		FindTenantActivityArgs args,
		CancellationToken cancellationToken = default);
}

[Service(ServiceLifetime.Scoped)]
public class TenantActivityQueryService : ITenantActivityQueryService {
	private readonly AppDbContext _dbContext;

	public TenantActivityQueryService(AppDbContext dbContext) {
		_dbContext = dbContext;
	}

	public async Task<FindTenantActivityResult> FindForTenantAsync(
		FindTenantActivityArgs args,
		CancellationToken cancellationToken = default
	) {
		var effectiveSortOrder = args.SortOrder;
		var effectiveSortId = args.SortId;

		// Same single-sort contract as FindAuditLogs: public sort_id wire
		// values, cursor lookup + page predicate + ordering kept together so
		// tie-breakers stay consistent.
		var sortFieldHandlers =
			new Dictionary<string, CursorSortFieldHandler<AuditLog>>(
				StringComparer.OrdinalIgnoreCase
			) {
				["created_at"] = new CursorSortFieldHandler<AuditLog>(
				getCursorValue: async (guid) => {
					var log = await (
						from auditLog in ScopedQuery(args.TenantId)
						where auditLog.Id == guid
						select new {
							auditLog.CreatedAt,
							auditLog.Id
						}
					).FirstOrDefaultAsync(
						cancellationToken
					);
					return log is not null
						? (log.CreatedAt, log.Id)
						: null;
				},
				applyFilter: (q, cursorValue, isAsc) => {
					if (cursorValue is null) {
						return q;
					}
					var (cursorCreatedAt, cursorId) =
						((DateTime, Guid?))cursorValue;
					return isAsc
						? from auditLog in q
							where auditLog.CreatedAt > cursorCreatedAt
							|| (auditLog.CreatedAt
								== cursorCreatedAt
								&& auditLog.Id > cursorId)
							select auditLog
						: from auditLog in q
							where auditLog.CreatedAt < cursorCreatedAt
							|| (auditLog.CreatedAt
								== cursorCreatedAt
								&& auditLog.Id < cursorId)
							select auditLog;
				},
				applyOrdering: (q, isAsc) => isAsc
					? from auditLog in q
						orderby auditLog.CreatedAt, auditLog.Id
						select auditLog
					: from auditLog in q
						orderby auditLog.CreatedAt descending,
							auditLog.Id descending
						select auditLog
			),
			};

		if (!sortFieldHandlers.TryGetValue(
			effectiveSortId, out CursorSortFieldHandler<AuditLog>? handler
		)) {
			return new FindTenantActivityResult.InvalidSortId(
				effectiveSortId
			);
		}

		var query = ScopedQuery(args.TenantId);

		if (args.Cursor != Guid.Empty) {
			var cursorValue =
				await handler.GetCursorValue(args.Cursor);
			if (cursorValue is null) {
				return new FindTenantActivityResult.CursorNotFound(
					args.Cursor.ToString()
				);
			}

			query = handler.ApplyFilter(
				query,
				cursorValue,
				effectiveSortOrder == SortOrder.Asc
			);
		}

		var orderedQuery = handler.ApplyOrdering(
			query,
			effectiveSortOrder == SortOrder.Asc
		);

		var projectedQuery =
			from a in orderedQuery
				.Take(args.Limit + 1)
			join u in _dbContext.User
				.IgnoreQueryFilters()
				// Audit rows outlive soft-deleted users; keep the
				// historical actor visible when possible. Resolved off
				// the GLOBAL user id stored in audit_logs.user_id — not
				// an account id.
				on (Guid?)a.UserId equals u.Id
				into userJoin
			from u in userJoin.DefaultIfEmpty()
			select new AuditLogListItem {
				Id = a.Id ?? Guid.Empty,
				UserId = a.UserId,
				UserName = u == null
					? "(deleted user)"
					: u.FirstName != null
						|| u.LastName != null
						? ((u.FirstName ?? "")
							+ " "
							+ (u.LastName ?? ""))
							.Trim()
						: u.Email,
				UserEmail = u == null
					? "(unknown)"
					: u.Email,
				Action = a.Action,
				TargetId = a.TargetId,
				IpAddress = a.IpAddress,
				CreatedAt = a.CreatedAt
			};

		var results = await projectedQuery
			.ToListAsync(cancellationToken);

		string? nextCursor = null;
		if (results.Count > args.Limit) {
			results.RemoveAt(results.Count - 1);
			nextCursor = results.Last().Id.ToString();
		}

		return new FindTenantActivityResult.Success(
			new CursorPaginatedResult<AuditLogListItem> {
				Data = results,
				NextCursor = nextCursor,
			}
		);
	}

	/// <summary>
	/// The entire tenant boundary lives in this one predicate. Membership
	/// matching intentionally ignores the account row's soft-delete flag:
	/// each UserAccount row carries exactly one tenant_id, so counting past
	/// memberships can only widen toward tenants the actor ACTUALLY belonged
	/// to — never toward another tenant's entries.
	/// </summary>
	private IQueryable<AuditLog> ScopedQuery(Guid tenantId) {
		return
			from auditLog in _dbContext.AuditLog.AsNoTracking()
			where !auditLog.IsDeleted
				&& auditLog.Id != null
				&& (
					auditLog.TargetId == tenantId
					|| _dbContext.UserAccount.Any(account =>
						account.UserId == auditLog.UserId
						&& account.TenantId == tenantId
						&& account.Scope == AccountScope.Tenant)
				)
			select auditLog;
	}
}
