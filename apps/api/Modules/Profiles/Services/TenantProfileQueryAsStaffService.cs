using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Permissions.Entities;
using PublyApp.Api.Modules.Profiles.Entities;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Modules.Profiles.Services;

public class TenantProfileItem {
	public Guid Id { get; set; }
	public string Name { get; set; } = string.Empty;
	public string? Description { get; set; }
	public string? Icon { get; set; }
	public string? Tone { get; set; }
	public bool IsDefault { get; set; }
	public int UserAccountCount { get; set; }
	public int PermissionsCount { get; set; }
	public DateTime CreatedAt { get; set; }
	public DateTime UpdatedAt { get; set; }
}

public abstract record FindTenantProfilesResult {
	public sealed record Success(CursorPaginatedResult<TenantProfileItem> Data)
		: FindTenantProfilesResult;

	public sealed record CursorNotFound(string Cursor) : FindTenantProfilesResult;

	public sealed record InvalidSortId(string SortId) : FindTenantProfilesResult;
}

public sealed record FindTenantProfilesArgs(
	Guid TenantId,
	Guid Cursor,
	int? Limit,
	string? SortId,
	SortOrder? SortOrder,
	string? Search,
	bool? IsDefault
);

public sealed record GetTenantProfileByIdArgs(
	Guid TenantId,
	Guid ProfileId
);

public abstract record GetTenantProfileByIdResult {
	public sealed record Success(TenantProfileItem Profile)
		: GetTenantProfileByIdResult;

	public sealed record ProfileNotFound : GetTenantProfileByIdResult;
}

public sealed record FindTenantProfilePermissionKeysArgs(
	Guid TenantId,
	Guid ProfileId
);

public abstract record FindTenantProfilePermissionKeysResult {
	public sealed record Success(List<string> PermissionKeys)
		: FindTenantProfilePermissionKeysResult;

	public sealed record ProfileNotFound : FindTenantProfilePermissionKeysResult;
}

/// <summary>
/// A tenant member (UserAccount) assigned to a tenant profile. Keyed by
/// <see cref="UserAccountId"/> rather than the underlying user id: the sibling assign/unassign
/// endpoints (<c>SetTenantProfileUserAsync</c>) already address membership by
/// <c>user_account_id</c>, so the read side matches that established tenant-axis convention
/// instead of the staff-profile precedent's user-id keying.
/// </summary>
public sealed record TenantProfileUserListItem(
	Guid UserAccountId,
	Guid UserId,
	string Email,
	string? FirstName,
	string? LastName,
	string? AvatarUrl,
	UserStatus UserStatus,
	AccountStatus AccountStatus,
	AccountLevel Level,
	DateTime JoinedAt,
	List<TenantProfileUserProfileListItem> OtherProfiles
);

public sealed record TenantProfileUserProfileListItem(
	Guid Id,
	string Name
);

public abstract record FindTenantProfileUsersResult {
	// "Success" here is a plain list response (offset pagination), mirroring the
	// staff-profiles Find precedent's pagination shape.
	public sealed record Success(
		List<TenantProfileUserListItem> Users,
		int Count
	) : FindTenantProfileUsersResult;

	// Missing/non-tenant/foreign-tenant profiles are all treated as "not found" for this
	// endpoint, mirroring every other tenant-profile-as-staff read.
	public sealed record ProfileNotFound : FindTenantProfileUsersResult;

	public sealed record InvalidSortId(string SortId) : FindTenantProfileUsersResult;
}

public sealed record FindTenantProfileUsersArgs(
	Guid TenantId,
	Guid ProfileId,
	int? Page,
	int? Limit,
	string? SortId,
	SortOrder? SortOrder,
	string? Search
);

public sealed record TenantProfileUserAssignmentResolutionItem(
	Guid UserAccountId,
	bool IsAssigned
);

public abstract record ResolveTenantProfileUserAssignmentsResult {
	public sealed record Success(
		List<TenantProfileUserAssignmentResolutionItem> Assignments
	) : ResolveTenantProfileUserAssignmentsResult;

	public sealed record ProfileNotFound : ResolveTenantProfileUserAssignmentsResult;
}

public sealed record ResolveTenantProfileUserAssignmentsArgs(
	Guid TenantId,
	Guid ProfileId,
	List<Guid> UserAccountIds
);

