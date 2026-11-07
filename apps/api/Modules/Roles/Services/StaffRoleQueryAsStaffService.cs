using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Permissions.Entities;
using PublyApp.Api.Modules.Roles.Entities;

namespace PublyApp.Api.Modules.Roles.Services;

public class StaffRoleItem {
	public Guid Id { get; set; }
	public string Name { get; set; } = string.Empty;
	public string? Description { get; set; }
	public string? Icon { get; set; }
	public string? Tone { get; set; }
	// The seeded full-access system role is protected: the front hides its
	// edit/delete affordances and shows "Accès complet" instead of a count.
	public bool IsFullAccess { get; set; }
	public int UserAccountCount { get; set; }
}

public abstract record FindStaffRolesResult {
	/// <summary>
	/// Successful result containing the paginated staff roles.
	/// </summary>
	public sealed record Success(
		CursorPaginatedResult<StaffRoleItem> Data,
		int TotalCount,
		int TotalAssignments
	) : FindStaffRolesResult;

	/// <summary>
	/// Error result when the cursor record was not found (deleted or invalid).
	/// </summary>
	public sealed record CursorNotFound(string Cursor) : FindStaffRolesResult;

	/// <summary>
	/// Error result when the sortId is not supported.
	/// </summary>
	public sealed record InvalidSortId(string SortId)
		: FindStaffRolesResult;
}

public sealed record FindStaffRolesArgs(
	Guid Cursor,
	int? Limit,
	string? SortId,
	SortOrder? SortOrder,
	string? Search
);

public abstract record GetStaffRoleByIdServiceResult {
	public sealed record Success(StaffRoleItem Role)
		: GetStaffRoleByIdServiceResult;
	public sealed record RoleNotFound : GetStaffRoleByIdServiceResult;
}

public abstract record FindStaffRolePermissionKeysResult {
	public sealed record Success(List<string> PermissionKeys)
		: FindStaffRolePermissionKeysResult;
	public sealed record RoleNotFound : FindStaffRolePermissionKeysResult;
}

public interface IStaffRoleQueryAsStaffService {
	Task<FindStaffRolesResult> FindStaffRolesAsync(
		FindStaffRolesArgs args,
		CancellationToken cancellationToken = default
	);

	Task<GetStaffRoleByIdServiceResult> GetStaffRoleByIdAsync(
		Guid roleId,
		CancellationToken cancellationToken = default
	);

	Task<FindStaffRolePermissionKeysResult> FindStaffRolePermissionKeysAsync(
		Guid roleId,
		CancellationToken cancellationToken = default
	);
}

[Service(ServiceLifetime.Scoped)]
public sealed class StaffRoleQueryAsStaffService : IStaffRoleQueryAsStaffService {
	private readonly AppDbContext _DbContext;

	public StaffRoleQueryAsStaffService(
		AppDbContext dbContext
	) {
		this._DbContext = dbContext;
	}

