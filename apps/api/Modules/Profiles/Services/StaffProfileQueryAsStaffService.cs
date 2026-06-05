using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Modules.Permissions.Entities;
using PublyApp.Api.Modules.Profiles.Entities;

namespace PublyApp.Api.Modules.Profiles.Services;

public class StaffProfileItem {
	public Guid Id { get; set; }
	public string Name { get; set; } = string.Empty;
	public string? Description { get; set; }
	public int UserAccountCount { get; set; }
}

public abstract record FindStaffProfilesResult {
	/// <summary>
	/// Successful result containing the paginated staff profiles.
	/// </summary>
	public sealed record Success(CursorPaginatedResult<StaffProfileItem> Data)
		: FindStaffProfilesResult;

	/// <summary>
	/// Error result when the cursor record was not found (deleted or invalid).
	/// </summary>
	public sealed record CursorNotFound(string Cursor) : FindStaffProfilesResult;

	/// <summary>
	/// Error result when the sortId is not supported.
	/// </summary>
	public sealed record InvalidSortId(string SortId)
		: FindStaffProfilesResult;
}

public sealed record FindStaffProfilesArgs(
	Guid Cursor,
	int? Limit,
	string? SortId,
	SortOrder? SortOrder,
	string? Search
);

public abstract record GetStaffProfileByIdServiceResult {
	public sealed record Success(StaffProfileItem Profile)
		: GetStaffProfileByIdServiceResult;
	public sealed record ProfileNotFound : GetStaffProfileByIdServiceResult;
}

public abstract record FindStaffProfilePermissionKeysResult {
	public sealed record Success(List<string> PermissionKeys)
		: FindStaffProfilePermissionKeysResult;
	public sealed record ProfileNotFound : FindStaffProfilePermissionKeysResult;
}

public interface IStaffProfileQueryAsStaffService {
	Task<FindStaffProfilesResult> FindStaffProfilesAsync(
		FindStaffProfilesArgs args,
		CancellationToken cancellationToken = default
	);

	Task<GetStaffProfileByIdServiceResult> GetStaffProfileByIdAsync(
		Guid profileId,
		CancellationToken cancellationToken = default
	);

	Task<FindStaffProfilePermissionKeysResult> FindStaffProfilePermissionKeysAsync(
		Guid profileId,
		CancellationToken cancellationToken = default
	);
}

[Service(ServiceLifetime.Scoped)]
public sealed class StaffProfileQueryAsStaffService : IStaffProfileQueryAsStaffService {
	private readonly AppDbContext _dbContext;

	public StaffProfileQueryAsStaffService(
		AppDbContext dbContext
	) {
		_dbContext = dbContext;
	}

