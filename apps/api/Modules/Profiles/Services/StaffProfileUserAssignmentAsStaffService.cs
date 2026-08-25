using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Profiles.Entities;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Modules.Profiles.Services;

public sealed record StaffProfileUserListItem(
	Guid UserId,
	string Email,
	string? FirstName,
	string? LastName,
	string? AvatarUrl,
	UserStatus Status
);

public abstract record FindStaffProfileUsersServiceResult {
	// "Success" here is a plain list response (offset pagination).
	public sealed record Success(
		List<StaffProfileUserListItem> Users,
		int Count
	) : FindStaffProfileUsersServiceResult;

	// We intentionally treat missing/non-staff profiles as "not found" for this endpoint.
	public sealed record ProfileNotFound : FindStaffProfileUsersServiceResult;

	public sealed record InvalidSortId(string SortId) : FindStaffProfileUsersServiceResult;
}

public sealed record FindStaffProfileUsersArgs(
	Guid ProfileId,
	int? Page,
	int? Limit,
	string? SortId,
	SortOrder? SortOrder,
	string? Search
);

public sealed record StaffProfileUserAssignmentResolutionItem(
	Guid UserId,
	bool IsAssigned
);

public abstract record ResolveStaffProfileUserAssignmentsServiceResult {
	public sealed record Success(
		List<StaffProfileUserAssignmentResolutionItem> Assignments
	) : ResolveStaffProfileUserAssignmentsServiceResult;

	// We intentionally treat missing/non-staff profiles as "not found" for this endpoint.
	public sealed record ProfileNotFound : ResolveStaffProfileUserAssignmentsServiceResult;
}

public sealed record ResolveStaffProfileUserAssignmentsArgs(
	Guid ProfileId,
	List<Guid> UserIds
);

public sealed record UnassignStaffProfileUsersArgs(
	Guid ProfileId,
	List<Guid> UserIds
);

public abstract record UnassignStaffProfileUsersServiceResult {
	// Partial-success payload returned to the caller: per-id skip reasons in
	// requested order, counts computed from the deduplicated request.
	public sealed record Success(BulkStaffProfileUserUnassignActionResult Result)
		: UnassignStaffProfileUsersServiceResult;
	public sealed record ProfileNotFound : UnassignStaffProfileUsersServiceResult;
}

public static class BulkStaffProfileUserUnassignActionFailureReasons {
	public const string NotAssigned = "not_assigned";
	public const string NotFound = "not_found";
}

public record BulkStaffProfileUserUnassignActionFailedItem(
	Guid UserId,
	string Reason
);

public record BulkStaffProfileUserUnassignActionResult(
	int SucceededCount,
	int FailedCount,
	List<BulkStaffProfileUserUnassignActionFailedItem> FailedItems
);

public interface IStaffProfileUserAssignmentAsStaffService {
	Task<FindStaffProfileUsersServiceResult> FindStaffProfileUsersAsync(
		FindStaffProfileUsersArgs args,
		CancellationToken cancellationToken = default
	);

	Task<ResolveStaffProfileUserAssignmentsServiceResult> ResolveStaffProfileUserAssignmentsAsync(
		ResolveStaffProfileUserAssignmentsArgs args,
		CancellationToken cancellationToken = default
	);

	Task<UnassignStaffProfileUsersServiceResult> UnassignStaffProfileUsersAsync(
		UnassignStaffProfileUsersArgs args,
		CancellationToken cancellationToken = default
	);
}

[Service(ServiceLifetime.Scoped)]
public class StaffProfileUserAssignmentAsStaffService : IStaffProfileUserAssignmentAsStaffService {
	private readonly AppDbContext _dbContext;

	public StaffProfileUserAssignmentAsStaffService(
		AppDbContext dbContext,
		ILogger<StaffProfileUserAssignmentAsStaffService> logger
	) {
		_dbContext = dbContext;
		_ = logger;
	}