	/// <summary>
	/// Finds staff roles using keyset pagination with multi-field sorting support.
	///
	/// KEYSET PAGINATION EXPLANATION:
	/// - The cursor is always a Role.Id (Guid), but we can sort by any field
	/// - For non-Id sorts, we use composite ordering: ORDER BY {sortField}, Id
	/// - When paginating, we look up the cursor record to get its sort field value
	/// - Then apply a keyset filter:
	///   (field > cursorValue) OR (field = cursorValue AND id > cursorId)
	/// - This ensures no gaps or duplicates in paginated results
	///
	/// EXAMPLE:
	/// Page 1: GET /roles?sort_id=name&sort_order=asc&limit=3
	///   - Returns: Alice(id:100), Bob(id:050), Charlie(id:200)
	///   - NextCursor: "200" (Charlie's id)
	///
	/// Page 2: GET /roles?sort_id=name&sort_order=asc&limit=3&cursor=200
	///   - Lookup: cursor=200 → Name="Charlie"
	///   - Query: WHERE (name > 'Charlie') OR (name = 'Charlie' AND id > 200)
	///   - Returns records after Charlie in alphabetical order
	/// </summary>
	public async Task<FindStaffRolesResult> FindStaffRolesAsync(
		FindStaffRolesArgs args,
		CancellationToken cancellationToken = default
	) {
		var effectiveLimit =
			args.Limit ?? AppEnvironment.Instance.PAGINATION_DEFAULT_LIMIT;
		var effectiveSortOrder = args.SortOrder ?? SortOrder.Desc;
		var effectiveSortId = args.SortId ?? "id";
		var search = args.Search;

		// Define handlers for each sortable field
		// Each handler has 3 responsibilities:
		// 1. GetCursorValue: Fetch the sort field value at the cursor position
		// 2. ApplyFilter: Apply the keyset WHERE clause based on cursor value
		// 3. ApplyOrdering: Apply the ORDER BY clause
		var sortFieldHandlers = new Dictionary<string, CursorSortFieldHandler<Role>>(
			StringComparer.OrdinalIgnoreCase
		) {
			["id"] = CursorSortFieldHandlerFactory.Create<Role, Guid, Guid?>(
				cursorLookupQuery: () => this._DbContext.Role
					.AsNoTracking()
					.Where(p => p.Scope == RoleScope.Staff
						&& !p.IsDeleted),
				keySelector: p => p.Id ?? Guid.Empty,
				idSelector: p => p.Id,
				cancellationToken
			),
			["name"] = CursorSortFieldHandlerFactory.Create<Role, string, Guid?>(
				cursorLookupQuery: () => this._DbContext.Role
					.AsNoTracking()
					.Where(p => p.Id != null
						&& p.Scope == RoleScope.Staff
						&& !p.IsDeleted),
				keySelector: p => p.Name,
				idSelector: p => p.Id,
				cancellationToken
			),
			["created_at"] = CursorSortFieldHandlerFactory.Create<Role, DateTime, Guid?>(
				cursorLookupQuery: () => this._DbContext.Role
					.AsNoTracking()
					.Where(p => p.Id != null
						&& p.Scope == RoleScope.Staff
						&& !p.IsDeleted),
				keySelector: p => p.CreatedAt,
				idSelector: p => p.Id,
				cancellationToken
			),
			["user_account_count"] = CursorSortFieldHandlerFactory.Create<Role, int, Guid?>(
				cursorLookupQuery: () => this._DbContext.Role
					.AsNoTracking()
					.Where(p => p.Id != null
						&& p.Scope == RoleScope.Staff
						&& !p.IsDeleted),
				keySelector: p => p.UserAccountRoles.Count,
				idSelector: p => p.Id,
				cancellationToken
			),
		};

		// ───────────────────────────────────────────────────────────────────────
		// STEP 1: Validate sortId parameter
		// ───────────────────────────────────────────────────────────────────────
		if (
			!sortFieldHandlers.TryGetValue(
				effectiveSortId,
				out CursorSortFieldHandler<Role>? handler
			)
		) {
			return new FindStaffRolesResult.InvalidSortId(effectiveSortId);
		}

		// ───────────────────────────────────────────────────────────────────────
		// STEP 2: Build base query
		// ───────────────────────────────────────────────────────────────────────
		// Start with staff roles only, excluding soft-deleted records
		var baseQuery =
			from p in this._DbContext.Role.AsNoTracking()
			where p.Scope == RoleScope.Staff
				&& !p.IsDeleted
				&& p.Id != null
			select p;

		IQueryable<Role> query = baseQuery;

		// Apply search filter (by name/description)
		// Search semantics: substring match (ILIKE %q%) for case-insensitive search
		if (search is { } q) {
			var pattern = $"%{LikePatternUtils.EscapeLikePattern(q)}%";
			query = query.Where(p =>
				EF.Functions.ILike(p.Name, pattern, LikePatternUtils.LikeEscapeChar)
				|| (p.Description != null && EF.Functions.ILike(p.Description, pattern, LikePatternUtils.LikeEscapeChar))
			);
		}

		// The header badge/panel counter describes the whole filtered collection.
		var totalCount = await query.CountAsync(cancellationToken);
		var totalAssignments = await query.SumAsync(
			role => role.UserAccountRoles.Count,
			cancellationToken
		);

		// ───────────────────────────────────────────────────────────────────────
		// STEP 3: Apply cursor-based filter (if paginating)
		// ───────────────────────────────────────────────────────────────────────
		// Apply keyset filter to get records AFTER the cursor
		if (args.Cursor != Guid.Empty) {
			// Fetch the sort field value at the cursor position
			var cursorValue = await handler.GetCursorValue(args.Cursor);

			// Validate that cursor exists
			if (cursorValue is null) {
				return new FindStaffRolesResult.CursorNotFound(
					args.Cursor.ToString()
				);
			}

			// Apply the keyset filter based on the sort field
			// This adds WHERE clause like:
			// WHERE (Name > 'Charlie') OR (Name = 'Charlie' AND Id > 200)
			query = handler.ApplyFilter(query, cursorValue, effectiveSortOrder == SortOrder.Asc);
		}

		// ───────────────────────────────────────────────────────────────────────
		// STEP 4: Apply ordering
		// ───────────────────────────────────────────────────────────────────────
		// Apply the appropriate ORDER BY clause based on sort field
		// Always includes Id as tie-breaker for deterministic ordering
		var orderedQuery = handler.ApplyOrdering(query, effectiveSortOrder == SortOrder.Asc);

		// ───────────────────────────────────────────────────────────────────────
		// STEP 5: Project and fetch results
		// ───────────────────────────────────────────────────────────────────────
		// Take limit+1 items to detect if there are more pages
		// Project to StaffRoleItem at DB level for efficiency
		var results = await orderedQuery
			.Select(p => new StaffRoleItem {
				Id = p.Id ?? Guid.Empty,
				Name = p.Name,
				Description = p.Description,
				Icon = p.Icon,
				Tone = p.Tone,
				IsFullAccess = p.IsFullAccess,
				UserAccountCount = p.UserAccountRoles.Count
			})
			.Take(effectiveLimit + 1)  // Fetch one extra to check for more pages
			.ToListAsync(cancellationToken);

		// ───────────────────────────────────────────────────────────────────────
		// STEP 6: Determine pagination state
		// ───────────────────────────────────────────────────────────────────────
		// If we got more results than requested, there's another page
		string? nextCursor = null;
		if (results.Count > effectiveLimit) {
			// Remove the extra item (it was only used to detect "has more")
			results.RemoveAt(results.Count - 1);
			// Set nextCursor to the last item's Id - client will use this for next request
			nextCursor = results.Last().Id.ToString();
		}
		// If results.Count <= effectiveLimit, nextCursor stays null (no more pages)

		return new FindStaffRolesResult.Success(
			new CursorPaginatedResult<StaffRoleItem> {
				Data = results,
				NextCursor = nextCursor,  // null = last page, otherwise = Id to continue from
			},
			totalCount,
			totalAssignments
		);
	}