public interface ITenantProfileQueryAsStaffService {
	Task<FindTenantProfilesResult> FindTenantProfilesAsync(
		FindTenantProfilesArgs args,
		CancellationToken cancellationToken = default
	);

	Task<GetTenantProfileByIdResult> GetTenantProfileByIdAsync(
		GetTenantProfileByIdArgs args,
		CancellationToken cancellationToken = default
	);

	Task<FindTenantProfilePermissionKeysResult> FindTenantProfilePermissionKeysAsync(
		FindTenantProfilePermissionKeysArgs args,
		CancellationToken cancellationToken = default
	);

	// Count for the tenant detail page: active (non-deleted) tenant-scoped profiles.
	Task<int> CountTenantProfilesAsync(
		Guid tenantId,
		CancellationToken cancellationToken = default
	);

	Task<FindTenantProfileUsersResult> FindTenantProfileUsersAsync(
		FindTenantProfileUsersArgs args,
		CancellationToken cancellationToken = default
	);

	Task<ResolveTenantProfileUserAssignmentsResult> ResolveTenantProfileUserAssignmentsAsync(
		ResolveTenantProfileUserAssignmentsArgs args,
		CancellationToken cancellationToken = default
	);
}

[Service(ServiceLifetime.Scoped)]
public sealed class TenantProfileQueryAsStaffService : ITenantProfileQueryAsStaffService {
	private readonly AppDbContext _dbContext;

	public TenantProfileQueryAsStaffService(
		AppDbContext dbContext
	) {
		_dbContext = dbContext;
	}