	/// <summary>
	/// Finds staff profiles using keyset pagination with multi-field sorting support.
	///
	/// KEYSET PAGINATION EXPLANATION:
	/// - The cursor is always a Profile.Id (Guid), but we can sort by any field
	/// - For non-Id sorts, we use composite ordering: ORDER BY {sortField}, Id
	/// - When paginating, we look up the cursor record to get its sort field value
	/// - Then apply a keyset filter:
	///   (field > cursorValue) OR (field = cursorValue AND id > cursorId)
	/// - This ensures no gaps or duplicates in paginated results
	///
	/// EXAMPLE:
	/// Page 1: GET /profiles?sort_id=name&sort_order=asc&limit=3
	///   - Returns: Alice(id:100), Bob(id:050), Charlie(id:200)
	///   - NextCursor: "200" (Charlie's id)
	///
	/// Page 2: GET /profiles?sort_id=name&sort_order=asc&limit=3&cursor=200
	///   - Lookup: cursor=200 → Name="Charlie"
	///   - Query: WHERE (name > 'Charlie') OR (name = 'Charlie' AND id > 200)
	///   - Returns records after Charlie in alphabetical order
	/// </summary>
	public async Task<FindStaffProfilesResult> FindStaffProfilesAsync(
		FindStaffProfilesArgs args,
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
		var sortFieldHandlers = new Dictionary<string, CursorSortFieldHandler<Profile>>(
			StringComparer.OrdinalIgnoreCase
		) {
			// ═══════════════════════════════════════════════════════════════════════
			// HANDLER 1: Sort by Id
			// ═══════════════════════════════════════════════════════════════════════
			// Simplest case - cursor is the Id itself, so we just compare Id > cursor
			["id"] = new CursorSortFieldHandler<Profile>(
					// GetCursorValue: Just fetch the Id value
					getCursorValue: async (guid) => {
						var profileId = await _dbContext.Profile
							.AsNoTracking()
							.Where(p => p.Id == guid
								&& p.Scope == ProfileScope.Staff
								&& !p.IsDeleted)
							.Select(p => p.Id)
							.FirstOrDefaultAsync(cancellationToken);
						return profileId;
					},
					// ApplyFilter: Simple comparison - WHERE Id > cursor (or < for descending)
					applyFilter: (q, cursorValue, isAsc) => {
						var cursorGuid = (Guid?)cursorValue;
						if (cursorGuid is null) {
							return q;
						}

						return isAsc
							? q.Where(p => p.Id > cursorGuid)  // Ascending: get Ids AFTER cursor
							: q.Where(p => p.Id < cursorGuid); // Descending: get Ids BEFORE cursor
					},
					// ApplyOrdering: ORDER BY Id [ASC|DESC]
					applyOrdering: (q, isAsc) => isAsc
						? q.OrderBy(p => p.Id)
						: q.OrderByDescending(p => p.Id)
				),

			// ═══════════════════════════════════════════════════════════════════════
			// HANDLER 2: Sort by Name
			// ═══════════════════════════════════════════════════════════════════════
			// Complex case - need Name AND Id for keyset pagination
			// Why? Multiple profiles can have the same name, so we need Id as tie-breaker
			["name"] = new CursorSortFieldHandler<Profile>(
					// GetCursorValue: Fetch BOTH Name and Id of the cursor record
					// We need both values to construct the keyset filter correctly
					getCursorValue: async (guid) => {
						var profile = await _dbContext.Profile
							.AsNoTracking()
							.Where(p => p.Id == guid
								&& p.Scope == ProfileScope.Staff
								&& !p.IsDeleted)
							.Select(p => new { p.Name, p.Id })
							.FirstOrDefaultAsync(cancellationToken);
						// Return as tuple: (Name, Id)
						return profile is not null ? (profile.Name, profile.Id) : null;
					},
					// ApplyFilter: Keyset filter with tie-breaker
					// ASC:  WHERE (Name > 'cursorName') OR (Name = 'cursorName' AND Id > cursorId)
					// DESC: WHERE (Name < 'cursorName') OR (Name = 'cursorName' AND Id < cursorId)
					// This handles duplicate names correctly with consistent direction
					applyFilter: (q, cursorValue, isAsc) => {
						if (cursorValue is null) {
							return q;
						}

						var (cursorName, cursorId) = ((string, Guid?))cursorValue;
						return isAsc
							? q.Where(
								p =>
									p.Name.CompareTo(cursorName) > 0
									|| (p.Name == cursorName && p.Id > cursorId)
							)
							: q.Where(
								p =>
									p.Name.CompareTo(cursorName) < 0
									|| (p.Name == cursorName && p.Id < cursorId)
							);
					},
					// ApplyOrdering: ORDER BY Name, Id (both same direction)
					// Id tie-breaker MUST match primary sort direction for keyset pagination to work correctly
					applyOrdering: (q, isAsc) => isAsc
						? q.OrderBy(p => p.Name).ThenBy(p => p.Id)
						: q.OrderByDescending(p => p.Name).ThenByDescending(p => p.Id)
				),

			// ═══════════════════════════════════════════════════════════════════════
			// HANDLER 3: Sort by CreatedAt
			// ═══════════════════════════════════════════════════════════════════════
			// Similar to Name - need CreatedAt AND Id for keyset pagination
			// Multiple profiles can be created at the same timestamp
			["created_at"] = new CursorSortFieldHandler<Profile>(
					// GetCursorValue: Fetch BOTH CreatedAt and Id
					getCursorValue: async (guid) => {
						var profile = await _dbContext.Profile
							.AsNoTracking()
							.Where(p => p.Id == guid
								&& p.Scope == ProfileScope.Staff
								&& !p.IsDeleted)
							.Select(p => new { p.CreatedAt, p.Id })
							.FirstOrDefaultAsync(cancellationToken);
						return profile is not null ? (profile.CreatedAt, profile.Id) : null;
					},
					// ApplyFilter: Keyset filter with tie-breaker in same direction
					// ASC:  WHERE (CreatedAt > cursor) OR (CreatedAt = cursor AND Id > cursorId)
					// DESC: WHERE (CreatedAt < cursor) OR (CreatedAt = cursor AND Id < cursorId)
					applyFilter: (q, cursorValue, isAsc) => {
						if (cursorValue is null) {
							return q;
						}

						var (cursorCreatedAt, cursorId) = ((DateTime, Guid?))cursorValue;
						return isAsc
							? q.Where(
								p =>
									p.CreatedAt > cursorCreatedAt
									|| (p.CreatedAt == cursorCreatedAt && p.Id > cursorId)
							)
							: q.Where(
								p =>
									p.CreatedAt < cursorCreatedAt
									|| (p.CreatedAt == cursorCreatedAt && p.Id < cursorId)
							);
					},
					// ApplyOrdering: ORDER BY CreatedAt, Id (both same direction)
					applyOrdering: (q, isAsc) => isAsc
						? q.OrderBy(p => p.CreatedAt).ThenBy(p => p.Id)
						: q.OrderByDescending(p => p.CreatedAt).ThenByDescending(p => p.Id)
				),

			// ═══════════════════════════════════════════════════════════════════════
			// HANDLER 4: Sort by UserAccountCount
			// ═══════════════════════════════════════════════════════════════════════
			// Computed field - count of related UserAccountProfiles
			// Many profiles can have the same count, so Id tie-breaker is essential
			["user_account_count"] = new CursorSortFieldHandler<Profile>(
					// GetCursorValue: Calculate the count for the cursor record
					getCursorValue: async (guid) => {
						var profile = await _dbContext.Profile
							.AsNoTracking()
							.Where(p => p.Id == guid
								&& p.Scope == ProfileScope.Staff
								&& !p.IsDeleted)
							.Select(p => new { Count = p.UserAccountProfiles.Count, p.Id })
							.FirstOrDefaultAsync(cancellationToken);
						return profile is not null ? (profile.Count, profile.Id) : null;
					},
					// ApplyFilter: Keyset filter with tie-breaker in same direction
					// ASC:  WHERE (Count > cursor) OR (Count = cursor AND Id > cursorId)
					// DESC: WHERE (Count < cursor) OR (Count = cursor AND Id < cursorId)
					applyFilter: (q, cursorValue, isAsc) => {
						if (cursorValue is null) {
							return q;
						}

						var (cursorCount, cursorId) = ((int, Guid?))cursorValue;
						return isAsc
							? q.Where(
								p =>
									p.UserAccountProfiles.Count > cursorCount
									|| (p.UserAccountProfiles.Count == cursorCount
										&& p.Id > cursorId)
							)
							: q.Where(
								p =>
									p.UserAccountProfiles.Count < cursorCount
									|| (p.UserAccountProfiles.Count == cursorCount
										&& p.Id < cursorId)
							);
					},
					// ApplyOrdering: ORDER BY UserAccountProfiles.Count, Id (both same direction)
					applyOrdering: (q, isAsc) => isAsc
						? q.OrderBy(p => p.UserAccountProfiles.Count).ThenBy(p => p.Id)
						: q.OrderByDescending(p => p.UserAccountProfiles.Count).ThenByDescending(p => p.Id)
				)
		};

		// ───────────────────────────────────────────────────────────────────────
		// STEP 1: Validate sortId parameter
		// ───────────────────────────────────────────────────────────────────────
		if (
			!sortFieldHandlers.TryGetValue(
				effectiveSortId,
				out CursorSortFieldHandler<Profile>? handler
			)
		) {
			return new FindStaffProfilesResult.InvalidSortId(effectiveSortId);
		}

		// ───────────────────────────────────────────────────────────────────────
		// STEP 2: Build base query
		// ───────────────────────────────────────────────────────────────────────
		// Start with staff profiles only, excluding soft-deleted records
		var baseQuery =
			from p in _dbContext.Profile.AsNoTracking()
			where p.Scope == ProfileScope.Staff
				&& !p.IsDeleted
				&& p.Id != null
			select p;

		IQueryable<Profile> query = baseQuery;

		// Apply search filter (by name/description)
		// Search semantics: substring match (ILIKE %q%) for case-insensitive search
		if (search is { } q) {
			var pattern = $"%{q}%";
			query = query.Where(p =>
				EF.Functions.ILike(p.Name, pattern)
				|| (p.Description != null && EF.Functions.ILike(p.Description, pattern))
			);
		}

		// ───────────────────────────────────────────────────────────────────────
		// STEP 3: Apply cursor-based filter (if paginating)
		// ───────────────────────────────────────────────────────────────────────
		// Apply keyset filter to get records AFTER the cursor
		if (args.Cursor != Guid.Empty) {
			// Fetch the sort field value at the cursor position
			var cursorValue = await handler.GetCursorValue(args.Cursor);

			// Validate that cursor exists
			if (cursorValue is null) {
				return new FindStaffProfilesResult.CursorNotFound(
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
		// Project to StaffProfileItem at DB level for efficiency
		var results = await orderedQuery
			.Select(p => new StaffProfileItem {
				Id = p.Id ?? Guid.Empty,
				Name = p.Name,
				Description = p.Description,
				UserAccountCount = p.UserAccountProfiles.Count
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

		return new FindStaffProfilesResult.Success(
			new CursorPaginatedResult<StaffProfileItem> {
				Data = results,
				NextCursor = nextCursor,  // null = last page, otherwise = Id to continue from
			}
		);
	}

	public async Task<GetStaffProfileByIdServiceResult> GetStaffProfileByIdAsync(
		Guid profileId,
		CancellationToken cancellationToken = default
	) {
		// This is a staff-only route, so we only allow staff-scoped profiles here.
		// Missing/non-staff profiles are treated as not-found for consistency with other staff endpoints.
		var profile = await (
			from p in _dbContext.Profile
			where p.Id == profileId
				&& p.Scope == ProfileScope.Staff
				&& !p.IsDeleted
			select new StaffProfileItem {
				Id = p.Id ?? Guid.Empty,
				Name = p.Name,
				Description = p.Description,
				UserAccountCount = p.UserAccountProfiles.Count,
			}
		).FirstOrDefaultAsync(cancellationToken);

		if (profile is null) {
			return new GetStaffProfileByIdServiceResult.ProfileNotFound();
		}

		return new GetStaffProfileByIdServiceResult.Success(profile);
	}

	public async Task<FindStaffProfilePermissionKeysResult> FindStaffProfilePermissionKeysAsync(
		Guid profileId,
		CancellationToken cancellationToken = default
	) {
		var profileExists = await (
			from p in _dbContext.Profile
			where p.Id == profileId
				&& p.Scope == ProfileScope.Staff
				&& !p.IsDeleted
			select p.Id
		).AnyAsync(cancellationToken);

		if (!profileExists) {
			return new FindStaffProfilePermissionKeysResult.ProfileNotFound();
		}

		// Return only permission keys that still exist and are staff-scoped.
		// This keeps the UI consistent if a permission is removed from the DB later,
		// and prevents mixing staff profiles with tenant/project permissions.
		var permissionKeys = await (
			from pp in _dbContext.ProfilePermission
			join p in _dbContext.Permission on pp.PermissionKey equals p.Key
			where pp.ProfileId == profileId
				&& !p.IsDeleted
				&& p.Scope == PermissionScope.Staff
			select pp.PermissionKey
		)
			// Deterministic ordering: keeps UI stable and makes integration tests non-flaky.
			.OrderBy(k => k)
			.ToListAsync(cancellationToken);

		return new FindStaffProfilePermissionKeysResult.Success(permissionKeys);
	}

}
