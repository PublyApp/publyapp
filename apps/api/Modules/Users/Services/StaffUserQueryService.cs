using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Invitations.Entities;
using PublyApp.Api.Modules.Roles.Services;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Modules.Users.Services;

public class StaffUserData {
	public required User User { get; set; }
	// Full access is carried by a protected system role, never a level.
	public bool IsFullAccess { get; set; }

	// Assigned role names, loaded in one batched query per page (no N+1): the
	// « Rôles » column reads them as pills.
	public List<string> Roles { get; set; } = [];

	// Still-valid sessions of this member (loaded in one batched query per page).
	public int OpenSessions { get; set; }

	// Most recent sign-in (impersonation sessions excluded); null = never signed in.
	public DateTime? LastSignInAt { get; set; }

	// Who sent the accepted staff invitation for this e-mail; null when the member
	// was not created through an invitation.
	public string? InvitedByName { get; set; }
}

public sealed record StaffUserCounts(
	int Total,
	int Active,
	int Suspended,
	int FullAccess,
	int ConnectedToday,
	int OpenSessions,
	IReadOnlyList<StaffRoleCount> RoleCounts
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
	IReadOnlySet<UserStatus>? Status,
	Guid? ExcludeRoleId = null
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

		if (args.Filters?.ExcludeRoleId is { } excludeRoleId) {
			// By id, in the query: composes with search, status, cursor and page size.
			query =
				from ua in query
				where !this._DbContext.UserAccountRole.Any(
					uar => uar.UserAccountId == ua.Id && uar.RoleId == excludeRoleId
				)
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

		// « Connectés aujourd'hui » is the members whose durable last sign-in
		// (users.last_sign_in_at, stamped at login, impersonation excluded) falls
		// since midnight UTC: a member who signed in and logged out still counts.
		// The open-session figure is the still-valid session rows.
		var now = DateTime.UtcNow;
		var todayStart = now.Date;
		var filteredUserIds = query.Select(ua => ua.UserId);
		var openSessions = await (
			from session in this._DbContext.Session.AsNoTracking()
			where session.ExpiresAt > now
				&& filteredUserIds.Contains(session.UserId)
			select session
		).CountAsync(cancellationToken);
		var connectedToday = await query.CountAsync(
			ua => ua.User.LastSignInAt != null && ua.User.LastSignInAt >= todayStart,
			cancellationToken
		);

		// Members per role over the same filtered collection (a member holding
		// several roles counts once in each).
		var filteredAccountIds = query.Select(ua => ua.Id);
		var roleCountRows = await (
			from accountRole in this._DbContext.UserAccountRole.AsNoTracking()
			join role in this._DbContext.Role.AsNoTracking()
				on (Guid?)accountRole.RoleId equals role.Id
			where !role.IsDeleted
				&& filteredAccountIds.Contains((Guid?)accountRole.UserAccountId)
			group role by new { role.Id, role.Name } into g
			select new { g.Key.Id, g.Key.Name, Count = g.Count() }
		).ToListAsync(cancellationToken);
		var roleCounts = roleCountRows
			.Where(row => row.Id is not null)
			.Select(row => new StaffRoleCount(row.Id ?? Guid.Empty, row.Name, row.Count))
			.OrderByDescending(row => row.Count)
			.ThenBy(row => row.Name, StringComparer.OrdinalIgnoreCase)
			.ToList();

		var counts = new StaffUserCounts(
			Total: total,
			Active: active,
			Suspended: suspended,
			FullAccess: fullAccess,
			ConnectedToday: connectedToday,
			OpenSessions: openSessions,
			RoleCounts: roleCounts
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

		// One batched session query for the page: open sessions.
		var sessionRows = await (
			from session in this._DbContext.Session.AsNoTracking()
			where pageUserIds.Contains(session.UserId)
			group session by session.UserId into g
			select new {
				UserId = g.Key,
				Open = g.Count(session => session.ExpiresAt > now),
			}
		).ToListAsync(cancellationToken);
		var sessionsByUser = sessionRows.ToDictionary(row => row.UserId);

		// One batched query for the inviter: the latest accepted staff invitation
		// sent to the member's e-mail (users.email and invitations.email are both
		// stored lower-cased).
		var pageEmails = results.Select(staffUser => staffUser.User.Email).ToList();
		var inviterRows = await (
			from invitation in this._DbContext.Invitation.AsNoTracking()
			join inviter in this._DbContext.User.AsNoTracking()
				on invitation.InvitedByUserId equals inviter.Id
			where invitation.Scope == InvitationScope.Staff
				&& invitation.Status == InvitationStatus.Accepted
				&& pageEmails.Contains(invitation.Email)
			select new {
				invitation.Email,
				invitation.AcceptedAt,
				invitation.CreatedAt,
				inviter.FirstName,
				inviter.LastName,
			}
		).ToListAsync(cancellationToken);
		var inviterByEmail = inviterRows
			.GroupBy(row => row.Email)
			.ToDictionary(
				group => group.Key,
				group => group
					.OrderByDescending(row => row.AcceptedAt ?? row.CreatedAt)
					.First()
			);

		foreach (var staffUser in results) {
			// Durable column, stamped at sign-in: survives logout and session cleanup.
			staffUser.LastSignInAt = staffUser.User.LastSignInAt;
			if (sessionsByUser.TryGetValue(staffUser.User.GetRequiredId(), out var sessions)) {
				staffUser.OpenSessions = sessions.Open;
			}

			if (inviterByEmail.TryGetValue(staffUser.User.Email, out var inviterRow)) {
				var name = $"{inviterRow.FirstName} {inviterRow.LastName}".Trim();
				staffUser.InvitedByName = name.Length > 0 ? name : null;
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
