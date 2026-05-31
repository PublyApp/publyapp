using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Modules.Tenants.Entities;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Modules.Users.Services;

public class StaffUserData {
	public required User User { get; set; }
	public required AccountLevel AccountLevel { get; set; }
}

public abstract record FindStaffUsersResult {
	public sealed record Success(
		CursorPaginatedResult<StaffUserData> Data
	) : FindStaffUsersResult;

	public sealed record CursorNotFound(
		string Cursor
	) : FindStaffUsersResult;

	public sealed record InvalidSortId(
		string SortId
	) : FindStaffUsersResult;
}

public sealed record FindStaffUsersFilters(
	string? Search,
	IReadOnlySet<UserStatus>? Status
);

public sealed record FindStaffUsersArgs(
	Guid Cursor,
	int? Limit,
	string? SortId,
	SortOrder? SortOrder,
	FindStaffUsersFilters? Filters
);

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

public interface IUserQueryService {
	Task<StaffUserData?> GetStaffUserUserByIdAsync(Guid userId, CancellationToken cancellationToken = default);
	Task<int> CountStaffUsersAsync(CancellationToken cancellationToken = default);
	Task<FindStaffUsersResult> FindStaffUsersAsync(
		FindStaffUsersArgs args,
		CancellationToken cancellationToken = default
	);
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
public class UserQueryService : IUserQueryService {
	private sealed class TenantUserCompanyQueryRow {
		public required UserAccount Account { get; init; }
		public required User User { get; init; }
		public required Tenant Tenant { get; init; }
		public required Guid TenantId { get; init; }
	}

	private readonly AppDbContext _dbContext;