	public async Task<FindTenantProfilesResult> FindTenantProfilesAsync(
		FindTenantProfilesArgs args,
		CancellationToken cancellationToken = default
	) {
		var effectiveLimit =
			args.Limit ?? AppEnvironment.Instance.PAGINATION_DEFAULT_LIMIT;
		var effectiveSortOrder = args.SortOrder ?? SortOrder.Desc;
		var effectiveSortId = args.SortId ?? "id";
		var search = args.Search;
		var isAsc = effectiveSortOrder == SortOrder.Asc;

		var sortFieldHandlers = new Dictionary<string, CursorSortFieldHandler<Profile>>(
			StringComparer.OrdinalIgnoreCase
		) {
			["id"] = CursorSortFieldHandlerFactory.Create<Profile, Guid, Guid?>(
				cursorLookupQuery: () => _dbContext.Profile
					.AsNoTracking()
					.Where(p => p.Scope == ProfileScope.Tenant
						&& p.TenantId == args.TenantId
						&& !p.IsDeleted),
				keySelector: p => p.Id ?? Guid.Empty,
				idSelector: p => p.Id,
				cancellationToken
			),
			["name"] = CursorSortFieldHandlerFactory.Create<Profile, string, Guid?>(
				cursorLookupQuery: () => _dbContext.Profile
					.AsNoTracking()
					.Where(p => p.Id != null
						&& p.Scope == ProfileScope.Tenant
						&& p.TenantId == args.TenantId
						&& !p.IsDeleted),
				keySelector: p => p.Name,
				idSelector: p => p.Id,
				cancellationToken
			),
			["created_at"] = CursorSortFieldHandlerFactory.Create<Profile, DateTime, Guid?>(
				cursorLookupQuery: () => _dbContext.Profile
					.AsNoTracking()
					.Where(p => p.Id != null
						&& p.Scope == ProfileScope.Tenant
						&& p.TenantId == args.TenantId
						&& !p.IsDeleted),
				keySelector: p => p.CreatedAt,
				idSelector: p => p.Id,
				cancellationToken
			),
		};

		if (!sortFieldHandlers.TryGetValue(effectiveSortId, out var handler)) {
			return new FindTenantProfilesResult.InvalidSortId(effectiveSortId);
		}

		var baseQuery =
			from p in _dbContext.Profile.AsNoTracking()
			where p.Scope == ProfileScope.Tenant
				&& p.TenantId == args.TenantId
				&& !p.IsDeleted
				&& p.Id != null
			select p;

		IQueryable<Profile> query = baseQuery;

		if (search is { } q) {
			var pattern = $"%{LikePatternUtils.EscapeLikePattern(q)}%";
			query = query.Where(p =>
				EF.Functions.ILike(p.Name, pattern, LikePatternUtils.LikeEscapeChar)
				|| (p.Description != null && EF.Functions.ILike(p.Description, pattern, LikePatternUtils.LikeEscapeChar))
			);
		}

		if (args.IsDefault is { } isDefault) {
			query = query.Where(p => p.IsDefault == isDefault);
		}

		if (args.Cursor != Guid.Empty) {
			var cursorValue = await handler.GetCursorValue(args.Cursor);
			if (cursorValue is null) {
				return new FindTenantProfilesResult.CursorNotFound(args.Cursor.ToString());
			}

			query = handler.ApplyFilter(query, cursorValue, isAsc);
		}

		var orderedQuery = handler.ApplyOrdering(query, isAsc);

		var profiles = await orderedQuery
			.Take(effectiveLimit + 1)
			.ToListAsync(cancellationToken);

		string? nextCursor = null;
		if (profiles.Count > effectiveLimit) {
			profiles.RemoveAt(profiles.Count - 1);
			nextCursor = profiles.Last().GetRequiredId().ToString();
		}

		var profileIds = profiles.Select(p => p.GetRequiredId()).ToList();

		// The list DTO needs current assignment counts. Because unassignment hard-deletes
		// links, counting rows directly is the active membership count.
		var userAccountCounts = await (
			from uap in _dbContext.UserAccountProfile.AsNoTracking()
			where profileIds.Contains(uap.ProfileId)
			group uap by uap.ProfileId into g
			select new { ProfileId = g.Key, Count = g.Count() }
		).ToListAsync(cancellationToken);

		var userAccountCountByProfileId = new Dictionary<Guid, int>();
		foreach (var row in userAccountCounts) {
			userAccountCountByProfileId[row.ProfileId] = row.Count;
		}

		// Batched grouped-count query mirrors the userAccountCounts pattern above:
		// one query for the page's profile IDs, not a per-row lookup.
		var permissionCounts = await (
			from pp in _dbContext.ProfilePermission.AsNoTracking()
			where profileIds.Contains(pp.ProfileId)
			group pp by pp.ProfileId into g
			select new { ProfileId = g.Key, Count = g.Count() }
		).ToListAsync(cancellationToken);

		var permissionCountByProfileId = new Dictionary<Guid, int>();
		foreach (var row in permissionCounts) {
			permissionCountByProfileId[row.ProfileId] = row.Count;
		}

		var items = profiles.Select(p => {
			var profileId = p.GetRequiredId();
			return new TenantProfileItem {
				Id = profileId,
				Name = p.Name,
				Description = p.Description,
				Icon = p.Icon,
				Tone = p.Tone,
				IsDefault = p.IsDefault,
				UserAccountCount = userAccountCountByProfileId.GetValueOrDefault(profileId, 0),
				PermissionsCount = permissionCountByProfileId.GetValueOrDefault(profileId, 0),
				CreatedAt = p.CreatedAt,
				UpdatedAt = p.UpdatedAt,
			};
		}).ToList();

		return new FindTenantProfilesResult.Success(
			new CursorPaginatedResult<TenantProfileItem> {
				Data = items,
				NextCursor = nextCursor,
			}
		);
	}

	public async Task<GetTenantProfileByIdResult> GetTenantProfileByIdAsync(
		GetTenantProfileByIdArgs args,
		CancellationToken cancellationToken = default
	) {
		var profile = await (
			from p in _dbContext.Profile
			where p.Id == args.ProfileId
				&& p.Scope == ProfileScope.Tenant
				&& p.TenantId == args.TenantId
				&& !p.IsDeleted
			select new TenantProfileItem {
				Id = p.Id ?? Guid.Empty,
				Name = p.Name,
				Description = p.Description,
				Icon = p.Icon,
				Tone = p.Tone,
				IsDefault = p.IsDefault,
				UserAccountCount = p.UserAccountProfiles.Count,
				PermissionsCount = p.ProfilePermissions.Count,
				CreatedAt = p.CreatedAt,
				UpdatedAt = p.UpdatedAt,
			}
		).FirstOrDefaultAsync(cancellationToken);

		if (profile is null) {
			return new GetTenantProfileByIdResult.ProfileNotFound();
		}

		return new GetTenantProfileByIdResult.Success(profile);
	}

