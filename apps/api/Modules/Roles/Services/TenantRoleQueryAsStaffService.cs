using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Permissions.Entities;
using PublyApp.Api.Modules.Roles.Entities;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Modules.Roles.Services;

public class TenantRoleItem {
	public Guid Id { get; set; }
	public string Name { get; set; } = string.Empty;
	public string? Description { get; set; }
	public string? Icon { get; set; }
	public string? Tone { get; set; }
	public bool IsDefault { get; set; }
	// The seeded full-access system role is protected: the front hides its
	// edit/delete affordances and shows "Accès complet" instead of a count.
	public bool IsFullAccess { get; set; }
	public int UserAccountCount { get; set; }
	public int PermissionsCount { get; set; }
	public DateTime CreatedAt { get; set; }
	public DateTime UpdatedAt { get; set; }
}

public abstract record FindTenantRolesResult {
	public sealed record Success(CursorPaginatedResult<TenantRoleItem> Data)
		: FindTenantRolesResult;

	public sealed record CursorNotFound(string Cursor) : FindTenantRolesResult;

	public sealed record InvalidSortId(string SortId) : FindTenantRolesResult;
}

public sealed record FindTenantRolesArgs(
	Guid TenantId,
	Guid Cursor,
	int? Limit,
	string? SortId,
	SortOrder? SortOrder,
	string? Search,
	bool? IsFullAccess
);

public sealed record GetTenantRoleByIdArgs(
	Guid TenantId,
	Guid RoleId
);

public abstract record GetTenantRoleByIdResult {
	public sealed record Success(TenantRoleItem Role)
		: GetTenantRoleByIdResult;

	public sealed record RoleNotFound : GetTenantRoleByIdResult;
}

public sealed record FindTenantRolePermissionKeysArgs(
	Guid TenantId,
	Guid RoleId
);

public abstract record FindTenantRolePermissionKeysResult {
	public sealed record Success(List<string> PermissionKeys)
		: FindTenantRolePermissionKeysResult;

	public sealed record RoleNotFound : FindTenantRolePermissionKeysResult;
}

/// <summary>
/// A tenant member (UserAccount) assigned to a tenant role. Keyed by
/// <see cref="UserAccountId"/> rather than the underlying user id: the sibling assign/unassign
/// endpoints (<c>SetTenantRoleUserAsync</c>) already address membership by
/// <c>user_account_id</c>, so the read side matches that established tenant-axis convention
/// instead of the staff-role precedent's user-id keying.
/// </summary>
public sealed record TenantRoleUserListItem(
	Guid UserAccountId,
	Guid UserId,
	string Email,
	string? FirstName,
	string? LastName,
	string? AvatarUrl,
	UserStatus UserStatus,
	AccountStatus AccountStatus,
	bool IsFullAccess,
	DateTime JoinedAt,
	List<TenantRoleUserRoleListItem> OtherRoles
);

public sealed record TenantRoleUserRoleListItem(
	Guid Id,
	string Name
);

public abstract record FindTenantRoleUsersResult {
	// "Success" here is a plain list response (offset pagination), mirroring the
	// staff-roles Find precedent's pagination shape.
	public sealed record Success(
		List<TenantRoleUserListItem> Users,
		int Count
	) : FindTenantRoleUsersResult;

	// Missing/non-tenant/foreign-tenant roles are all treated as "not found" for this
	// endpoint, mirroring every other tenant-role-as-staff read.
	public sealed record RoleNotFound : FindTenantRoleUsersResult;

	public sealed record InvalidSortId(string SortId) : FindTenantRoleUsersResult;
}

public sealed record FindTenantRoleUsersArgs(
	Guid TenantId,
	Guid RoleId,
	int? Page,
	int? Limit,
	string? SortId,
	SortOrder? SortOrder,
	string? Search
);

public sealed record TenantRoleUserAssignmentResolutionItem(
	Guid UserAccountId,
	bool IsAssigned
);

public abstract record ResolveTenantRoleUserAssignmentsResult {
	public sealed record Success(
		List<TenantRoleUserAssignmentResolutionItem> Assignments
	) : ResolveTenantRoleUserAssignmentsResult;

	public sealed record RoleNotFound : ResolveTenantRoleUserAssignmentsResult;
}

public sealed record ResolveTenantRoleUserAssignmentsArgs(
	Guid TenantId,
	Guid RoleId,
	List<Guid> UserAccountIds
);

