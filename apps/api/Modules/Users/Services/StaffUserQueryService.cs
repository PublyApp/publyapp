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
			["created_at"] = CursorSortFieldHandlerFactory.Create<UserAccount, DateTime, Guid>(
				cursorLookupQuery: () => _dbContext.UserAccount
					.AsNoTracking()
					.Where(ua => ua.Scope == AccountScope.Staff
						&& !ua.IsDeleted
						&& !ua.User.IsDeleted),
				keySelector: ua => ua.User.CreatedAt,
				idSelector: ua => ua.Id ?? Guid.Empty,
				cancellationToken
			),
			["updated_at"] = CursorSortFieldHandlerFactory.Create<UserAccount, DateTime, Guid>(
				cursorLookupQuery: () => _dbContext.UserAccount
					.AsNoTracking()
					.Where(ua => ua.Scope == AccountScope.Staff
						&& !ua.IsDeleted
						&& !ua.User.IsDeleted),
				keySelector: ua => ua.User.UpdatedAt,
				idSelector: ua => ua.Id ?? Guid.Empty,
				cancellationToken
			),
			["email"] = CursorSortFieldHandlerFactory.Create<UserAccount, string, Guid>(
				cursorLookupQuery: () => _dbContext.UserAccount
					.AsNoTracking()
					.Where(ua => ua.Scope == AccountScope.Staff
						&& !ua.IsDeleted
						&& !ua.User.IsDeleted),
				keySelector: ua => ua.User.Email,
				idSelector: ua => ua.Id ?? Guid.Empty,
				cancellationToken
			),
			["first_name"] = CursorSortFieldHandlerFactory.Create<UserAccount, string, Guid>(
				cursorLookupQuery: () => _dbContext.UserAccount
					.AsNoTracking()
					.Where(ua => ua.Scope == AccountScope.Staff
						&& !ua.IsDeleted
						&& !ua.User.IsDeleted),
				keySelector: ua => ua.User.FirstName ?? string.Empty,
				idSelector: ua => ua.Id ?? Guid.Empty,
				cancellationToken
			),
			["last_name"] = CursorSortFieldHandlerFactory.Create<UserAccount, string, Guid>(
				cursorLookupQuery: () => _dbContext.UserAccount
					.AsNoTracking()
					.Where(ua => ua.Scope == AccountScope.Staff
						&& !ua.IsDeleted
						&& !ua.User.IsDeleted),
				keySelector: ua => ua.User.LastName ?? string.Empty,
				idSelector: ua => ua.Id ?? Guid.Empty,
				cancellationToken
			),
			["status"] = CursorSortFieldHandlerFactory.Create<UserAccount, UserStatus, Guid>(
				cursorLookupQuery: () => _dbContext.UserAccount
					.AsNoTracking()
					.Where(ua => ua.Scope == AccountScope.Staff
						&& !ua.IsDeleted
						&& !ua.User.IsDeleted),
				keySelector: ua => ua.User.Status,
				idSelector: ua => ua.Id ?? Guid.Empty,
				cancellationToken
			),
			["level"] = CursorSortFieldHandlerFactory.Create<UserAccount, AccountLevel, Guid>(
				cursorLookupQuery: () => _dbContext.UserAccount
					.AsNoTracking()
					.Where(ua => ua.Scope == AccountScope.Staff
						&& !ua.IsDeleted
						&& !ua.User.IsDeleted),
				keySelector: ua => ua.Level,
				idSelector: ua => ua.Id ?? Guid.Empty,
				cancellationToken
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