	public async Task<FindStaffProfileUsersServiceResult> FindStaffProfileUsersAsync(
		FindStaffProfileUsersArgs args,
		CancellationToken cancellationToken = default
	) {
		var effectivePage = args.Page ?? 1;
		var effectiveLimit =
			args.Limit ?? AppEnvironment.Instance.PAGINATION_DEFAULT_LIMIT;
		var effectiveSortOrder = args.SortOrder ?? SortOrder.Desc;
		var effectiveSortId = args.SortId ?? "created_at";
		var search = args.Search;

		// Guard early to avoid running a large join query when the profileId is invalid.
		// This endpoint is specifically "staff profile -> users", so tenant/project profiles
		// are not addressable here either (also treated as not-found).
		var profileExists = await (
			from p in _dbContext.Profile
			where p.Id == args.ProfileId
				&& p.Scope == ProfileScope.Staff
				&& !p.IsDeleted
			select p.Id
		).AnyAsync(cancellationToken);

		if (!profileExists) {
			return new FindStaffProfileUsersServiceResult.ProfileNotFound();
		}

		// Query "users assigned to this staff profile" via the junction table.
		//
		// IMPORTANT: Do NOT filter out suspended users here.
		// - Staff tooling still needs to *see* suspended users (for auditing and reactivation).
		// - The UI can disable actions for non-actionable statuses, but hiding rows causes
		//   confusing "disappearing" behavior right after a status mutation.
		var query =
			from uap in _dbContext.UserAccountProfile
			join ua in _dbContext.UserAccount on uap.UserAccountId equals ua.Id
			join u in _dbContext.User on ua.UserId equals u.Id
			where uap.ProfileId == args.ProfileId
				&& ua.Scope == AccountScope.Staff
				&& !ua.IsDeleted
				&& !u.IsDeleted
			select new {
				UserId = u.Id,
				u.Email,
				u.FirstName,
				u.LastName,
				u.AvatarUrl,
				u.Status,
				// Use the junction CreatedAt as "assigned at" for default sorting.
				AssignedAt = uap.CreatedAt,
			};

		if (search is not null) {
			// Search is intentionally simple (ILIKE wildcard) for UX. If this becomes hot,
			// we can add trigram indexes or an external search later.
			var wildcard = $"%{LikePatternUtils.EscapeLikePattern(search)}%";
			query = query.Where(x =>
				EF.Functions.ILike(x.Email, wildcard, LikePatternUtils.LikeEscapeChar)
				|| EF.Functions.ILike(x.FirstName ?? "", wildcard, LikePatternUtils.LikeEscapeChar)
				|| EF.Functions.ILike(x.LastName ?? "", wildcard, LikePatternUtils.LikeEscapeChar)
			);
		}

		// Keep this list's supported sort_id values explicit and small.
		var isAsc = effectiveSortOrder == SortOrder.Asc;
		if (string.Equals(effectiveSortId, "created_at", StringComparison.OrdinalIgnoreCase)) {
			query = isAsc
				? query.OrderBy(x => x.AssignedAt)
				: query.OrderByDescending(x => x.AssignedAt);
		} else if (string.Equals(effectiveSortId, "email", StringComparison.OrdinalIgnoreCase)) {
			query = isAsc
				? query.OrderBy(x => x.Email)
				: query.OrderByDescending(x => x.Email);
		} else if (string.Equals(effectiveSortId, "first_name", StringComparison.OrdinalIgnoreCase)) {
			query = isAsc
				? query.OrderBy(x => x.FirstName)
				: query.OrderByDescending(x => x.FirstName);
		} else if (string.Equals(effectiveSortId, "last_name", StringComparison.OrdinalIgnoreCase)) {
			query = isAsc
				? query.OrderBy(x => x.LastName)
				: query.OrderByDescending(x => x.LastName);
		} else if (string.Equals(effectiveSortId, "status", StringComparison.OrdinalIgnoreCase)) {
			query = isAsc
				? query.OrderBy(x => x.Status)
				: query.OrderByDescending(x => x.Status);
		} else {
			return new FindStaffProfileUsersServiceResult.InvalidSortId(effectiveSortId);
		}

		// Count is used by the UI to render pagination controls.
		var count = await query.CountAsync(cancellationToken);

		var users = await query
			.Skip((effectivePage - 1) * effectiveLimit)
			.Take(effectiveLimit)
			// NOTE: This projection runs inside an EF Core expression tree.
			// Do not use named arguments here; C# forbids named args in expression trees.
			.Select(x => new StaffProfileUserListItem(
				x.UserId ?? Guid.Empty,
				x.Email,
				x.FirstName,
				x.LastName,
				x.AvatarUrl,
				x.Status
			))
			.ToListAsync(cancellationToken);

		return new FindStaffProfileUsersServiceResult.Success(
			Users: users,
			Count: count
		);
	}

	public async Task<ResolveStaffProfileUserAssignmentsServiceResult>
		ResolveStaffProfileUserAssignmentsAsync(
		ResolveStaffProfileUserAssignmentsArgs args,
		CancellationToken cancellationToken = default
	) {
		// Guard early: this endpoint is strictly "staff profile -> users" so tenant/project
		// profiles are treated as not found.
		var profileExists = await (
			from p in _dbContext.Profile
			where p.Id == args.ProfileId
				&& p.Scope == ProfileScope.Staff
				&& !p.IsDeleted
			select p.Id
		).AnyAsync(cancellationToken);

		if (!profileExists) {
			return new ResolveStaffProfileUserAssignmentsServiceResult.ProfileNotFound();
		}

		if (args.UserIds.Count == 0) {
			return new ResolveStaffProfileUserAssignmentsServiceResult.Success([]);
		}

		// User.Id is nullable (Guid?) in the EF model, so convert the incoming Guid list to
		// nullable IDs to keep the query fully translatable by EF.
		var userIdsNullable = args.UserIds.Select(id => (Guid?)id).ToList();

		// Resolve assignment in one query:
		// - Only staff accounts are relevant for staff profiles
		// - Deleted/suspended users/accounts are treated as not assignable via staff tooling
		// - Junction links are hard-deleted when users are unassigned
		var assignedUserIds = await (
			from ua in _dbContext.UserAccount
			join uap in _dbContext.UserAccountProfile on ua.Id equals uap.UserAccountId
			join u in _dbContext.User on ua.UserId equals u.Id
			where userIdsNullable.Contains(u.Id)
				&& ua.Scope == AccountScope.Staff
				&& !ua.IsDeleted
				&& ua.Status != AccountStatus.Suspended
				&& !u.IsDeleted
				&& u.Status != UserStatus.Suspended
				&& uap.ProfileId == args.ProfileId
			select u.Id
		)
			.Distinct()
			.ToListAsync(cancellationToken);

		var assignedLookup = new HashSet<Guid>();
		foreach (var assignedUserId in assignedUserIds) {
			if (assignedUserId is Guid userId) {
				assignedLookup.Add(userId);
			}
		}

		var assignments = args.UserIds
			.Distinct()
			.Select(userId => new StaffProfileUserAssignmentResolutionItem(
				UserId: userId,
				IsAssigned: assignedLookup.Contains(userId)
			))
			.ToList();

		return new ResolveStaffProfileUserAssignmentsServiceResult.Success(assignments);
	}