	public async Task<FindTenantProfilePermissionKeysResult>
		FindTenantProfilePermissionKeysAsync(
			FindTenantProfilePermissionKeysArgs args,
			CancellationToken cancellationToken = default
		) {
		var profileExists = await (
			from p in _dbContext.Profile
			where p.Id == args.ProfileId
				&& p.Scope == ProfileScope.Tenant
				&& p.TenantId == args.TenantId
				&& !p.IsDeleted
			select p.Id
		).AnyAsync(cancellationToken);

		if (!profileExists) {
			return new FindTenantProfilePermissionKeysResult.ProfileNotFound();
		}

		var permissionKeys = await (
			from pp in _dbContext.ProfilePermission
			join p in _dbContext.Permission on pp.PermissionKey equals p.Key
			where pp.ProfileId == args.ProfileId
				&& !p.IsDeleted
				&& p.Scope == PermissionScope.Tenant
			select pp.PermissionKey
		)
			.OrderBy(k => k)
			.ToListAsync(cancellationToken);

		return new FindTenantProfilePermissionKeysResult.Success(permissionKeys);
	}

	public async Task<int> CountTenantProfilesAsync(
		Guid tenantId,
		CancellationToken cancellationToken = default
	) {
		var count =
			from p in _dbContext.Profile
			where p.Scope == ProfileScope.Tenant
				&& p.TenantId == tenantId
				&& !p.IsDeleted
			select p;

		return await count.CountAsync(cancellationToken);
	}