public record ResolveTenantRoleNameResolution {
	// Unresolved reasons; null Reason means resolved.
	public const string ReasonNotFound = "not-found";
	public const string ReasonAmbiguous = "ambiguous";

	public required string Name { get; init; }

	/// <summary>Resolved live role id, or null when unresolved.</summary>
	public Guid? RoleId { get; init; }

	/// <summary>Unresolved reason: ReasonNotFound or ReasonAmbiguous. Null when resolved.</summary>
	public string? Reason { get; init; }
}

public sealed record ResolveTenantRoleNamesArgs(
	Guid TenantId,
	List<string> Names
);

public abstract record ResolveTenantRoleNamesResult {
	public sealed record Success(
		List<ResolveTenantRoleNameResolution> Resolutions
	) : ResolveTenantRoleNamesResult;

	public sealed record TenantNotFound : ResolveTenantRoleNamesResult;
}

public interface ITenantRoleQueryAsStaffService {
	Task<FindTenantRolesResult> FindTenantRolesAsync(
		FindTenantRolesArgs args,
		CancellationToken cancellationToken = default
	);

	Task<GetTenantRoleByIdResult> GetTenantRoleByIdAsync(
		GetTenantRoleByIdArgs args,
		CancellationToken cancellationToken = default
	);

	Task<FindTenantRolePermissionKeysResult> FindTenantRolePermissionKeysAsync(
		FindTenantRolePermissionKeysArgs args,
		CancellationToken cancellationToken = default
	);

	// Count for the tenant detail page: active (non-deleted) tenant-scoped roles.
	Task<int> CountTenantRolesAsync(
		Guid tenantId,
		CancellationToken cancellationToken = default
	);

	Task<FindTenantRoleUsersResult> FindTenantRoleUsersAsync(
		FindTenantRoleUsersArgs args,
		CancellationToken cancellationToken = default
	);

	Task<ResolveTenantRoleUserAssignmentsResult> ResolveTenantRoleUserAssignmentsAsync(
		ResolveTenantRoleUserAssignmentsArgs args,
		CancellationToken cancellationToken = default
	);

	// Batch-resolves role NAMES to role ids for bulk entry (#979 invite drawer
	// CSV/Excel import): case-insensitive over the tenant's live scope-1 non-deleted
	// roles, `ambiguous` when several live rows match one name.
	Task<ResolveTenantRoleNamesResult> ResolveTenantRoleNamesAsync(
		ResolveTenantRoleNamesArgs args,
		CancellationToken cancellationToken = default
	);
}

[Service(ServiceLifetime.Scoped)]
public sealed class TenantRoleQueryAsStaffService : ITenantRoleQueryAsStaffService {
	private readonly AppDbContext _DbContext;

	public TenantRoleQueryAsStaffService(
		AppDbContext dbContext
	) {
		this._DbContext = dbContext;
	}

