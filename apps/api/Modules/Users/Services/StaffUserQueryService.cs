using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Lib.Utils;
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

public interface IStaffUserQueryService {
	Task<StaffUserData?> GetStaffUserUserByIdAsync(Guid userId, CancellationToken cancellationToken = default);
	Task<int> CountStaffUsersAsync(CancellationToken cancellationToken = default);
	Task<FindStaffUsersResult> FindStaffUsersAsync(
		FindStaffUsersArgs args,
		CancellationToken cancellationToken = default
	);
}

[Service(ServiceLifetime.Scoped)]
public class StaffUserQueryService : IStaffUserQueryService {
	private readonly AppDbContext _dbContext;

	public StaffUserQueryService(AppDbContext dbContext) {
		_dbContext = dbContext;
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
				var pattern = $"%{LikePatternUtils.EscapeLikePattern(trimmed)}%";
				query =
					from ua in query
					where (ua.User.FirstName != null && EF.Functions.ILike(ua.User.FirstName, pattern, LikePatternUtils.LikeEscapeChar))
						|| (ua.User.LastName != null && EF.Functions.ILike(ua.User.LastName, pattern, LikePatternUtils.LikeEscapeChar))
						|| EF.Functions.ILike(ua.User.Email, pattern, LikePatternUtils.LikeEscapeChar)
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
}