	public async Task<FindTenantProfileUsersResult> FindTenantProfileUsersAsync(
		FindTenantProfileUsersArgs args,
		CancellationToken cancellationToken = default
	) {
		var effectivePage = args.Page ?? 1;
		var effectiveLimit =
			args.Limit ?? AppEnvironment.Instance.PAGINATION_DEFAULT_LIMIT;
		var effectiveSortOrder = args.SortOrder ?? SortOrder.Desc;
		var effectiveSortId = args.SortId ?? "created_at";
		var search = args.Search;

		// Guard early to avoid running a large join query when the profileId is invalid. A
		// staff-scope profile or another tenant's profile is treated as not-found here too,
		// mirroring TenantMembershipLockOrder.LockLiveTenantProfileAsync's liveness predicate.
		var profileExists = await (
			from p in _dbContext.Profile
			where p.Id == args.ProfileId
				&& p.Scope == ProfileScope.Tenant
				&& p.TenantId == args.TenantId
				&& !p.IsDeleted
			select p.Id
		).AnyAsync(cancellationToken);

		if (!profileExists) {
			return new FindTenantProfileUsersResult.ProfileNotFound();
		}

		// Query "tenant members assigned to this profile" via the junction table.
		//
		// IMPORTANT: Do NOT filter out suspended members here, mirroring the staff-profiles
		// Find precedent (FindStaffProfileUsersAsync):
		// - Staff tooling still needs to *see* suspended members (for auditing and reactivation).
		// - The UI can disable actions for non-actionable statuses, but hiding rows causes
		//   confusing "disappearing" behavior right after a status mutation.
		var query =
			from uap in _dbContext.UserAccountProfile
			join ua in _dbContext.UserAccount on uap.UserAccountId equals ua.Id
			join u in _dbContext.User on ua.UserId equals u.Id
			where uap.ProfileId == args.ProfileId
				&& ua.Scope == AccountScope.Tenant
				&& ua.TenantId == args.TenantId
				&& !ua.IsDeleted
				&& !u.IsDeleted
			select new {
				UserAccountId = ua.Id,
				UserId = u.Id,
				u.Email,
				u.FirstName,
				u.LastName,
				u.AvatarUrl,
				UserStatus = u.Status,
				AccountStatus = ua.Status,
				ua.Level,
				// Use the junction CreatedAt as "assigned at" for default sorting.
				AssignedAt = uap.CreatedAt,
			};

		if (search is not null) {
			// Search is intentionally simple (ILIKE wildcard) for UX, mirroring the
			// staff-profiles Find precedent.
			var wildcard = $"%{LikePatternUtils.EscapeLikePattern(search)}%";
			query = query.Where(x =>
				EF.Functions.ILike(x.Email, wildcard, LikePatternUtils.LikeEscapeChar)
				|| EF.Functions.ILike(x.FirstName ?? "", wildcard, LikePatternUtils.LikeEscapeChar)
				|| EF.Functions.ILike(x.LastName ?? "", wildcard, LikePatternUtils.LikeEscapeChar)
			);
		}

		// Keep this list's supported sort_id values explicit and small, mirroring the
		// staff-profiles Find precedent's sortable set.
		//
		// Every branch adds a UserAccountId tie-breaker (direction matching the primary sort).
		// The primary sort fields routinely tie (status ties constantly; email/name/created_at
		// can too), and without a unique tie-breaker Postgres may return tied rows in different
		// orders across requests, causing adjacent offset pages to overlap or omit members.
		var isAsc = effectiveSortOrder == SortOrder.Asc;
		if (string.Equals(effectiveSortId, "created_at", StringComparison.OrdinalIgnoreCase)) {
			query = isAsc
				? query.OrderBy(x => x.AssignedAt).ThenBy(x => x.UserAccountId)
				: query.OrderByDescending(x => x.AssignedAt).ThenByDescending(x => x.UserAccountId);
		} else if (string.Equals(effectiveSortId, "email", StringComparison.OrdinalIgnoreCase)) {
			query = isAsc
				? query.OrderBy(x => x.Email).ThenBy(x => x.UserAccountId)
				: query.OrderByDescending(x => x.Email).ThenByDescending(x => x.UserAccountId);
		} else if (string.Equals(effectiveSortId, "first_name", StringComparison.OrdinalIgnoreCase)) {
			query = isAsc
				? query.OrderBy(x => x.FirstName).ThenBy(x => x.UserAccountId)
				: query.OrderByDescending(x => x.FirstName).ThenByDescending(x => x.UserAccountId);
		} else if (string.Equals(effectiveSortId, "last_name", StringComparison.OrdinalIgnoreCase)) {
			query = isAsc
				? query.OrderBy(x => x.LastName).ThenBy(x => x.UserAccountId)
				: query.OrderByDescending(x => x.LastName).ThenByDescending(x => x.UserAccountId);
		} else if (string.Equals(effectiveSortId, "status", StringComparison.OrdinalIgnoreCase)) {
			// Sorts on the underlying global user status, the same simplification the
			// staff-profiles Find precedent makes, rather than the compound derived tenant
			// status (which also folds in the membership-local AccountStatus).
			query = isAsc
				? query.OrderBy(x => x.UserStatus).ThenBy(x => x.UserAccountId)
				: query.OrderByDescending(x => x.UserStatus).ThenByDescending(x => x.UserAccountId);
		} else if (string.Equals(effectiveSortId, "level", StringComparison.OrdinalIgnoreCase)) {
			// AccountLevel is a small, explicitly-ordered enum (Admin=50 > User=10), so ordering by
			// its underlying numeric value is well-defined — unlike a free-text field, there is no
			// ambiguity about what "sorted by level" means.
			query = isAsc
				? query.OrderBy(x => x.Level).ThenBy(x => x.UserAccountId)
				: query.OrderByDescending(x => x.Level).ThenByDescending(x => x.UserAccountId);
		} else {
			return new FindTenantProfileUsersResult.InvalidSortId(effectiveSortId);
		}

		// Count is used by the UI to render pagination controls.
		var count = await query.CountAsync(cancellationToken);

		var pageMembers = await query
			.Skip((effectivePage - 1) * effectiveLimit)
			.Take(effectiveLimit)
			.Select(x => new {
				UserAccountId = x.UserAccountId ?? Guid.Empty,
				UserId = x.UserId ?? Guid.Empty,
				x.Email,
				x.FirstName,
				x.LastName,
				x.AvatarUrl,
				x.UserStatus,
				x.AccountStatus,
				x.Level,
				JoinedAt = x.AssignedAt,
			})
			.ToListAsync(cancellationToken);

		var pageUserAccountIds = pageMembers
			.Select(member => member.UserAccountId)
			.ToList();
		var otherProfileRows = await (
			from uap in _dbContext.UserAccountProfile.AsNoTracking()
			join profile in _dbContext.Profile.AsNoTracking()
				on uap.ProfileId equals profile.Id
			where pageUserAccountIds.Contains(uap.UserAccountId)
				&& uap.ProfileId != args.ProfileId
				&& profile.Scope == ProfileScope.Tenant
				&& profile.TenantId == args.TenantId
				&& !profile.IsDeleted
			orderby profile.Name, profile.Id
			select new {
				uap.UserAccountId,
				ProfileId = profile.Id ?? Guid.Empty,
				profile.Name,
			}
		).ToListAsync(cancellationToken);

		var otherProfilesByUserAccountId =
			new Dictionary<Guid, List<TenantProfileUserProfileListItem>>();
		foreach (var row in otherProfileRows) {
			if (!otherProfilesByUserAccountId.TryGetValue(
				row.UserAccountId,
				out var otherProfiles
			)) {
				otherProfiles = [];
				otherProfilesByUserAccountId[row.UserAccountId] = otherProfiles;
			}

			otherProfiles.Add(new TenantProfileUserProfileListItem(
				row.ProfileId,
				row.Name
			));
		}

		var users = pageMembers
			.Select(member => new TenantProfileUserListItem(
				member.UserAccountId,
				member.UserId,
				member.Email,
				member.FirstName,
				member.LastName,
				member.AvatarUrl,
				member.UserStatus,
				member.AccountStatus,
				member.Level,
				member.JoinedAt,
				otherProfilesByUserAccountId.GetValueOrDefault(
					member.UserAccountId,
					[]
				)
			))
			.ToList();

		return new FindTenantProfileUsersResult.Success(
			Users: users,
			Count: count
		);
	}