	public async Task<UnassignStaffProfileUsersServiceResult> UnassignStaffProfileUsersAsync(
		UnassignStaffProfileUsersArgs args,
		CancellationToken cancellationToken = default
	) {
		// Guard early to avoid running a join query when profileId is invalid.
		// This endpoint is strictly "staff profile -> users", so tenant/project profiles
		// are treated as not found.
		var profileExists = await (
			from p in _dbContext.Profile
			where p.Id == args.ProfileId
				&& p.Scope == ProfileScope.Staff
				&& !p.IsDeleted
			select p.Id
		).AnyAsync(cancellationToken);

		if (!profileExists) {
			return new UnassignStaffProfileUsersServiceResult.ProfileNotFound();
		}

		if (args.UserIds.Count == 0) {
			return new UnassignStaffProfileUsersServiceResult.Success(
				new BulkStaffProfileUserUnassignActionResult(0, 0, [])
			);
		}

		var requestedUserIds = args.UserIds.Distinct().ToList();

		// Resolve staff UserAccount IDs for the given User IDs.
		// We intentionally allow suspended users/accounts here: unassigning a profile is safe,
		// and admin tooling often needs to clean up assignments on non-active users.
		var userIdsNullable = requestedUserIds.Select(id => (Guid?)id).ToList();
		var staffAccountUserIds = await (
			from ua in _dbContext.UserAccount
			where userIdsNullable.Contains(ua.UserId)
				&& ua.Scope == AccountScope.Staff
				&& !ua.IsDeleted
				&& !ua.User.IsDeleted
			select ua.UserId
		)
			.Distinct()
			.ToListAsync(cancellationToken);

		var staffAccountUserIdSet = new HashSet<Guid>();
		foreach (var staffAccountUserId in staffAccountUserIds) {
			if (staffAccountUserId is Guid userId) {
				staffAccountUserIdSet.Add(userId);
			}
		}

		// Existing junction links for this profile over the resolved accounts.
		var accountLinkRows = await (
			from uap in _dbContext.UserAccountProfile
			join ua in _dbContext.UserAccount on uap.UserAccountId equals ua.Id
			where userIdsNullable.Contains(ua.UserId)
				&& ua.Scope == AccountScope.Staff
				&& !ua.IsDeleted
				&& uap.ProfileId == args.ProfileId
			select new { Link = uap, LinkedUserId = ua.UserId }
		).ToListAsync(cancellationToken);

		var linkedUserIds = new HashSet<Guid>();
		foreach (var row in accountLinkRows) {
			if (row.LinkedUserId is Guid linkedUserId) {
				linkedUserIds.Add(linkedUserId);
			}
		}

		// Classify every requested id (requested order preserved): ids without a
		// live staff account are "not_found", ids with an account but no junction
		// link on this profile are "not_assigned", the rest succeed.
		var failedItems = new List<BulkStaffProfileUserUnassignActionFailedItem>();
		foreach (var userId in requestedUserIds) {
			if (!staffAccountUserIdSet.Contains(userId)) {
				failedItems.Add(new BulkStaffProfileUserUnassignActionFailedItem(
					userId,
					BulkStaffProfileUserUnassignActionFailureReasons.NotFound
				));
				continue;
			}

			if (!linkedUserIds.Contains(userId)) {
				failedItems.Add(new BulkStaffProfileUserUnassignActionFailedItem(
					userId,
					BulkStaffProfileUserUnassignActionFailureReasons.NotAssigned
				));
			}
		}

		// Hard-delete junction links to avoid unique constraint conflicts when links are re-added later.
		var linksToRemove = accountLinkRows.Select(row => row.Link).ToList();
		if (linksToRemove.Count > 0) {
			_dbContext.ForceHardDeleteRange(linksToRemove);
			await _dbContext.SaveChangesAsync(cancellationToken);
		}

		return new UnassignStaffProfileUsersServiceResult.Success(
			new BulkStaffProfileUserUnassignActionResult(
				SucceededCount: requestedUserIds.Count - failedItems.Count,
				FailedCount: failedItems.Count,
				FailedItems: failedItems
			)
		);
	}
}