	public async Task<FindTenantRolesResult> FindTenantRolesAsync(
		FindTenantRolesArgs args,
		CancellationToken cancellationToken = default
	) {
		var effectiveLimit =
			args.Limit ?? AppEnvironment.Instance.PAGINATION_DEFAULT_LIMIT;
		var effectiveSortOrder = args.SortOrder ?? SortOrder.Desc;
		var effectiveSortId = args.SortId ?? "id";
		var search = args.Search;
		var isAsc = effectiveSortOrder == SortOrder.Asc;

		var sortFieldHandlers = new Dictionary<string, CursorSortFieldHandler<Role>>(
			StringComparer.OrdinalIgnoreCase
		) {
			["id"] = CursorSortFieldHandlerFactory.Create<Role, Guid, Guid?>(
				cursorLookupQuery: () => this._DbContext.Role
					.AsNoTracking()
					.Where(p => p.Scope == RoleScope.Tenant
						&& p.TenantId == args.TenantId
						&& !p.IsDeleted),
				keySelector: p => p.Id ?? Guid.Empty,
				idSelector: p => p.Id,
				cancellationToken
			),
			["name"] = CursorSortFieldHandlerFactory.Create<Role, string, Guid?>(
				cursorLookupQuery: () => this._DbContext.Role
					.AsNoTracking()
					.Where(p => p.Id != null
						&& p.Scope == RoleScope.Tenant
						&& p.TenantId == args.TenantId
						&& !p.IsDeleted),
				keySelector: p => p.Name,
				idSelector: p => p.Id,
				cancellationToken
			),
			["created_at"] = CursorSortFieldHandlerFactory.Create<Role, DateTime, Guid?>(
				cursorLookupQuery: () => this._DbContext.Role
					.AsNoTracking()
					.Where(p => p.Id != null
						&& p.Scope == RoleScope.Tenant
						&& p.TenantId == args.TenantId
						&& !p.IsDeleted),
				keySelector: p => p.CreatedAt,
				idSelector: p => p.Id,
				cancellationToken
			),
		};

		if (!sortFieldHandlers.TryGetValue(effectiveSortId, out var handler)) {
			return new FindTenantRolesResult.InvalidSortId(effectiveSortId);
		}

		var baseQuery =
			from p in this._DbContext.Role.AsNoTracking()
			where p.Scope == RoleScope.Tenant
				&& p.TenantId == args.TenantId
				&& !p.IsDeleted
				&& p.Id != null
			select p;

		IQueryable<Role> query = baseQuery;

		if (search is { } q) {
			var pattern = $"%{LikePatternUtils.EscapeLikePattern(q)}%";
			query = query.Where(p =>
				EF.Functions.ILike(p.Name, pattern, LikePatternUtils.LikeEscapeChar)
				|| (p.Description != null && EF.Functions.ILike(p.Description, pattern, LikePatternUtils.LikeEscapeChar))
			);
		}

		if (args.IsFullAccess is { } isFullAccess) {
			query = query.Where(p => p.IsFullAccess == isFullAccess);
		}

		if (args.Cursor != Guid.Empty) {
			var cursorValue = await handler.GetCursorValue(args.Cursor);
			if (cursorValue is null) {
				return new FindTenantRolesResult.CursorNotFound(args.Cursor.ToString());
			}

			query = handler.ApplyFilter(query, cursorValue, isAsc);
		}

		var orderedQuery = handler.ApplyOrdering(query, isAsc);

		var roles = await orderedQuery
			.Take(effectiveLimit + 1)
			.ToListAsync(cancellationToken);

		string? nextCursor = null;
		if (roles.Count > effectiveLimit) {
			roles.RemoveAt(roles.Count - 1);
			nextCursor = roles.Last().GetRequiredId().ToString();
		}

		var roleIds = roles.Select(p => p.GetRequiredId()).ToList();

		// The list DTO needs current assignment counts. Because unassignment hard-deletes
		// links, counting rows directly is the active membership count.
		var userAccountCounts = await (
			from uap in this._DbContext.UserAccountRole.AsNoTracking()
			where roleIds.Contains(uap.RoleId)
			group uap by uap.RoleId into g
			select new { RoleId = g.Key, Count = g.Count() }
		).ToListAsync(cancellationToken);

		var userAccountCountByRoleId = new Dictionary<Guid, int>();
		foreach (var row in userAccountCounts) {
			userAccountCountByRoleId[row.RoleId] = row.Count;
		}

		// Batched grouped-count query mirrors the userAccountCounts pattern above:
		// one query for the page's role IDs, not a per-row lookup.
		var permissionCounts = await (
			from pp in this._DbContext.RolePermission.AsNoTracking()
			where roleIds.Contains(pp.RoleId)
			group pp by pp.RoleId into g
			select new { RoleId = g.Key, Count = g.Count() }
		).ToListAsync(cancellationToken);

		var permissionCountByRoleId = new Dictionary<Guid, int>();
		foreach (var row in permissionCounts) {
			permissionCountByRoleId[row.RoleId] = row.Count;
		}

		var items = roles.Select(p => {
			var roleId = p.GetRequiredId();
			return new TenantRoleItem {
				Id = roleId,
				Name = p.Name,
				Description = p.Description,
				Icon = p.Icon,
				Tone = p.Tone,
				IsDefault = p.IsDefault,
				IsFullAccess = p.IsFullAccess,
				UserAccountCount = userAccountCountByRoleId.GetValueOrDefault(roleId, 0),
				PermissionsCount = permissionCountByRoleId.GetValueOrDefault(roleId, 0),
				CreatedAt = p.CreatedAt,
				UpdatedAt = p.UpdatedAt,
			};
		}).ToList();

		return new FindTenantRolesResult.Success(
			new CursorPaginatedResult<TenantRoleItem> {
				Data = items,
				NextCursor = nextCursor,
			}
		);
	}

