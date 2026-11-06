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

	// Assigned staff profile names, loaded in one batched query per page (no
	// N+1): the « Profils » column reads them as pills.
	public List<string> ProfileNames { get; set; } = [];
}

public sealed record StaffUserCounts(
	int Total,
	int Active,
	int Suspended,
	int Admins,
	int Users,
	int ConnectedToday,
	int OpenSessions
);

public abstract record FindStaffUsersResult {
	public sealed record Success(
		CursorPaginatedResult<StaffUserData> Data,
		StaffUserCounts Counts
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
	private readonly AppDbContext _DbContext;

	public StaffUserQueryService(AppDbContext dbContext) {
		this._DbContext = dbContext;
	}

	public async Task<StaffUserData?> GetStaffUserUserByIdAsync(
		Guid userId,
		CancellationToken cancellationToken = default
	) {
		// NOTE: We intentionally do NOT filter out suspended staff users here.
		// Staff must be able to view a suspended user to be able to reactivate them
		// (and to audit "who is suspended and why"). Soft-deleted records remain hidden.
		return await (
			from ua in this._DbContext.UserAccount.AsNoTracking()
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
			from ua in this._DbContext.UserAccount
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
		cursorLookupQuery: () => this._DbContext.UserAccount
			.AsNoTracking()
			.Where(ua => ua.Scope == AccountScope.Staff
				&& !ua.IsDeleted
				&& !ua.User.IsDeleted),
		keySelector: ua => ua.User.CreatedAt,
		idSelector: ua => ua.UserId,
		cancellationToken
	),
			["updated_at"] = CursorSortFieldHandlerFactory.Create<UserAccount, DateTime, Guid>(
		cursorLookupQuery: () => this._DbContext.UserAccount
			.AsNoTracking()
			.Where(ua => ua.Scope == AccountScope.Staff
				&& !ua.IsDeleted
				&& !ua.User.IsDeleted),
		keySelector: ua => ua.User.UpdatedAt,
		idSelector: ua => ua.UserId,
		cancellationToken
	),
			["email"] = CursorSortFieldHandlerFactory.Create<UserAccount, string, Guid>(
		cursorLookupQuery: () => this._DbContext.UserAccount
			.AsNoTracking()
			.Where(ua => ua.Scope == AccountScope.Staff
				&& !ua.IsDeleted
				&& !ua.User.IsDeleted),
		keySelector: ua => ua.User.Email,
		idSelector: ua => ua.UserId,
		cancellationToken
	),
			["first_name"] = CursorSortFieldHandlerFactory.Create<UserAccount, string, Guid>(
		cursorLookupQuery: () => this._DbContext.UserAccount
			.AsNoTracking()
			.Where(ua => ua.Scope == AccountScope.Staff
				&& !ua.IsDeleted
				&& !ua.User.IsDeleted),
		keySelector: ua => ua.User.FirstName ?? string.Empty,
		idSelector: ua => ua.UserId,
		cancellationToken
	),
			["last_name"] = CursorSortFieldHandlerFactory.Create<UserAccount, string, Guid>(
		cursorLookupQuery: () => this._DbContext.UserAccount
			.AsNoTracking()
			.Where(ua => ua.Scope == AccountScope.Staff
				&& !ua.IsDeleted
				&& !ua.User.IsDeleted),
		keySelector: ua => ua.User.LastName ?? string.Empty,
		idSelector: ua => ua.UserId,
		cancellationToken
	),
			["status"] = CursorSortFieldHandlerFactory.Create<UserAccount, UserStatus, Guid>(
		cursorLookupQuery: () => this._DbContext.UserAccount
			.AsNoTracking()
			.Where(ua => ua.Scope == AccountScope.Staff
				&& !ua.IsDeleted
				&& !ua.User.IsDeleted),
		keySelector: ua => ua.User.Status,
		idSelector: ua => ua.UserId,
		cancellationToken
	),
			["level"] = CursorSortFieldHandlerFactory.Create<UserAccount, AccountLevel, Guid>(
		cursorLookupQuery: () => this._DbContext.UserAccount
			.AsNoTracking()
			.Where(ua => ua.Scope == AccountScope.Staff
				&& !ua.IsDeleted
				&& !ua.User.IsDeleted),
		keySelector: ua => ua.Level,
		idSelector: ua => ua.UserId,
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
			from ua in this._DbContext.UserAccount.AsNoTracking()
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
				// The search box names the role too: "admin" / "user" match the
				// account level, not only a name fragment.
				var wantsAdmin = string.Equals(trimmed, "admin", StringComparison.OrdinalIgnoreCase)
					|| string.Equals(trimmed, nameof(AccountLevel.Admin), StringComparison.OrdinalIgnoreCase);
				var wantsUser = string.Equals(trimmed, "user", StringComparison.OrdinalIgnoreCase)
					|| string.Equals(trimmed, nameof(AccountLevel.User), StringComparison.OrdinalIgnoreCase);
				query =
					from ua in query
					where (ua.User.FirstName != null && EF.Functions.ILike(ua.User.FirstName, pattern, LikePatternUtils.LikeEscapeChar))
						|| (ua.User.LastName != null && EF.Functions.ILike(ua.User.LastName, pattern, LikePatternUtils.LikeEscapeChar))
						|| EF.Functions.ILike(ua.User.Email, pattern, LikePatternUtils.LikeEscapeChar)
						|| (wantsAdmin && ua.Level == AccountLevel.Admin)
						|| (wantsUser && ua.Level == AccountLevel.User)
					select ua;
			}
		}

		if (args.Filters?.Status is { Count: > 0 } statuses) {
			query =
				from ua in query
				where statuses.Contains(ua.User.Status)
				select ua;
		}

		// Facets cover the whole filtered collection (cursor and page size are
		// pagination only, never a filter).
		var facetRows = await (
			from ua in query
			group ua by new { ua.User.Status, ua.Level } into g
			select new { g.Key.Status, g.Key.Level, Count = g.Count() }
		).ToListAsync(cancellationToken);

		var total = 0;
		var active = 0;
		var suspended = 0;
		var admins = 0;
		foreach (var facet in facetRows) {
			total += facet.Count;
			if (facet.Status == UserStatus.Active) {
				active += facet.Count;
			} else if (facet.Status == UserStatus.Suspended) {
				suspended += facet.Count;
			}
			if (facet.Level == AccountLevel.Admin) {
				admins += facet.Count;
			}
		}

		// Sessions are the only activity the database records (created_at /
		// expires_at); there is no last-activity or MFA column. « Connectés
		// aujourd'hui » is therefore the users with a session opened since
		// midnight UTC, and the open-session figure the still-valid ones.
		var now = DateTime.UtcNow;
		var todayStart = now.Date;
		var filteredUserIds = query.Select(ua => ua.UserId);
		var openSessions = await (
			from session in this._DbContext.Session.AsNoTracking()
			where session.ExpiresAt > now
				&& filteredUserIds.Contains(session.UserId)
			select session
		).CountAsync(cancellationToken);
		var connectedToday = await (
			from session in this._DbContext.Session.AsNoTracking()
			where session.CreatedAt >= todayStart
				&& filteredUserIds.Contains(session.UserId)
			select session.UserId
		).Distinct().CountAsync(cancellationToken);

		var counts = new StaffUserCounts(
			Total: total,
			Active: active,
			Suspended: suspended,
			Admins: admins,
			Users: total - admins,
			ConnectedToday: connectedToday,
			OpenSessions: openSessions
		);

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

		// One batched profile query for the whole page, never one per row.
		var pageUserIds = results
			.Select(staffUser => staffUser.User.GetRequiredId())
			.ToList();
		var profileRows = await (
			from accountProfile in this._DbContext.UserAccountProfile.AsNoTracking()
			join account in this._DbContext.UserAccount.AsNoTracking()
				on (Guid?)accountProfile.UserAccountId equals account.Id
			join profile in this._DbContext.Profile.AsNoTracking()
				on (Guid?)accountProfile.ProfileId equals profile.Id
			where account.Scope == AccountScope.Staff
				&& pageUserIds.Contains(account.UserId)
				&& !profile.IsDeleted
			select new {
				account.UserId,
				profile.Name,
			}
		).ToListAsync(cancellationToken);

		var profileNamesByUser = new Dictionary<Guid, List<string>>();
		foreach (var row in profileRows) {
			if (!profileNamesByUser.TryGetValue(row.UserId, out var names)) {
				names = [];
				profileNamesByUser[row.UserId] = names;
			}
			names.Add(row.Name);
		}

		foreach (var staffUser in results) {
			if (profileNamesByUser.TryGetValue(
				staffUser.User.GetRequiredId(),
				out var names
			)) {
				names.Sort(StringComparer.OrdinalIgnoreCase);
				staffUser.ProfileNames = names;
			}
		}

		return new FindStaffUsersResult.Success(
			new CursorPaginatedResult<StaffUserData> {
				Data = results,
				NextCursor = nextCursor,
			},
			counts
		);
	}
}
