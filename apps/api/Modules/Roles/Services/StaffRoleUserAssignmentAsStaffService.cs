using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Roles.Entities;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Modules.Roles.Services;

public sealed record StaffRoleUserListItem(
	Guid UserId,
	string Email,
	string? FirstName,
	string? LastName,
	string? AvatarUrl,
	UserStatus Status
);

public abstract record FindStaffRoleUsersServiceResult {
	// "Success" here is a plain list response (offset pagination).
	public sealed record Success(
		List<StaffRoleUserListItem> Users,
		int Count
	) : FindStaffRoleUsersServiceResult;

	// We intentionally treat missing/non-staff roles as "not found" for this endpoint.
	public sealed record RoleNotFound : FindStaffRoleUsersServiceResult;

	public sealed record InvalidSortId(string SortId) : FindStaffRoleUsersServiceResult;
}

public sealed record FindStaffRoleUsersArgs(
	Guid RoleId,
	int? Page,
	int? Limit,
	string? SortId,
	SortOrder? SortOrder,
	string? Search
);

public sealed record StaffRoleUserAssignmentResolutionItem(
	Guid UserId,
	bool IsAssigned
);

public abstract record ResolveStaffRoleUserAssignmentsServiceResult {
	public sealed record Success(
		List<StaffRoleUserAssignmentResolutionItem> Assignments
	) : ResolveStaffRoleUserAssignmentsServiceResult;

	// We intentionally treat missing/non-staff roles as "not found" for this endpoint.
	public sealed record RoleNotFound : ResolveStaffRoleUserAssignmentsServiceResult;
}

public sealed record ResolveStaffRoleUserAssignmentsArgs(
	Guid RoleId,
	List<Guid> UserIds
);

public sealed record UnassignStaffRoleUsersArgs(
	Guid RoleId,
	List<Guid> UserIds
);

public abstract record UnassignStaffRoleUsersServiceResult {
	// Partial-success payload returned to the caller: per-id skip reasons in
	// requested order, counts computed from the deduplicated request.
	public sealed record Success(BulkStaffRoleUserUnassignActionResult Result)
		: UnassignStaffRoleUsersServiceResult;
	public sealed record RoleNotFound : UnassignStaffRoleUsersServiceResult;
}

public static class BulkStaffRoleUserUnassignActionFailureReasons {
	public const string NotAssigned = "not_assigned";
	public const string NotFound = "not_found";
	public const string LastFullAccess = "last_full_access";
}

public record BulkStaffRoleUserUnassignActionFailedItem(
	Guid UserId,
	string Reason
);

public record BulkStaffRoleUserUnassignActionResult(
	int SucceededCount,
	int FailedCount,
	List<BulkStaffRoleUserUnassignActionFailedItem> FailedItems
);

public interface IStaffRoleUserAssignmentAsStaffService {
	Task<FindStaffRoleUsersServiceResult> FindStaffRoleUsersAsync(
		FindStaffRoleUsersArgs args,
		CancellationToken cancellationToken = default
	);

	Task<ResolveStaffRoleUserAssignmentsServiceResult> ResolveStaffRoleUserAssignmentsAsync(
		ResolveStaffRoleUserAssignmentsArgs args,
		CancellationToken cancellationToken = default
	);

	Task<UnassignStaffRoleUsersServiceResult> UnassignStaffRoleUsersAsync(
		UnassignStaffRoleUsersArgs args,
		CancellationToken cancellationToken = default
	);
}

[Service(ServiceLifetime.Scoped)]
public class StaffRoleUserAssignmentAsStaffService : IStaffRoleUserAssignmentAsStaffService {
	private readonly AppDbContext _DbContext;

	public StaffRoleUserAssignmentAsStaffService(
		AppDbContext dbContext,
		ILogger<StaffRoleUserAssignmentAsStaffService> logger
	) {
		this._DbContext = dbContext;
		_ = logger;
	}