	public async Task<GetTenantRoleByIdResult> GetTenantRoleByIdAsync(
		GetTenantRoleByIdArgs args,
		CancellationToken cancellationToken = default
	) {
		var role = await (
			from p in this._DbContext.Role
			where p.Id == args.RoleId
				&& p.Scope == RoleScope.Tenant
				&& p.TenantId == args.TenantId
				&& !p.IsDeleted
			select new TenantRoleItem {
				Id = p.Id ?? Guid.Empty,
				Name = p.Name,
				Description = p.Description,
				Icon = p.Icon,
				Tone = p.Tone,
				IsDefault = p.IsDefault,
				IsFullAccess = p.IsFullAccess,
				UserAccountCount = p.UserAccountRoles.Count,
				PermissionsCount = p.RolePermissions.Count,
				CreatedAt = p.CreatedAt,
				UpdatedAt = p.UpdatedAt,
			}
		).FirstOrDefaultAsync(cancellationToken);

		if (role is null) {
			return new GetTenantRoleByIdResult.RoleNotFound();
		}

		return new GetTenantRoleByIdResult.Success(role);
	}

	public async Task<FindTenantRolePermissionKeysResult>
		FindTenantRolePermissionKeysAsync(
			FindTenantRolePermissionKeysArgs args,
			CancellationToken cancellationToken = default
		) {
		var roleExists = await (
			from p in this._DbContext.Role
			where p.Id == args.RoleId
				&& p.Scope == RoleScope.Tenant
				&& p.TenantId == args.TenantId
				&& !p.IsDeleted
			select p.Id
		).AnyAsync(cancellationToken);

		if (!roleExists) {
			return new FindTenantRolePermissionKeysResult.RoleNotFound();
		}

		var permissionKeys = await (
			from pp in this._DbContext.RolePermission
			join p in this._DbContext.Permission on pp.PermissionKey equals p.Key
			where pp.RoleId == args.RoleId
				&& !p.IsDeleted
				&& p.Scope == PermissionScope.Tenant
			select pp.PermissionKey
		)
			.OrderBy(k => k)
			.ToListAsync(cancellationToken);

		return new FindTenantRolePermissionKeysResult.Success(permissionKeys);
	}

	public async Task<int> CountTenantRolesAsync(
		Guid tenantId,
		CancellationToken cancellationToken = default
	) {
		var count =
			from p in this._DbContext.Role
			where p.Scope == RoleScope.Tenant
				&& p.TenantId == tenantId
				&& !p.IsDeleted
			select p;

		return await count.CountAsync(cancellationToken);
	}

	public async Task<FindTenantRoleUsersResult> FindTenantRoleUsersAsync(
		FindTenantRoleUsersArgs args,
		CancellationToken cancellationToken = default
	) {
		var effectivePage = args.Page ?? 1;
		var effectiveLimit =
			args.Limit ?? AppEnvironment.Instance.PAGINATION_DEFAULT_LIMIT;
		var effectiveSortOrder = args.SortOrder ?? SortOrder.Desc;
		var effectiveSortId = args.SortId ?? "created_at";
		var search = args.Search;

		// Guard early to avoid running a large join query when the roleId is invalid. A
		// staff-scope role or another tenant's role is treated as not-found here too,
		// mirroring TenantMembershipLockOrder.LockLiveTenantRoleAsync's liveness predicate.
		var roleExists = await (
			from p in this._DbContext.Role
			where p.Id == args.RoleId
				&& p.Scope == RoleScope.Tenant
				&& p.TenantId == args.TenantId
				&& !p.IsDeleted
			select p.Id
		).AnyAsync(cancellationToken);

		if (!roleExists) {
			return new FindTenantRoleUsersResult.RoleNotFound();
		}

		// Query "tenant members assigned to this role" via the junction table.
		//
		// IMPORTANT: Do NOT filter out suspended members here, mirroring the staff-roles
		// Find precedent (FindStaffRoleUsersAsync):
		// - Staff tooling still needs to *see* suspended members (for auditing and reactivation).
		// - The UI can disable actions for non-actionable statuses, but hiding rows causes
		//   confusing "disappearing" behavior right after a status mutation.
		var query =
			from uap in this._DbContext.UserAccountRole
			join ua in this._DbContext.UserAccount on uap.UserAccountId equals ua.Id
			join u in this._DbContext.User on ua.UserId equals u.Id
			where uap.RoleId == args.RoleId
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
				IsFullAccess = this._DbContext.UserAccountRole
					.Any(other => other.UserAccountId == ua.Id
						&& !other.Role.IsDeleted
						&& other.Role.IsFullAccess),
				// Use the junction CreatedAt as "assigned at" for default sorting.
				AssignedAt = uap.CreatedAt,
			};

