using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Modules.Tenants.Entities;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Modules.Users.Services;

public abstract record FindTenantUsersResult {
	public sealed record Success(
		CursorPaginatedResult<TenantUserData> Data
	) : FindTenantUsersResult;

	public sealed record CursorNotFound(
		string Cursor
	) : FindTenantUsersResult;

	public sealed record InvalidSortId(
		string SortId
	) : FindTenantUsersResult;
}

public record FindTenantUsersAsStaffFilters(
	string? Search,
	IReadOnlySet<TenantUserStatus>? Status
);

public record FindTenantUsersAsStaffArgs(
	Guid Cursor,
	int? Limit,
	string? SortId,
	SortOrder? SortOrder,
	FindTenantUsersAsStaffFilters? Filters
);

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

public class TenantUserData {
	public required User User { get; set; }
	public required UserAccount Account { get; set; }
	public required AccountLevel AccountLevel { get; set; }
}

public class TenantUserCompanyData {
	public required UserAccount Account { get; set; }
	public required Tenant Tenant { get; set; }
	public required AccountLevel AccountLevel { get; set; }
	public required UserStatus UserStatus { get; set; }
}

public class TenantUserDetailsData {
	public required User User { get; set; }
	public required int CompanyCount { get; set; }
}

public interface ITenantUserQueryService {
	Task<FindTenantUsersResult> FindTenantUsersAsync(
		Guid tenantId,
		FindTenantUsersAsStaffArgs args,
		CancellationToken cancellationToken = default
	);
	Task<TenantUserData?> GetTenantUserByIdAsync(
		Guid tenantId,
		Guid userId,
		CancellationToken cancellationToken = default
	);
	Task<TenantUserDetailsData?> GetTenantUserDetailsForStaffAsync(
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
public class TenantUserQueryService : ITenantUserQueryService {
	private sealed class TenantUserCompanyQueryRow {
		public required UserAccount Account { get; init; }
		public required User User { get; init; }
		public required Tenant Tenant { get; init; }
		public required Guid TenantId { get; init; }
	}

	private readonly AppDbContext _dbContext;

	public TenantUserQueryService(AppDbContext dbContext) {
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

	public async Task<FindTenantUsersResult>
	FindTenantUsersAsync(
		Guid tenantId,
		FindTenantUsersAsStaffArgs args,
		CancellationToken cancellationToken = default
	) {
		var effectiveLimit = args.Limit
			?? AppEnvironment.Instance.PAGINATION_DEFAULT_LIMIT;
		var effectiveSortOrder = args.SortOrder ?? SortOrder.Desc;
		var effectiveSortId = args.SortId ?? "id";

		var sortFieldHandlers =
			new Dictionary<string, CursorSortFieldHandler<UserAccount>>(
				StringComparer.OrdinalIgnoreCase
			) {
				["id"] = new CursorSortFieldHandler<UserAccount>(
					getCursorValue: async (guid) => {
						var ua = await (
							from x in _dbContext.UserAccount.AsNoTracking()
							where x.UserId == guid
								&& x.TenantId == tenantId
								&& x.Scope
									== AccountScope.Tenant
							select (Guid?)x.UserId
						).FirstOrDefaultAsync(
							cancellationToken
						);
						return ua;
					},
					applyFilter: (q, val, isAsc) => {
						var id = (Guid?)val;
						if (id is null) {
							return q;
						}
						return isAsc
							? q.Where(x => x.UserId > id)
							: q.Where(x => x.UserId < id);
					},
					applyOrdering: (q, isAsc) => isAsc
						? q.OrderBy(x => x.UserId)
						: q.OrderByDescending(
							x => x.UserId
						)
				),

				["email"] = new CursorSortFieldHandler<UserAccount>(
					getCursorValue: async (guid) => {
						var item = await (
							from x in _dbContext.UserAccount.AsNoTracking()
							where x.UserId == guid
								&& x.TenantId == tenantId
								&& x.Scope
									== AccountScope.Tenant
							select new {
								x.User.Email,
								x.UserId,
							}
						).FirstOrDefaultAsync(
							cancellationToken
						);
						return item is not null
							? (item.Email, item.UserId)
							: null;
					},
					applyFilter: (q, val, isAsc) => {
						if (val is null) {
							return q;
						}
						var (email, id) =
							((string, Guid))val;
						return isAsc
							? q.Where(x =>
								x.User.Email
									.CompareTo(
										email
									) > 0
								|| (x.User.Email == email
									&& x.UserId > id))
							: q.Where(x =>
								x.User.Email
									.CompareTo(
										email
									) < 0
								|| (x.User.Email == email
									&& x.UserId < id));
					},
					applyOrdering: (q, isAsc) => isAsc
						? q.OrderBy(x => x.User.Email)
							.ThenBy(x => x.UserId)
						: q.OrderByDescending(
							x => x.User.Email
						).ThenByDescending(
							x => x.UserId
						)
				),

				["status"] = new CursorSortFieldHandler<UserAccount>(
					getCursorValue: async (guid) => {
						var item = await (
							from x in _dbContext.UserAccount.AsNoTracking()
							where x.UserId == guid
								&& x.TenantId == tenantId
								&& x.Scope
									== AccountScope.Tenant
							select new {
								IsUserGloballySuspended = x.User.Status == UserStatus.Suspended,
								IsMembershipSuspended = x.Status == AccountStatus.Suspended,
								x.UserId,
							}
						).FirstOrDefaultAsync(
							cancellationToken
						);
						return item is not null
							? (
								GetTenantUserStatusRank(
									item.IsUserGloballySuspended,
									item.IsMembershipSuspended
								),
								item.UserId
							)
							: null;
					},
					applyFilter: (q, val, isAsc) => {
						if (val is null) {
							return q;
						}
						var (statusRank, id) =
							((int, Guid))val;
						// Keep this expression EF-translatable; do not call GetTenantStatus() here.
						return isAsc
							? q.Where(x =>
								(x.User.Status == UserStatus.Suspended
									? 2
									: x.Status == AccountStatus.Suspended
										? 1
										: 0) > statusRank
								|| (((x.User.Status == UserStatus.Suspended
										? 2
										: x.Status == AccountStatus.Suspended
											? 1
											: 0)
										== statusRank)
									&& x.UserId > id))
							: q.Where(x =>
								(x.User.Status == UserStatus.Suspended
									? 2
									: x.Status == AccountStatus.Suspended
										? 1
										: 0) < statusRank
								|| (((x.User.Status == UserStatus.Suspended
										? 2
										: x.Status == AccountStatus.Suspended
											? 1
											: 0)
										== statusRank)
									&& x.UserId < id));
					},
					// Same EF-translatable rank expression as applyFilter for stable keyset pagination.
					applyOrdering: (q, isAsc) => isAsc
						? q.OrderBy(
							x => x.User.Status == UserStatus.Suspended
								? 2
								: x.Status == AccountStatus.Suspended
									? 1
									: 0
						).ThenBy(x => x.UserId)
						: q.OrderByDescending(
							x => x.User.Status == UserStatus.Suspended
								? 2
								: x.Status == AccountStatus.Suspended
									? 1
									: 0
						).ThenByDescending(
							x => x.UserId
						)
				),

				["level"] = new CursorSortFieldHandler<UserAccount>(
					getCursorValue: async (guid) => {
						var item = await (
							from x in _dbContext.UserAccount.AsNoTracking()
							where x.UserId == guid
								&& x.TenantId == tenantId
								&& x.Scope
									== AccountScope.Tenant
							select new {
								x.Level,
								x.UserId,
							}
						).FirstOrDefaultAsync(
							cancellationToken
						);
						return item is not null
							? (item.Level, item.UserId)
							: null;
					},
					applyFilter: (q, val, isAsc) => {
						if (val is null) {
							return q;
						}
						var (level, id) =
							((AccountLevel, Guid))val;
						return isAsc
							? q.Where(x =>
								x.Level > level
								|| (x.Level == level
									&& x.UserId > id))
							: q.Where(x =>
								x.Level < level
								|| (x.Level == level
									&& x.UserId < id));
					},
					applyOrdering: (q, isAsc) => isAsc
						? q.OrderBy(
							x => x.Level
						).ThenBy(x => x.UserId)
						: q.OrderByDescending(
							x => x.Level
						).ThenByDescending(
							x => x.UserId
						)
				),

				["created_at"] = new CursorSortFieldHandler<UserAccount>(
					getCursorValue: async (guid) => {
						var item = await (
							from x in _dbContext.UserAccount.AsNoTracking()
							where x.UserId == guid
								&& x.TenantId == tenantId
								&& x.Scope
									== AccountScope.Tenant
							select new {
								x.User.CreatedAt,
								x.UserId,
							}
						).FirstOrDefaultAsync(
							cancellationToken
						);
						return item is not null
							? (item.CreatedAt, item.UserId)
							: null;
					},
					applyFilter: (q, val, isAsc) => {
						if (val is null) {
							return q;
						}
						var (createdAt, id) =
							((DateTime, Guid))val;
						return isAsc
							? q.Where(x =>
								x.User.CreatedAt
									> createdAt
								|| (x.User.CreatedAt
										== createdAt
									&& x.UserId > id))
							: q.Where(x =>
								x.User.CreatedAt
									< createdAt
								|| (x.User.CreatedAt
										== createdAt
									&& x.UserId < id));
					},
					applyOrdering: (q, isAsc) => isAsc
						? q.OrderBy(
							x => x.User.CreatedAt
						).ThenBy(x => x.UserId)
						: q.OrderByDescending(
							x => x.User.CreatedAt
						).ThenByDescending(
							x => x.UserId
						)
				),
			};

		if (
			!sortFieldHandlers.TryGetValue(
				effectiveSortId,
				out CursorSortFieldHandler<UserAccount>? handler
			)
		) {
			return new FindTenantUsersResult.InvalidSortId(
				effectiveSortId
			);
		}

		var baseQuery =
			from ua in _dbContext.UserAccount.AsNoTracking()
			where ua.TenantId == tenantId
				&& ua.Scope == AccountScope.Tenant
				&& !ua.IsDeleted
				&& !ua.User.IsDeleted
			select ua;

		IQueryable<UserAccount> query = baseQuery;

		// Apply search filter (by name or email)
		// Search semantics: substring match (ILIKE %q%) for case-insensitive search
		if (args.Filters?.Search is { } search) {
			var effectiveQ = search.Trim();
			var pattern = $"%{effectiveQ}%";
			query = query.Where(ua =>
				(ua.User.FirstName != null && EF.Functions.ILike(ua.User.FirstName, pattern)) ||
				(ua.User.LastName != null && EF.Functions.ILike(ua.User.LastName, pattern)) ||
				EF.Functions.ILike(ua.User.Email, pattern)
			);
		}

		// Apply status filter
		if (args.Filters?.Status is { } statuses && statuses.Count > 0) {
			var includesActive = statuses.Contains(TenantUserStatus.Active);
			var includesSuspended = statuses.Contains(TenantUserStatus.Suspended);
			var includesGloballySuspended = statuses.Contains(
				TenantUserStatus.GloballySuspended
			);

			query = query.Where(ua =>
				// These are effective tenant-user statuses, not only persisted account statuses.
				(includesGloballySuspended
					&& ua.User.Status == UserStatus.Suspended)
				|| (includesSuspended
					&& ua.User.Status != UserStatus.Suspended
					&& ua.Status == AccountStatus.Suspended)
				|| (includesActive
					&& ua.User.Status != UserStatus.Suspended
					&& ua.Status != AccountStatus.Suspended)
			);
		}

		if (args.Cursor != Guid.Empty) {
			var cursorValue =
				await handler.GetCursorValue(args.Cursor);

			if (cursorValue is null) {
				return new FindTenantUsersResult
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
			.Select(ua => new TenantUserData {
				User = ua.User,
				Account = ua,
				AccountLevel = ua.Level,
			})
			.Take(effectiveLimit + 1)
			.ToListAsync(cancellationToken);

		string? nextCursor = null;
		if (results.Count > effectiveLimit) {
			results.RemoveAt(results.Count - 1);
			nextCursor = results.Last()
				.User.GetRequiredId().ToString();
		}

		return new FindTenantUsersResult.Success(
			new CursorPaginatedResult<TenantUserData> {
				Data = results,
				NextCursor = nextCursor,
			}
		);
	}

	public async Task<TenantUserData?> GetTenantUserByIdAsync(
		Guid tenantId,
		Guid userId,
		CancellationToken cancellationToken = default
	) {
		return await (
			from ua in _dbContext.UserAccount.AsNoTracking()
			where ua.TenantId == tenantId
				&& ua.UserId == userId
				&& ua.Scope == AccountScope.Tenant
				&& !ua.IsDeleted
				&& !ua.User.IsDeleted
			select new TenantUserData {
				User = ua.User,
				Account = ua,
				AccountLevel = ua.Level,
			}
		).FirstOrDefaultAsync(cancellationToken);
	}

	public async Task<TenantUserDetailsData?> GetTenantUserDetailsForStaffAsync(
		Guid userId,
		CancellationToken cancellationToken = default
	) {
		return await TenantUserDetailsQueries.GetForStaffAsync(
			_dbContext,
			userId,
			cancellationToken
		);
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