	public async Task<GetStaffRoleByIdServiceResult> GetStaffRoleByIdAsync(
		Guid roleId,
		CancellationToken cancellationToken = default
	) {
		// This is a staff-only route, so we only allow staff-scoped roles here.
		// Missing/non-staff roles are treated as not-found for consistency with other staff endpoints.
		var role = await (
			from p in this._DbContext.Role
			where p.Id == roleId
				&& p.Scope == RoleScope.Staff
				&& !p.IsDeleted
			select new StaffRoleItem {
				Id = p.Id ?? Guid.Empty,
				Name = p.Name,
				Description = p.Description,
				Icon = p.Icon,
				Tone = p.Tone,
				IsFullAccess = p.IsFullAccess,
				UserAccountCount = p.UserAccountRoles.Count,
			}
		).FirstOrDefaultAsync(cancellationToken);

		if (role is null) {
			return new GetStaffRoleByIdServiceResult.RoleNotFound();
		}

		return new GetStaffRoleByIdServiceResult.Success(role);
	}

	public async Task<FindStaffRolePermissionKeysResult> FindStaffRolePermissionKeysAsync(
		Guid roleId,
		CancellationToken cancellationToken = default
	) {
		var roleExists = await (
			from p in this._DbContext.Role
			where p.Id == roleId
				&& p.Scope == RoleScope.Staff
				&& !p.IsDeleted
			select p.Id
		).AnyAsync(cancellationToken);

		if (!roleExists) {
			return new FindStaffRolePermissionKeysResult.RoleNotFound();
		}

		// Return only permission keys that still exist and are staff-scoped.
		// This keeps the UI consistent if a permission is removed from the DB later,
		// and prevents mixing staff roles with tenant/project permissions.
		var permissionKeys = await (
			from pp in this._DbContext.RolePermission
			join p in this._DbContext.Permission on pp.PermissionKey equals p.Key
			where pp.RoleId == roleId
				&& !p.IsDeleted
				&& p.Scope == PermissionScope.Staff
			select pp.PermissionKey
		)
			// Deterministic ordering: keeps UI stable and makes integration tests non-flaky.
			.OrderBy(k => k)
			.ToListAsync(cancellationToken);

		return new FindStaffRolePermissionKeysResult.Success(permissionKeys);
	}

}