		if (search is not null) {
			// Search is intentionally simple (ILIKE wildcard) for UX, mirroring the
			// staff-roles Find precedent.
			var wildcard = $"%{LikePatternUtils.EscapeLikePattern(search)}%";
			query = query.Where(x =>
				EF.Functions.ILike(x.Email, wildcard, LikePatternUtils.LikeEscapeChar)
				|| EF.Functions.ILike(x.FirstName ?? "", wildcard, LikePatternUtils.LikeEscapeChar)
				|| EF.Functions.ILike(x.LastName ?? "", wildcard, LikePatternUtils.LikeEscapeChar)
			);
		}

		// Keep this list's supported sort_id values explicit and small, mirroring the
		// staff-roles Find precedent's sortable set.
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
			// staff-roles Find precedent makes, rather than the compound derived tenant
			// status (which also folds in the membership-local AccountStatus).
			query = isAsc
				? query.OrderBy(x => x.UserStatus).ThenBy(x => x.UserAccountId)
				: query.OrderByDescending(x => x.UserStatus).ThenByDescending(x => x.UserAccountId);
		} else if (string.Equals(effectiveSortId, "is_full_access", StringComparison.OrdinalIgnoreCase)) {
			query = isAsc
				? query.OrderBy(x => x.IsFullAccess).ThenBy(x => x.UserAccountId)
				: query.OrderByDescending(x => x.IsFullAccess).ThenByDescending(x => x.UserAccountId);
		} else {
			return new FindTenantRoleUsersResult.InvalidSortId(effectiveSortId);
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
				x.IsFullAccess,
				JoinedAt = x.AssignedAt,
			})
			.ToListAsync(cancellationToken);

		var pageUserAccountIds = pageMembers
			.Select(member => member.UserAccountId)
			.ToList();
		var otherRoleRows = await (
			from uap in this._DbContext.UserAccountRole.AsNoTracking()
			join role in this._DbContext.Role.AsNoTracking()
				on uap.RoleId equals role.Id
			where pageUserAccountIds.Contains(uap.UserAccountId)
				&& uap.RoleId != args.RoleId
				&& role.Scope == RoleScope.Tenant
				&& role.TenantId == args.TenantId
				&& !role.IsDeleted
			orderby role.Name, role.Id
			select new {
				uap.UserAccountId,
				RoleId = role.Id ?? Guid.Empty,
				role.Name,
			}
		).ToListAsync(cancellationToken);

		var otherRolesByUserAccountId =
			new Dictionary<Guid, List<TenantRoleUserRoleListItem>>();
		foreach (var row in otherRoleRows) {
			if (!otherRolesByUserAccountId.TryGetValue(
				row.UserAccountId,
				out var otherRoles
			)) {
				otherRoles = [];
				otherRolesByUserAccountId[row.UserAccountId] = otherRoles;
			}

			otherRoles.Add(new TenantRoleUserRoleListItem(
				row.RoleId,
				row.Name
			));
		}

		var users = pageMembers
			.Select(member => new TenantRoleUserListItem(
				member.UserAccountId,
				member.UserId,
				member.Email,
				member.FirstName,
				member.LastName,
				member.AvatarUrl,
				member.UserStatus,
				member.AccountStatus,
				member.IsFullAccess,
				member.JoinedAt,
				otherRolesByUserAccountId.GetValueOrDefault(
					member.UserAccountId,
					[]
				)
			))
			.ToList();

		return new FindTenantRoleUsersResult.Success(
			Users: users,
			Count: count
		);
	}

	public async Task<ResolveTenantRoleUserAssignmentsResult>
		ResolveTenantRoleUserAssignmentsAsync(
		ResolveTenantRoleUserAssignmentsArgs args,
		CancellationToken cancellationToken = default
	) {
		var roleExists = await (
			from p in this._DbContext.Role
			where p.Id == args.RoleId
				&& p.Scope == RoleScope.Tenant
				&& p.TenantId == args.TenantId
				&& !p.IsDeleted
			select p.Id
		).AnyAsync(cancellationToken);

		if (!roleExists) {
			return new ResolveTenantRoleUserAssignmentsResult.RoleNotFound();
		}

		if (args.UserAccountIds.Count == 0) {
			return new ResolveTenantRoleUserAssignmentsResult.Success([]);
		}

		// UserAccount.Id is nullable (Guid?) in the EF model, so convert the incoming Guid list
		// to nullable IDs to keep the query fully translatable by EF.
		var userAccountIdsNullable = args.UserAccountIds.Select(id => (Guid?)id).ToList();

		// Resolve assignment TRUTH, not eligibility: IsAssigned must be true iff a live,
		// tenant-scoped UserAccountRole junction row exists for (roleId, user_account_id),
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
			from ua in this._DbContext.UserAccount
			join uap in this._DbContext.UserAccountRole on ua.Id equals uap.UserAccountId
			join u in this._DbContext.User on ua.UserId equals u.Id
			where userAccountIdsNullable.Contains(ua.Id)
				&& ua.Scope == AccountScope.Tenant
				&& ua.TenantId == args.TenantId
				&& !ua.IsDeleted
				&& !u.IsDeleted
				&& uap.RoleId == args.RoleId
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
			.Select(userAccountId => new TenantRoleUserAssignmentResolutionItem(
				UserAccountId: userAccountId,
				IsAssigned: assignedLookup.Contains(userAccountId)
			))
			.ToList();

		return new ResolveTenantRoleUserAssignmentsResult.Success(assignments);
	}

	/// <summary>
	/// Batch-resolves tenant role names for the invite drawer's CSV/Excel import (#979).
	/// Case-insensitive matching happens in memory after fetching only this tenant's
	/// candidate roles: name comparisons use .NET OrdinalIgnoreCase semantics, which are
	/// not reliably expressible as a translated SQL predicate across collations. The candidate
	/// set is bounded by the tenant's own catalogue. More than one case-insensitive match is
	/// reported as `ambiguous` rather than picking one, because ux_roles_tenant_name is
	/// CASE-SENSITIVE and "Editor" / "editor" can both exist live.
	/// </summary>
	public async Task<ResolveTenantRoleNamesResult> ResolveTenantRoleNamesAsync(
		ResolveTenantRoleNamesArgs args,
		CancellationToken cancellationToken = default
	) {
		var tenantExists = await this._DbContext.Tenant
			.AnyAsync(tenant => tenant.Id == args.TenantId, cancellationToken);
		if (!tenantExists) {
			return new ResolveTenantRoleNamesResult.TenantNotFound();
		}

		if (args.Names.Count == 0) {
			return new ResolveTenantRoleNamesResult.Success([]);
		}

		var lookups = args.Names
			.Select(name => (
				Name: name,
				ComparisonKey: NormalizeNameKey(name)
			))
			.ToList();

		var candidates = await this._DbContext.Role
			.AsNoTracking()
			.Where(role =>
				role.TenantId == args.TenantId
				&& !role.IsDeleted
				&& role.Scope == RoleScope.Tenant
			)
			.Select(role => new { role.Id, role.Name })
			.ToListAsync(cancellationToken);

		var candidatesByKey = candidates
			.GroupBy(
				role => NormalizeNameKey(role.Name),
				StringComparer.Ordinal
			)
			.ToDictionary(
				group => group.Key,
				group => group.ToList(),
				StringComparer.Ordinal
			);

		var resolutions = new List<ResolveTenantRoleNameResolution>(
			lookups.Count
		);

		foreach (var lookup in lookups) {
			Guid? resolvedRoleId = null;
			string? reason = null;

			if (candidatesByKey.TryGetValue(lookup.ComparisonKey, out var matches)) {
				if (matches.Count == 1) {
					resolvedRoleId = matches[0].Id;
				} else {
					reason = ResolveTenantRoleNameResolution.ReasonAmbiguous;
				}
			} else {
				reason = ResolveTenantRoleNameResolution.ReasonNotFound;
			}

			resolutions.Add(new ResolveTenantRoleNameResolution {
				Name = lookup.Name,
				RoleId = resolvedRoleId,
				Reason = reason,
			});
		}

		return new ResolveTenantRoleNamesResult.Success(resolutions);

		static string NormalizeNameKey(string name) {
			return name.Trim().ToUpperInvariant();
		}
	}

}
