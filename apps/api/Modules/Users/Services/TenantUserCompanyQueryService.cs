using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Modules.Tenants.Entities;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Modules.Users.Services;

public abstract record FindTenantUserCompaniesResult {
	public sealed record Success(
		CursorPaginatedResult<TenantUserCompanyData> Data
	) : FindTenantUserCompaniesResult;

	public sealed record NotFound() : FindTenantUserCompaniesResult;

	public sealed record CursorNotFound(
		string Cursor
	) : FindTenantUserCompaniesResult;

	public sealed record InvalidSortId(
		string SortId
	) : FindTenantUserCompaniesResult;
}

public record FindTenantUserCompaniesForStaffArgs(
	Guid Cursor,
	int? Limit,
	string? SortId,
	SortOrder? SortOrder,
	FindTenantUserCompaniesForStaffFilters? Filters
);

public record FindTenantUserCompaniesForStaffFilters(
	string? Search
);

public class TenantUserCompanyData {
	public required UserAccount Account { get; set; }
	public required Tenant Tenant { get; set; }
	public required AccountLevel AccountLevel { get; set; }
	public required UserStatus UserStatus { get; set; }
}

public interface ITenantUserCompanyQueryService {
	Task<bool> TenantUserExistsForCompanyActionsForStaffAsync(
		Guid userId,
		CancellationToken cancellationToken = default
	);

	Task<FindTenantUserCompaniesResult> FindTenantUserCompaniesForStaffAsync(
		Guid userId,
		FindTenantUserCompaniesForStaffArgs args,
		CancellationToken cancellationToken = default
	);
}

[Service(ServiceLifetime.Scoped)]
public class TenantUserCompanyQueryService : ITenantUserCompanyQueryService {
	private sealed class TenantUserCompanyQueryRow {
		public required UserAccount Account { get; init; }
		public required User User { get; init; }
		public required Tenant Tenant { get; init; }
		public required Guid TenantId { get; init; }
	}

	private readonly AppDbContext _dbContext;

	public TenantUserCompanyQueryService(AppDbContext dbContext) {
		_dbContext = dbContext;
	}

	private static int GetTenantUserStatusRank(
		bool isUserGloballySuspended,
		bool isMembershipSuspended
	) {
		// Sort order mirrors the tenant-user effective status:
		// Active = 0, Suspended = 1, GloballySuspended = 2.
		if (isUserGloballySuspended) {
			return 2;
		}

		if (isMembershipSuspended) {
			return 1;
		}

		return 0;
	}

	public async Task<bool> TenantUserExistsForCompanyActionsForStaffAsync(
		Guid userId,
		CancellationToken cancellationToken = default
	) {
		return await (
			from u in _dbContext.User.AsNoTracking()
			where u.Id == userId
				&& !u.IsDeleted
				&& (
					from ua in _dbContext.UserAccount.AsNoTracking()
					where ua.UserId == u.Id
						&& ua.Scope == AccountScope.Tenant
					select ua
				).Any()
			select u
		).AnyAsync(cancellationToken);
	}