	public async Task<FindStaffRoleUsersServiceResult> FindStaffRoleUsersAsync(
		FindStaffRoleUsersArgs args,
		CancellationToken cancellationToken = default
	) {
		var effectivePage = args.Page ?? 1;
		var effectiveLimit =
			args.Limit ?? AppEnvironment.Instance.PAGINATION_DEFAULT_LIMIT;
		var effectiveSortOrder = args.SortOrder ?? SortOrder.Desc;
		var effectiveSortId = args.SortId ?? "created_at";
		var search = args.Search;

		// Guard early to avoid running a large join query when the roleId is invalid.
		// This endpoint is specifically "staff role -> users", so tenant/project roles
		// are not addressable here either (also treated as not-found).
		var roleExists = await (
			from p in this._DbContext.Role
			where p.Id == args.RoleId
				&& p.Scope == RoleScope.Staff
				&& !p.IsDeleted
			select p.Id
		).AnyAsync(cancellationToken);

		if (!roleExists) {
			return new FindStaffRoleUsersServiceResult.RoleNotFound();
		}

		// Query "users assigned to this staff role" via the junction table.
		//
		// IMPORTANT: Do NOT filter out suspended users here.
		// - Staff tooling still needs to *see* suspended users (for auditing and reactivation).
		// - The UI can disable actions for non-actionable statuses, but hiding rows causes
		//   confusing "disappearing" behavior right after a status mutation.
		var query =
			from uap in this._DbContext.UserAccountRole
			join ua in this._DbContext.UserAccount on uap.UserAccountId equals ua.Id
			join u in this._DbContext.User on ua.UserId equals u.Id
			where uap.RoleId == args.RoleId
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
			return new FindStaffRoleUsersServiceResult.InvalidSortId(effectiveSortId);
		}

		// Count is used by the UI to render pagination controls.
		var count = await query.CountAsync(cancellationToken);

		var users = await query
			.Skip((effectivePage - 1) * effectiveLimit)
			.Take(effectiveLimit)
			// NOTE: This projection runs inside an EF Core expression tree.
			// Do not use named arguments here; C# forbids named args in expression trees.
			.Select(x => new StaffRoleUserListItem(
				x.UserId ?? Guid.Empty,
				x.Email,
				x.FirstName,
				x.LastName,
				x.AvatarUrl,
				x.Status
			))
			.ToListAsync(cancellationToken);

