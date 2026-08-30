using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Lib.Utils;
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
	IReadOnlySet<TenantUserStatus>? Status,
	IReadOnlySet<AccountLevel>? Level
);

public record FindTenantUsersAsStaffArgs(
	Guid Cursor,
	int? Limit,
	string? SortId,
	SortOrder? SortOrder,
	FindTenantUsersAsStaffFilters? Filters
);

public class TenantUserData {
	public required User User { get; set; }
	public required UserAccount Account { get; set; }
	public required AccountLevel AccountLevel { get; set; }
}

public class TenantUserDetailsData {
	public required User User { get; set; }
	public required int CompanyCount { get; set; }
}

public record ExportTenantUsersArgs(
	string? Search,
	IReadOnlySet<TenantUserStatus>? Status,
	IReadOnlySet<AccountLevel>? Level,
	IReadOnlySet<Guid>? Ids,
	int Limit
);

public record TenantUserExportItem {
	public required string Email { get; init; }
	public string? FirstName { get; init; }
	public string? LastName { get; init; }
	public required AccountLevel Level { get; init; }
	public required TenantUserStatus Status { get; init; }
	public required DateTime CreatedAt { get; init; }
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
	Task<List<TenantUserExportItem>> FindExportRowsAsync(
		Guid tenantId,
		ExportTenantUsersArgs args,
		CancellationToken cancellationToken = default
	);
}

[Service(ServiceLifetime.Scoped)]
public class TenantUserQueryService : ITenantUserQueryService {
	private readonly AppDbContext _dbContext;

	public TenantUserQueryService(AppDbContext dbContext) {
		_dbContext = dbContext;
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
		["id"] = CursorSortFieldHandlerFactory.Create<UserAccount, Guid, Guid>(
		cursorLookupQuery: () => _dbContext.UserAccount
			.AsNoTracking()
			.Where(x => x.TenantId == tenantId
				&& x.Scope == AccountScope.Tenant),
		keySelector: x => x.UserId,
		idSelector: x => x.UserId,
		cancellationToken
	),
		["email"] = CursorSortFieldHandlerFactory.Create<UserAccount, string, Guid>(
		cursorLookupQuery: () => _dbContext.UserAccount
			.AsNoTracking()
			.Where(x => x.TenantId == tenantId
				&& x.Scope == AccountScope.Tenant),
		keySelector: x => x.User.Email,
		idSelector: x => x.UserId,
		cancellationToken
	),
		["status"] = CursorSortFieldHandlerFactory.Create<UserAccount, int, Guid>(
		cursorLookupQuery: () => _dbContext.UserAccount
			.AsNoTracking()
			.Where(x => x.TenantId == tenantId
				&& x.Scope == AccountScope.Tenant),
		keySelector: x => x.User.Status == UserStatus.Suspended ? 2 : x.Status == AccountStatus.Suspended ? 1 : 0,
		idSelector: x => x.UserId,
		cancellationToken
	),
		["level"] = CursorSortFieldHandlerFactory.Create<UserAccount, AccountLevel, Guid>(
		cursorLookupQuery: () => _dbContext.UserAccount
			.AsNoTracking()
			.Where(x => x.TenantId == tenantId
				&& x.Scope == AccountScope.Tenant),
		keySelector: x => x.Level,
		idSelector: x => x.UserId,
		cancellationToken
	),
		["created_at"] = CursorSortFieldHandlerFactory.Create<UserAccount, DateTime, Guid>(
		cursorLookupQuery: () => _dbContext.UserAccount
			.AsNoTracking()
			.Where(x => x.TenantId == tenantId
				&& x.Scope == AccountScope.Tenant),
		keySelector: x => x.User.CreatedAt,
		idSelector: x => x.UserId,
		cancellationToken
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
		// Search semantics: substring match (ILIKE %q%) for case-insensitive search.
		// The literal is escaped so a caller-supplied '%' or '_' cannot widen the match
		// beyond an actual substring (see EscapeLikePattern).
		if (args.Filters?.Search is { } search) {
			var effectiveQ = search.Trim();
			var pattern = $"%{LikePatternUtils.EscapeLikePattern(effectiveQ)}%";
			query = query.Where(ua =>
				(ua.User.FirstName != null && EF.Functions.ILike(ua.User.FirstName, pattern, LikePatternUtils.LikeEscapeChar)) ||
				(ua.User.LastName != null && EF.Functions.ILike(ua.User.LastName, pattern, LikePatternUtils.LikeEscapeChar)) ||
				EF.Functions.ILike(ua.User.Email, pattern, LikePatternUtils.LikeEscapeChar)
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

		// Apply level filter
		if (args.Filters?.Level is { } levels && levels.Count > 0) {
			query = query.Where(ua => levels.Contains(ua.Level));
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

	public async Task<List<TenantUserExportItem>> FindExportRowsAsync(
		Guid tenantId,
		ExportTenantUsersArgs args,
		CancellationToken cancellationToken = default
	) {
		var query = ApplyExportFilters(BuildExportBaseQuery(tenantId), args);

		return await (
			from ua in query
			orderby ua.User.CreatedAt descending, ua.UserId descending
			select new TenantUserExportItem {
				Email = ua.User.Email,
				FirstName = ua.User.FirstName,
				LastName = ua.User.LastName,
				Level = ua.Level,
				Status = UserAccount.GetTenantStatus(ua.User.Status, ua.Status),
				CreatedAt = ua.User.CreatedAt,
			}
		).Take(args.Limit).ToListAsync(cancellationToken);
	}

	private IQueryable<UserAccount> BuildExportBaseQuery(Guid tenantId) {
		return
			from ua in _dbContext.UserAccount.AsNoTracking()
			where ua.TenantId == tenantId
				&& ua.Scope == AccountScope.Tenant
				&& !ua.IsDeleted
				&& !ua.User.IsDeleted
			select ua;
	}

	private static IQueryable<UserAccount> ApplyExportFilters(
		IQueryable<UserAccount> query,
		ExportTenantUsersArgs args
	) {
		if (args.Search is { } search) {
			var pattern = $"%{LikePatternUtils.EscapeLikePattern(search)}%";
			query = query.Where(ua =>
				(ua.User.FirstName != null && EF.Functions.ILike(ua.User.FirstName, pattern, LikePatternUtils.LikeEscapeChar)) ||
				(ua.User.LastName != null && EF.Functions.ILike(ua.User.LastName, pattern, LikePatternUtils.LikeEscapeChar)) ||
				EF.Functions.ILike(ua.User.Email, pattern, LikePatternUtils.LikeEscapeChar)
			);
		}

		if (args.Status is { Count: > 0 } statuses) {
			var includesActive = statuses.Contains(TenantUserStatus.Active);
			var includesSuspended = statuses.Contains(TenantUserStatus.Suspended);
			var includesGloballySuspended = statuses.Contains(
				TenantUserStatus.GloballySuspended
			);

			query = query.Where(ua =>
				(includesGloballySuspended && ua.User.Status == UserStatus.Suspended)
				|| (includesSuspended
					&& ua.User.Status != UserStatus.Suspended
					&& ua.Status == AccountStatus.Suspended)
				|| (includesActive
					&& ua.User.Status != UserStatus.Suspended
					&& ua.Status != AccountStatus.Suspended)
			);
		}

		if (args.Level is { Count: > 0 } levels) {
			query = query.Where(ua => levels.Contains(ua.Level));
		}

		if (args.Ids is { Count: > 0 } ids) {
			query = query.Where(ua => ids.Contains(ua.UserId));
		}

		return query;
	}
}