	public UserQueryService(AppDbContext dbContext) {
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

	public async Task<StaffUserData?> GetStaffUserUserByIdAsync(
		Guid userId,
		CancellationToken cancellationToken = default
	) {
		// NOTE: We intentionally do NOT filter out suspended staff users here.
		// Staff must be able to view a suspended user to be able to reactivate them
		// (and to audit "who is suspended and why"). Soft-deleted records remain hidden.
		return await (
			from ua in _dbContext.UserAccount.AsNoTracking()
			where ua.UserId == userId
				&& ua.Scope == AccountScope.Staff
				&& !ua.IsDeleted
				&& !ua.User.IsDeleted
			select new StaffUserData {
				User = ua.User,
				AccountLevel = ua.Level
			}
		).FirstOrDefaultAsync(cancellationToken);
	}

	public async Task<int> CountStaffUsersAsync(CancellationToken cancellationToken = default) {
		// For staff admin screens, we count all staff users (including suspended) so staff can
		// see who exists even if they are currently suspended. Soft-deleted records stay hidden.
		var query =
			from ua in _dbContext.UserAccount
			where ua.Scope == AccountScope.Staff
				&& !ua.IsDeleted
				&& !ua.User.IsDeleted
			select ua.User;
		return await query.CountAsync(cancellationToken);
	}

	public async Task<FindStaffUsersResult> FindStaffUsersAsync(
		FindStaffUsersArgs args,
		CancellationToken cancellationToken = default
	) {
		// Staff discovery intentionally includes suspended users so admins can
		// search, audit, and reactivate them from the same list.
		var effectiveLimit = args.Limit ?? AppEnvironment.Instance.PAGINATION_DEFAULT_LIMIT;
		var effectiveSortId = args.SortId ?? "created_at";
		var effectiveSortOrder = args.SortOrder ?? SortOrder.Desc;
		var isAsc = effectiveSortOrder == SortOrder.Asc;

		var sortFieldHandlers = new Dictionary<string, CursorSortFieldHandler<UserAccount>>(
			StringComparer.OrdinalIgnoreCase
		) {
			["created_at"] = new CursorSortFieldHandler<UserAccount>(
				getCursorValue: async guid => {
					var item =
						await (
							from ua in _dbContext.UserAccount.AsNoTracking()
							where ua.UserId == guid
								&& ua.Scope == AccountScope.Staff
								&& !ua.IsDeleted
								&& !ua.User.IsDeleted
							select new {
								ua.User.CreatedAt,
								ua.UserId,
							}
						).FirstOrDefaultAsync(cancellationToken);
					return item is not null
						? (item.CreatedAt, item.UserId)
						: null;
				},
				applyFilter: (q, cursorValue, asc) => {
					if (cursorValue is null) {
						return q;
					}

					var (cursorCreatedAt, cursorId) = ((DateTime, Guid))cursorValue;
					return asc
						? from ua in q
							where ua.User.CreatedAt > cursorCreatedAt
								|| (ua.User.CreatedAt == cursorCreatedAt
									&& ua.UserId > cursorId)
							select ua
						: from ua in q
							where ua.User.CreatedAt < cursorCreatedAt
								|| (ua.User.CreatedAt == cursorCreatedAt
									&& ua.UserId < cursorId)
							select ua;
				},
				applyOrdering: (q, asc) => asc
					? from ua in q
						orderby ua.User.CreatedAt, ua.UserId
						select ua
					: from ua in q
						orderby ua.User.CreatedAt descending, ua.UserId descending
						select ua
			),
			["updated_at"] = new CursorSortFieldHandler<UserAccount>(
				getCursorValue: async guid => {
					var item =
						await (
							from ua in _dbContext.UserAccount.AsNoTracking()
							where ua.UserId == guid
								&& ua.Scope == AccountScope.Staff
								&& !ua.IsDeleted
								&& !ua.User.IsDeleted
							select new {
								ua.User.UpdatedAt,
								ua.UserId,
							}
						).FirstOrDefaultAsync(cancellationToken);
					return item is not null
						? (item.UpdatedAt, item.UserId)
						: null;
				},
				applyFilter: (q, cursorValue, asc) => {
					if (cursorValue is null) {
						return q;
					}

					var (cursorUpdatedAt, cursorId) = ((DateTime, Guid))cursorValue;
					return asc
						? from ua in q
							where ua.User.UpdatedAt > cursorUpdatedAt
								|| (ua.User.UpdatedAt == cursorUpdatedAt
									&& ua.UserId > cursorId)
							select ua
						: from ua in q
							where ua.User.UpdatedAt < cursorUpdatedAt
								|| (ua.User.UpdatedAt == cursorUpdatedAt
									&& ua.UserId < cursorId)
							select ua;
				},
				applyOrdering: (q, asc) => asc
					? from ua in q
						orderby ua.User.UpdatedAt, ua.UserId
						select ua
					: from ua in q
						orderby ua.User.UpdatedAt descending, ua.UserId descending
						select ua
			),
			["email"] = new CursorSortFieldHandler<UserAccount>(
				getCursorValue: async guid => {
					var item =
						await (
							from ua in _dbContext.UserAccount.AsNoTracking()
							where ua.UserId == guid
								&& ua.Scope == AccountScope.Staff
								&& !ua.IsDeleted
								&& !ua.User.IsDeleted
							select new {
								ua.User.Email,
								ua.UserId,
							}
						).FirstOrDefaultAsync(cancellationToken);
					return item is not null
						? (item.Email, item.UserId)
						: null;
				},
				applyFilter: (q, cursorValue, asc) => {
					if (cursorValue is null) {
						return q;
					}

					var (cursorEmail, cursorId) = ((string, Guid))cursorValue;
					return asc
						? from ua in q
							where ua.User.Email.CompareTo(cursorEmail) > 0
								|| (ua.User.Email == cursorEmail && ua.UserId > cursorId)
							select ua
						: from ua in q
							where ua.User.Email.CompareTo(cursorEmail) < 0
								|| (ua.User.Email == cursorEmail && ua.UserId < cursorId)
							select ua;
				},
				applyOrdering: (q, asc) => asc
					? from ua in q
						orderby ua.User.Email, ua.UserId
						select ua
					: from ua in q
						orderby ua.User.Email descending, ua.UserId descending
						select ua
			),
			["first_name"] = new CursorSortFieldHandler<UserAccount>(
				getCursorValue: async guid => {
					var item =
						await (
							from ua in _dbContext.UserAccount.AsNoTracking()
							where ua.UserId == guid
								&& ua.Scope == AccountScope.Staff
								&& !ua.IsDeleted
								&& !ua.User.IsDeleted
							select new {
								FirstName = ua.User.FirstName ?? string.Empty,
								ua.UserId,
							}
						).FirstOrDefaultAsync(cancellationToken);
					return item is not null
						? (item.FirstName, item.UserId)
						: null;
				},
				applyFilter: (q, cursorValue, asc) => {
					if (cursorValue is null) {
						return q;
					}

					var (cursorFirstName, cursorId) = ((string, Guid))cursorValue;
					return asc
						? from ua in q
							let firstName = ua.User.FirstName ?? string.Empty
							where firstName.CompareTo(cursorFirstName) > 0
								|| (firstName == cursorFirstName && ua.UserId > cursorId)
							select ua
						: from ua in q
							let firstName = ua.User.FirstName ?? string.Empty
							where firstName.CompareTo(cursorFirstName) < 0
								|| (firstName == cursorFirstName && ua.UserId < cursorId)
							select ua;
				},
				applyOrdering: (q, asc) => asc
					? from ua in q
						let firstName = ua.User.FirstName ?? string.Empty
						orderby firstName, ua.UserId
						select ua
					: from ua in q
						let firstName = ua.User.FirstName ?? string.Empty
						orderby firstName descending, ua.UserId descending
						select ua
			),
			["last_name"] = new CursorSortFieldHandler<UserAccount>(
				getCursorValue: async guid => {
					var item =
						await (
							from ua in _dbContext.UserAccount.AsNoTracking()
							where ua.UserId == guid
								&& ua.Scope == AccountScope.Staff
								&& !ua.IsDeleted
								&& !ua.User.IsDeleted
							select new {
								LastName = ua.User.LastName ?? string.Empty,
								ua.UserId,
							}
						).FirstOrDefaultAsync(cancellationToken);
					return item is not null
						? (item.LastName, item.UserId)
						: null;
				},
				applyFilter: (q, cursorValue, asc) => {
					if (cursorValue is null) {
						return q;
					}

					var (cursorLastName, cursorId) = ((string, Guid))cursorValue;
					return asc
						? from ua in q
							let lastName = ua.User.LastName ?? string.Empty
							where lastName.CompareTo(cursorLastName) > 0
								|| (lastName == cursorLastName && ua.UserId > cursorId)
							select ua
						: from ua in q
							let lastName = ua.User.LastName ?? string.Empty
							where lastName.CompareTo(cursorLastName) < 0
								|| (lastName == cursorLastName && ua.UserId < cursorId)
							select ua;
				},
				applyOrdering: (q, asc) => asc
					? from ua in q
						let lastName = ua.User.LastName ?? string.Empty
						orderby lastName, ua.UserId
						select ua
					: from ua in q
						let lastName = ua.User.LastName ?? string.Empty
						orderby lastName descending, ua.UserId descending
						select ua
			),
			["status"] = new CursorSortFieldHandler<UserAccount>(
				getCursorValue: async guid => {
					var item =
						await (
							from ua in _dbContext.UserAccount.AsNoTracking()
							where ua.UserId == guid
								&& ua.Scope == AccountScope.Staff
								&& !ua.IsDeleted
								&& !ua.User.IsDeleted
							select new {
								ua.User.Status,
								ua.UserId,
							}
						).FirstOrDefaultAsync(cancellationToken);
					return item is not null
						? (item.Status, item.UserId)
						: null;
				},
				applyFilter: (q, cursorValue, asc) => {
					if (cursorValue is null) {
						return q;
					}

					var (cursorStatus, cursorId) = ((UserStatus, Guid))cursorValue;
					return asc
						? from ua in q
							where ua.User.Status > cursorStatus
								|| (ua.User.Status == cursorStatus && ua.UserId > cursorId)
							select ua
						: from ua in q
							where ua.User.Status < cursorStatus
								|| (ua.User.Status == cursorStatus && ua.UserId < cursorId)
							select ua;
				},
				applyOrdering: (q, asc) => asc
					? from ua in q
						orderby ua.User.Status, ua.UserId
						select ua
					: from ua in q
						orderby ua.User.Status descending, ua.UserId descending
						select ua
			),
			["level"] = new CursorSortFieldHandler<UserAccount>(
				getCursorValue: async guid => {
					var item =
						await (
							from ua in _dbContext.UserAccount.AsNoTracking()
							where ua.UserId == guid
								&& ua.Scope == AccountScope.Staff
								&& !ua.IsDeleted
								&& !ua.User.IsDeleted
							select new {
								ua.Level,
								ua.UserId,
							}
						).FirstOrDefaultAsync(cancellationToken);
					return item is not null
						? (item.Level, item.UserId)
						: null;
				},
				applyFilter: (q, cursorValue, asc) => {
					if (cursorValue is null) {
						return q;
					}

					var (cursorLevel, cursorId) = ((AccountLevel, Guid))cursorValue;
					return asc
						? from ua in q
							where ua.Level > cursorLevel
								|| (ua.Level == cursorLevel && ua.UserId > cursorId)
							select ua
						: from ua in q
							where ua.Level < cursorLevel
								|| (ua.Level == cursorLevel && ua.UserId < cursorId)
							select ua;
				},
				applyOrdering: (q, asc) => asc
					? from ua in q
						orderby ua.Level, ua.UserId
						select ua
					: from ua in q
						orderby ua.Level descending, ua.UserId descending
						select ua
			),
		};

		if (
			!sortFieldHandlers.TryGetValue(
				effectiveSortId,
				out CursorSortFieldHandler<UserAccount>? handler
			)
		) {
			return new FindStaffUsersResult.InvalidSortId(
				effectiveSortId
			);
		}

		var baseQuery =
			from ua in _dbContext.UserAccount.AsNoTracking()
			where ua.Scope == AccountScope.Staff
				&& !ua.IsDeleted
				&& !ua.User.IsDeleted
			select ua;

		IQueryable<UserAccount> query = baseQuery;

		if (args.Filters?.Search is { } search) {
			var trimmed = search.Trim();
			if (trimmed.Length > 0) {
				// Search is intentionally substring-based so staff can quickly find
				// records by partial email or name fragments.
				var pattern = $"%{trimmed}%";
				query =
					from ua in query
					where (ua.User.FirstName != null && EF.Functions.ILike(ua.User.FirstName, pattern))
						|| (ua.User.LastName != null && EF.Functions.ILike(ua.User.LastName, pattern))
						|| EF.Functions.ILike(ua.User.Email, pattern)
					select ua;
			}
		}

		if (args.Filters?.Status is { Count: > 0 } statuses) {
			query =
				from ua in query
				where statuses.Contains(ua.User.Status)
				select ua;
		}

		if (args.Cursor != Guid.Empty) {
			var cursorValue = await handler.GetCursorValue(args.Cursor);
			if (cursorValue is null) {
				return new FindStaffUsersResult.CursorNotFound(
					args.Cursor.ToString()
				);
			}

			query = handler.ApplyFilter(query, cursorValue, isAsc);
		}

		var orderedQuery = handler.ApplyOrdering(query, isAsc);
		var results = await (
			from ua in orderedQuery
			select new StaffUserData {
				User = ua.User,
				AccountLevel = ua.Level
			}
		)
			.Take(effectiveLimit + 1)
			.ToListAsync(cancellationToken);

		string? nextCursor = null;
		if (results.Count > effectiveLimit) {
			// Fetch one extra row so we can emit the next cursor without a separate count query.
			results.RemoveAt(results.Count - 1);
			nextCursor = results.Last().User.GetRequiredId().ToString();
		}

		return new FindStaffUsersResult.Success(
			new CursorPaginatedResult<StaffUserData> {
				Data = results,
				NextCursor = nextCursor,
			}
		);
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