		return new FindStaffRoleUsersServiceResult.Success(
			Users: users,
			Count: count
		);
	}

	public async Task<ResolveStaffRoleUserAssignmentsServiceResult>
		ResolveStaffRoleUserAssignmentsAsync(
		ResolveStaffRoleUserAssignmentsArgs args,
		CancellationToken cancellationToken = default
	) {
		// Guard early: this endpoint is strictly "staff role -> users" so tenant/project
		// roles are treated as not found.
		var roleExists = await (
			from p in this._DbContext.Role
			where p.Id == args.RoleId
				&& p.Scope == RoleScope.Staff
				&& !p.IsDeleted
			select p.Id
		).AnyAsync(cancellationToken);

		if (!roleExists) {
			return new ResolveStaffRoleUserAssignmentsServiceResult.RoleNotFound();
		}

		if (args.UserIds.Count == 0) {
			return new ResolveStaffRoleUserAssignmentsServiceResult.Success([]);
		}

		// User.Id is nullable (Guid?) in the EF model, so convert the incoming Guid list to
		// nullable IDs to keep the query fully translatable by EF.
		var userIdsNullable = args.UserIds.Select(id => (Guid?)id).ToList();

		// Resolve assignment in one query:
		// - Only staff accounts are relevant for staff roles
		// - Deleted/suspended users/accounts are treated as not assignable via staff tooling
		// - Junction links are hard-deleted when users are unassigned
		var assignedUserIds = await (
			from ua in this._DbContext.UserAccount
			join uap in this._DbContext.UserAccountRole on ua.Id equals uap.UserAccountId
			join u in this._DbContext.User on ua.UserId equals u.Id
			where userIdsNullable.Contains(u.Id)
				&& ua.Scope == AccountScope.Staff
				&& !ua.IsDeleted
				&& ua.Status != AccountStatus.Suspended
				&& !u.IsDeleted
				&& u.Status != UserStatus.Suspended
				&& uap.RoleId == args.RoleId
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
			.Select(userId => new StaffRoleUserAssignmentResolutionItem(
				UserId: userId,
				IsAssigned: assignedLookup.Contains(userId)
			))
			.ToList();

		return new ResolveStaffRoleUserAssignmentsServiceResult.Success(assignments);
	}

	public async Task<UnassignStaffRoleUsersServiceResult> UnassignStaffRoleUsersAsync(
		UnassignStaffRoleUsersArgs args,
		CancellationToken cancellationToken = default
	) {
		// Guard early to avoid running a join query when roleId is invalid.
		// This endpoint is strictly "staff role -> users", so tenant/project roles
		// are treated as not found.
		var role = await (
			from p in this._DbContext.Role
			where p.Id == args.RoleId
				&& p.Scope == RoleScope.Staff
				&& !p.IsDeleted
			select p
		).FirstOrDefaultAsync(cancellationToken);

		if (role is null) {
			return new UnassignStaffRoleUsersServiceResult.RoleNotFound();
		}

		if (args.UserIds.Count == 0) {
			return new UnassignStaffRoleUsersServiceResult.Success(
				new BulkStaffRoleUserUnassignActionResult(0, 0, [])
			);
		}

		var requestedUserIds = args.UserIds.Distinct().ToList();

		// Resolve staff UserAccount IDs for the given User IDs.
		// We intentionally allow suspended users/accounts here: unassigning a role is safe,
		// and admin tooling often needs to clean up assignments on non-active users.
		var userIdsNullable = requestedUserIds.Select(id => (Guid?)id).ToList();
		var staffAccountUserIds = await (
			from ua in this._DbContext.UserAccount
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

		// Existing junction links for this role over the resolved accounts.
		var accountLinkRows = await (
			from uap in this._DbContext.UserAccountRole
			join ua in this._DbContext.UserAccount on uap.UserAccountId equals ua.Id
			where userIdsNullable.Contains(ua.UserId)
				&& ua.Scope == AccountScope.Staff
				&& !ua.IsDeleted
				&& uap.RoleId == args.RoleId
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
		// link on this role are "not_assigned", the rest succeed.
		var failedItems = new List<BulkStaffRoleUserUnassignActionFailedItem>();
		foreach (var userId in requestedUserIds) {
			if (!staffAccountUserIdSet.Contains(userId)) {
				failedItems.Add(new BulkStaffRoleUserUnassignActionFailedItem(
					userId,
					BulkStaffRoleUserUnassignActionFailureReasons.NotFound
				));
				continue;
			}

			if (!linkedUserIds.Contains(userId)) {
				failedItems.Add(new BulkStaffRoleUserUnassignActionFailedItem(
					userId,
					BulkStaffRoleUserUnassignActionFailureReasons.NotAssigned
				));
			}
		}

		// The full-access role is the staff last-admin invariant. Removing it from the
		// last active holder would lock every staff member out of full access.
		var linksToRemove = accountLinkRows.Select(row => row.Link).ToList();
		if (role.IsFullAccess && linksToRemove.Count > 0) {
			var activeFullAccessCount =
				await FullAccessRoleQueries.CountActiveStaffFullAccessAsync(
					this._DbContext,
					cancellationToken
				);
			if (activeFullAccessCount <= linksToRemove.Count) {
				foreach (var userId in linkedUserIds) {
					failedItems.Add(new BulkStaffRoleUserUnassignActionFailedItem(
						userId,
						BulkStaffRoleUserUnassignActionFailureReasons.LastFullAccess
					));
				}
				linksToRemove.Clear();
			}
		}

		// Hard-delete junction links to avoid unique constraint conflicts when links are re-added later.
		if (linksToRemove.Count > 0) {
			this._DbContext.ForceHardDeleteRange(linksToRemove);
			await this._DbContext.SaveChangesAsync(cancellationToken);
		}

		return new UnassignStaffRoleUsersServiceResult.Success(
			new BulkStaffRoleUserUnassignActionResult(
				SucceededCount: requestedUserIds.Count - failedItems.Count,
				FailedCount: failedItems.Count,
				FailedItems: failedItems
			)
		);
	}
}