	public async Task<FindTenantUserCompaniesResult>
	FindTenantUserCompaniesForStaffAsync(
		Guid userId,
		FindTenantUserCompaniesForStaffArgs args,
		CancellationToken cancellationToken = default
	) {
		var effectiveLimit = args.Limit
			?? AppEnvironment.Instance.PAGINATION_DEFAULT_LIMIT;
		var effectiveSortOrder = args.SortOrder ?? SortOrder.Desc;
		var effectiveSortId = args.SortId ?? "tenant_name";

		var sortFieldHandlers =
			new Dictionary<string, CursorSortFieldHandler<TenantUserCompanyQueryRow>>(
				StringComparer.OrdinalIgnoreCase
			) {
				["tenant_name"] = new CursorSortFieldHandler<TenantUserCompanyQueryRow>(
					getCursorValue: async (guid) => {
						var item = await (
							from ua in _dbContext.UserAccount.AsNoTracking()
							join tenant in _dbContext.Tenant.AsNoTracking()
								on ua.TenantId equals tenant.Id
							where ua.UserId == userId
								&& ua.TenantId == guid
								&& ua.Scope == AccountScope.Tenant
								&& ua.TenantId != null
								&& !ua.IsDeleted
								&& !ua.User.IsDeleted
								&& !tenant.IsDeleted
							select new {
								tenant.Name,
								TenantId = ua.TenantId ?? Guid.Empty,
							}
						).FirstOrDefaultAsync(cancellationToken);
						return item is not null
							? (item.Name, item.TenantId)
							: null;
					},
					applyFilter: (q, val, isAsc) => {
						if (val is null) {
							return q;
						}
						var (name, tenantId) = ((string, Guid))val;
						return isAsc
							? q.Where(x =>
								x.Tenant.Name.CompareTo(name) > 0
								|| (x.Tenant.Name == name
									&& x.TenantId > tenantId))
							: q.Where(x =>
								x.Tenant.Name.CompareTo(name) < 0
								|| (x.Tenant.Name == name
									&& x.TenantId < tenantId));
					},
					applyOrdering: (q, isAsc) => isAsc
						? q.OrderBy(x => x.Tenant.Name)
							.ThenBy(x => x.TenantId)
						: q.OrderByDescending(x => x.Tenant.Name)
							.ThenByDescending(x => x.TenantId)
				),

				["status"] = new CursorSortFieldHandler<TenantUserCompanyQueryRow>(
					getCursorValue: async (guid) => {
						var item = await (
							from ua in _dbContext.UserAccount.AsNoTracking()
							join u in _dbContext.User.AsNoTracking()
								on ua.UserId equals u.Id
							join tenant in _dbContext.Tenant.AsNoTracking()
								on ua.TenantId equals tenant.Id
							where ua.UserId == userId
								&& ua.TenantId == guid
								&& ua.Scope == AccountScope.Tenant
								&& ua.TenantId != null
								&& !ua.IsDeleted
								&& !u.IsDeleted
								&& !tenant.IsDeleted
							select new {
								IsUserGloballySuspended = u.Status == UserStatus.Suspended,
								IsMembershipSuspended = ua.Status == AccountStatus.Suspended,
								TenantId = ua.TenantId ?? Guid.Empty,
							}
						).FirstOrDefaultAsync(cancellationToken);
						return item is not null
							? (
								GetTenantUserStatusRank(
									item.IsUserGloballySuspended,
									item.IsMembershipSuspended
								),
								item.TenantId
							)
							: null;
					},
					applyFilter: (q, val, isAsc) => {
						if (val is null) {
							return q;
						}
						var (statusRank, tenantId) = ((int, Guid))val;
						return isAsc
							? q.Where(x =>
								(x.User.Status == UserStatus.Suspended
									? 2
									: x.Account.Status == AccountStatus.Suspended
										? 1
										: 0) > statusRank
								|| (((x.User.Status == UserStatus.Suspended
										? 2
										: x.Account.Status == AccountStatus.Suspended
											? 1
											: 0)
										== statusRank)
									&& x.TenantId > tenantId))
							: q.Where(x =>
								(x.User.Status == UserStatus.Suspended
									? 2
									: x.Account.Status == AccountStatus.Suspended
										? 1
										: 0) < statusRank
								|| (((x.User.Status == UserStatus.Suspended
										? 2
										: x.Account.Status == AccountStatus.Suspended
											? 1
											: 0)
										== statusRank)
									&& x.TenantId < tenantId));
					},
					applyOrdering: (q, isAsc) => isAsc
						? q.OrderBy(
							x => x.User.Status == UserStatus.Suspended
								? 2
								: x.Account.Status == AccountStatus.Suspended
									? 1
									: 0
						).ThenBy(x => x.TenantId)
						: q.OrderByDescending(
							x => x.User.Status == UserStatus.Suspended
								? 2
								: x.Account.Status == AccountStatus.Suspended
									? 1
									: 0
						).ThenByDescending(x => x.TenantId)
				),

				["level"] = new CursorSortFieldHandler<TenantUserCompanyQueryRow>(
					getCursorValue: async (guid) => {
						var item = await (
							from ua in _dbContext.UserAccount.AsNoTracking()
							join tenant in _dbContext.Tenant.AsNoTracking()
								on ua.TenantId equals tenant.Id
							where ua.UserId == userId
								&& ua.TenantId == guid
								&& ua.Scope == AccountScope.Tenant
								&& ua.TenantId != null
								&& !ua.IsDeleted
								&& !ua.User.IsDeleted
								&& !tenant.IsDeleted
							select new {
								ua.Level,
								TenantId = ua.TenantId ?? Guid.Empty,
							}
						).FirstOrDefaultAsync(cancellationToken);
						return item is not null
							? (item.Level, item.TenantId)
							: null;
					},
					applyFilter: (q, val, isAsc) => {
						if (val is null) {
							return q;
						}
						var (level, tenantId) = ((AccountLevel, Guid))val;
						return isAsc
							? q.Where(x =>
								x.Account.Level > level
								|| (x.Account.Level == level
									&& x.TenantId > tenantId))
							: q.Where(x =>
								x.Account.Level < level
								|| (x.Account.Level == level
									&& x.TenantId < tenantId));
					},
					applyOrdering: (q, isAsc) => isAsc
						? q.OrderBy(x => x.Account.Level)
							.ThenBy(x => x.TenantId)
						: q.OrderByDescending(x => x.Account.Level)
							.ThenByDescending(x => x.TenantId)
				),

				["created_at"] = new CursorSortFieldHandler<TenantUserCompanyQueryRow>(
					getCursorValue: async (guid) => {
						var item = await (
							from ua in _dbContext.UserAccount.AsNoTracking()
							join tenant in _dbContext.Tenant.AsNoTracking()
								on ua.TenantId equals tenant.Id
							where ua.UserId == userId
								&& ua.TenantId == guid
								&& ua.Scope == AccountScope.Tenant
								&& ua.TenantId != null
								&& !ua.IsDeleted
								&& !ua.User.IsDeleted
								&& !tenant.IsDeleted
							select new {
								ua.CreatedAt,
								TenantId = ua.TenantId ?? Guid.Empty,
							}
						).FirstOrDefaultAsync(cancellationToken);
						return item is not null
							? (item.CreatedAt, item.TenantId)
							: null;
					},
					applyFilter: (q, val, isAsc) => {
						if (val is null) {
							return q;
						}
						var (createdAt, tenantId) = ((DateTime, Guid))val;
						return isAsc
							? q.Where(x =>
								x.Account.CreatedAt > createdAt
								|| (x.Account.CreatedAt == createdAt
									&& x.TenantId > tenantId))
							: q.Where(x =>
								x.Account.CreatedAt < createdAt
								|| (x.Account.CreatedAt == createdAt
									&& x.TenantId < tenantId));
					},
					applyOrdering: (q, isAsc) => isAsc
						? q.OrderBy(x => x.Account.CreatedAt)
							.ThenBy(x => x.TenantId)
						: q.OrderByDescending(x => x.Account.CreatedAt)
							.ThenByDescending(x => x.TenantId)
				),
			};

		if (
			!sortFieldHandlers.TryGetValue(
				effectiveSortId,
				out CursorSortFieldHandler<TenantUserCompanyQueryRow>? handler
			)
		) {
			return new FindTenantUserCompaniesResult.InvalidSortId(
				effectiveSortId
			);
		}

		var baseQuery =
			from ua in _dbContext.UserAccount.AsNoTracking()
			join u in _dbContext.User.AsNoTracking()
				on ua.UserId equals u.Id
			join tenant in _dbContext.Tenant.AsNoTracking()
				on ua.TenantId equals tenant.Id
			where ua.UserId == userId
				&& ua.Scope == AccountScope.Tenant
				&& ua.TenantId != null
				&& !ua.IsDeleted
				&& !u.IsDeleted
				&& !tenant.IsDeleted
			select new TenantUserCompanyQueryRow {
				Account = ua,
				User = u,
				Tenant = tenant,
				TenantId = ua.TenantId ?? Guid.Empty,
			};

		// Route-resource existence is independent from cursor validity. Missing
		// tenant users must remain a 404; bad cursors for existing identities are
		// reported as 400 below.
		var hasTenantUserIdentity = await (
			from ua in _dbContext.UserAccount.IgnoreQueryFilters()
			join u in _dbContext.User.AsNoTracking()
				on ua.UserId equals u.Id
			where ua.UserId == userId
				&& ua.Scope == AccountScope.Tenant
				&& !u.IsDeleted
			select ua
		).AnyAsync(cancellationToken);

		if (!hasTenantUserIdentity) {
			return new FindTenantUserCompaniesResult.NotFound();
		}

		IQueryable<TenantUserCompanyQueryRow> query = baseQuery;
		var search = args.Filters?.Search?.Trim();
		if (!string.IsNullOrEmpty(search)) {
			var searchPattern = $"%{search}%";
			query =
				from row in query
				where EF.Functions.ILike(row.Tenant.Name, searchPattern)
					|| EF.Functions.ILike(row.Tenant.Code, searchPattern)
				select row;
		}

		var hasAnyCompany =
			await baseQuery.AnyAsync(cancellationToken);
		if (!hasAnyCompany) {
			if (args.Cursor != Guid.Empty) {
				return new FindTenantUserCompaniesResult
					.CursorNotFound(args.Cursor.ToString());
			}

			return new FindTenantUserCompaniesResult.Success(
				new CursorPaginatedResult<TenantUserCompanyData> {
					Data = [],
					NextCursor = null,
				}
			);
		}

		if (args.Cursor != Guid.Empty) {
			var cursorValue =
				await handler.GetCursorValue(args.Cursor);

			if (cursorValue is null) {
				return new FindTenantUserCompaniesResult
					.CursorNotFound(args.Cursor.ToString());
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

		var results = await orderedQuery
			.Take(effectiveLimit + 1)
			.ToListAsync(cancellationToken);

		string? nextCursor = null;
		if (results.Count > effectiveLimit) {
			results.RemoveAt(results.Count - 1);
			nextCursor = results.Last()
				.Tenant.GetRequiredId().ToString();
		}

		return new FindTenantUserCompaniesResult.Success(
			new CursorPaginatedResult<TenantUserCompanyData> {
				Data = results.Select(row => new TenantUserCompanyData {
					Account = row.Account,
					Tenant = row.Tenant,
					AccountLevel = row.Account.Level,
					UserStatus = row.User.Status,
				}).ToList(),
				NextCursor = nextCursor,
			}
		);
	}
}
