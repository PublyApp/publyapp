using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Modules.Users.Services;

public class StaffUserData {
	public required User User { get; set; }
	// Full access is carried by a protected system role, never a level.
	public bool IsFullAccess { get; set; }

	// Assigned role names, loaded in one batched query per page (no N+1): the
	// « Rôles » column reads them as pills.
	public List<string> Roles { get; set; } = [];
}

public sealed record StaffUserCounts(
	int Total,
	int Active,
	int Suspended,
	int FullAccess,
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
				IsFullAccess = this._DbContext.UserAccountRole.Any(uap =>
					uap.UserAccountId == ua.Id
					&& !uap.Role.IsDeleted
					&& uap.Role.IsFullAccess),
				Roles = (
					from uap in this._DbContext.UserAccountRole
					join p in this._DbContext.Role on uap.RoleId equals p.Id
					where uap.UserAccountId == ua.Id && !p.IsDeleted
					orderby p.Name
					select p.Name
				).ToList()
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
			["is_full_access"] = CursorSortFieldHandlerFactory.Create<UserAccount, bool, Guid>(
		cursorLookupQuery: () => this._DbContext.UserAccount
			.AsNoTracking()
			.Where(ua => ua.Scope == AccountScope.Staff
				&& !ua.IsDeleted
				&& !ua.User.IsDeleted),
		keySelector: ua => this._DbContext.UserAccountRole.Any(uap =>
			uap.UserAccountId == ua.Id
			&& !uap.Role.IsDeleted
			&& uap.Role.IsFullAccess),
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

		// Facets cover the whole filtered collection (cursor and page size are
		// pagination only, never a filter).
		var facetRows = await (
			from ua in query
			group ua by ua.User.Status into g
			select new { Status = g.Key, Count = g.Count() }
		).ToListAsync(cancellationToken);

		var total = 0;
		var active = 0;
		var suspended = 0;
		foreach (var facet in facetRows) {
			total += facet.Count;
			if (facet.Status == UserStatus.Active) {
				active += facet.Count;
			} else if (facet.Status == UserStatus.Suspended) {
				suspended += facet.Count;
			}
		}

		// Full access is a protected system role, not a level: count the accounts
		// holding it over the same filtered collection.
		var fullAccess = await query.CountAsync(
			ua => this._DbContext.UserAccountRole.Any(uap =>
				uap.UserAccountId == ua.Id
				&& !uap.Role.IsDeleted
				&& uap.Role.IsFullAccess),
			cancellationToken
		);

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
			FullAccess: fullAccess,
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
				IsFullAccess = this._DbContext.UserAccountRole.Any(uap =>
					uap.UserAccountId == ua.Id
					&& !uap.Role.IsDeleted
					&& uap.Role.IsFullAccess),
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

		// One batched role query for the whole page, never one per row.
		var pageUserIds = results
			.Select(staffUser => staffUser.User.GetRequiredId())
			.ToList();
		var roleRows = await (
			from accountRole in this._DbContext.UserAccountRole.AsNoTracking()
			join account in this._DbContext.UserAccount.AsNoTracking()
				on (Guid?)accountRole.UserAccountId equals account.Id
			join role in this._DbContext.Role.AsNoTracking()
				on (Guid?)accountRole.RoleId equals role.Id
			where account.Scope == AccountScope.Staff
				&& pageUserIds.Contains(account.UserId)
				&& !role.IsDeleted
			select new {
				account.UserId,
				role.Name,
			}
		).ToListAsync(cancellationToken);

		var roleNamesByUser = new Dictionary<Guid, List<string>>();
		foreach (var row in roleRows) {
			if (!roleNamesByUser.TryGetValue(row.UserId, out var names)) {
				names = [];
				roleNamesByUser[row.UserId] = names;
			}
			names.Add(row.Name);
		}

		foreach (var staffUser in results) {
			if (roleNamesByUser.TryGetValue(
				staffUser.User.GetRequiredId(),
				out var names
			)) {
				names.Sort(StringComparer.OrdinalIgnoreCase);
				staffUser.Roles = names;
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