	public async Task<ResolveTenantProfileUserAssignmentsResult>
		ResolveTenantProfileUserAssignmentsAsync(
		ResolveTenantProfileUserAssignmentsArgs args,
		CancellationToken cancellationToken = default
	) {
		var profileExists = await (
			from p in _dbContext.Profile
			where p.Id == args.ProfileId
				&& p.Scope == ProfileScope.Tenant
				&& p.TenantId == args.TenantId
				&& !p.IsDeleted
			select p.Id
		).AnyAsync(cancellationToken);

		if (!profileExists) {
			return new ResolveTenantProfileUserAssignmentsResult.ProfileNotFound();
		}

		if (args.UserAccountIds.Count == 0) {
			return new ResolveTenantProfileUserAssignmentsResult.Success([]);
		}

		// UserAccount.Id is nullable (Guid?) in the EF model, so convert the incoming Guid list
		// to nullable IDs to keep the query fully translatable by EF.
		var userAccountIdsNullable = args.UserAccountIds.Select(id => (Guid?)id).ToList();

		// Resolve assignment TRUTH, not eligibility: IsAssigned must be true iff a live,
		// tenant-scoped UserAccountProfile junction row exists for (profileId, user_account_id),
		// regardless of account/user suspension.
		//
		// - Only live tenant-scope accounts of THIS tenant are relevant (enforces tenant
		//   isolation: a foreign tenant's account id can never resolve as assigned here).
		// - Suspended accounts/users are NOT excluded here: Find deliberately returns suspended
		//   members, and the tenant toggle service (TenantMembershipLockOrder.
		//   LockLiveTenantAccountAsync) deliberately accepts suspended accounts for both assign
		//   and unassign. Excluding them here would make an existing assignment resolve as
		//   IsAssigned: false, which would make the assignment un-removable through this state.
		//   A consumer that needs suspension to gate unsafe UI actions should consume account
		//   status as a separate field rather than overloading IsAssigned with it.
		// - Junction links are hard-deleted when members are unassigned.
		var assignedUserAccountIds = await (
			from ua in _dbContext.UserAccount
			join uap in _dbContext.UserAccountProfile on ua.Id equals uap.UserAccountId
			join u in _dbContext.User on ua.UserId equals u.Id
			where userAccountIdsNullable.Contains(ua.Id)
				&& ua.Scope == AccountScope.Tenant
				&& ua.TenantId == args.TenantId
				&& !ua.IsDeleted
				&& !u.IsDeleted
				&& uap.ProfileId == args.ProfileId
			select ua.Id
		)
			.Distinct()
			.ToListAsync(cancellationToken);

		var assignedLookup = new HashSet<Guid>();
		foreach (var assignedUserAccountId in assignedUserAccountIds) {
			if (assignedUserAccountId is Guid userAccountId) {
				assignedLookup.Add(userAccountId);
			}
		}

		var assignments = args.UserAccountIds
			.Distinct()
			.Select(userAccountId => new TenantProfileUserAssignmentResolutionItem(
				UserAccountId: userAccountId,
				IsAssigned: assignedLookup.Contains(userAccountId)
			))
			.ToList();

		return new ResolveTenantProfileUserAssignmentsResult.Success(assignments);
	}

}
