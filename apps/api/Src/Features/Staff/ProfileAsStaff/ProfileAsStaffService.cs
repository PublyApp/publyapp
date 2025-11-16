using MainApi.Src.Data.DbContext;
using MainApi.Src.Features.Common.Profile;
using MainApi.Src.Lib;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace MainApi.Src.Features.Staff.ProfileAsStaff;

public class StaffProfileItem {
	public Guid Id { get; set; }
	public string Name { get; set; } = string.Empty;
	public string? Description { get; set; }
	public int UserAccountCount { get; set; }
}

/// <summary>
/// Discriminated union representing the result of finding staff profiles.
/// </summary>
public abstract record FindStaffProfilesResult {
	/// <summary>
	/// Successful result containing the paginated staff profiles.
	/// </summary>
	public sealed record Success(CursorPaginatedResult<StaffProfileItem> Data) : FindStaffProfilesResult;

	/// <summary>
	/// Error result when the cursor record was not found (deleted or invalid).
	/// </summary>
	public sealed record CursorNotFound(string Cursor) : FindStaffProfilesResult;

	/// <summary>
	/// Error result when the sortId is not supported.
	/// </summary>
	public sealed record InvalidSortId(string SortId) : FindStaffProfilesResult;
}

/// <summary>
/// Discriminated union representing the result of creating a staff profile.
/// </summary>
public abstract record CreateStaffProfileResult {
	/// <summary>
	/// Successful result containing the created profile.
	/// </summary>
	public sealed record Success(Profile Profile) : CreateStaffProfileResult;

	/// <summary>
	/// Error result when a profile with the same name already exists.
	/// </summary>
	public sealed record ProfileNameExists(string Name) : CreateStaffProfileResult;
}

public interface IProfileAsStaffService {
	Task<List<Profile>> FindTenantProfilesAsync(
		Guid tenantId,
		int? page = null,
		int? limit = null,
		string? sortId = null,
		SortOrder? sortOrder = null,
		CancellationToken cancellationToken = default
	);

	Task<FindStaffProfilesResult> FindStaffProfilesAsync(
		Guid cursor,
		int? limit = null,
		string? sortId = null,
		SortOrder? sortOrder = null,
		CancellationToken cancellationToken = default
	);

	Task<CreateStaffProfileResult> CreateStaffProfileAsync(
		string name,
		string? description = null,
		CancellationToken cancellationToken = default
	);
}

public class ProfileAsStaffService : IProfileAsStaffService {
	private readonly MainApiDbContext _dbContext;
	private readonly IOptions<AppSettings> _appSettings;

	public ProfileAsStaffService(MainApiDbContext dbContext, IOptions<AppSettings> appSettings) {
		_dbContext = dbContext;
		_appSettings = appSettings;
	}

	public async Task<List<Profile>> FindTenantProfilesAsync(
		Guid tenantId,
		int? page = null,
		int? limit = null,
		string? sortId = null,
		SortOrder? sortOrder = null,
		CancellationToken cancellationToken = default
	) {
		var effectivePage = page ?? 1;
		var effectiveSortOrder = sortOrder ?? SortOrder.Desc;
		var effectiveLimit = limit ?? _appSettings.Value.PAGINATION_DEFAULT_LIMIT;

		var query =
			from p in _dbContext.Profile
			where p.Scope == ProfileScope.Tenant
			&& p.TenantId == tenantId
			select p;

		return await query
			.Skip((effectivePage - 1) * effectiveLimit)
			.Take(effectiveLimit)
			.ToListAsync(cancellationToken);
	}

	/// <summary>
	/// Finds staff profiles using keyset pagination with multi-field sorting support.
	///
	/// KEYSET PAGINATION EXPLANATION:
	/// - The cursor is always a Profile.Id (Guid), but we can sort by any field
	/// - For non-Id sorts, we use composite ordering: ORDER BY {sortField}, Id
	/// - When paginating, we look up the cursor record to get its sort field value
	/// - Then apply a keyset filter: WHERE (field > cursorValue) OR (field = cursorValue AND id > cursorId)
	/// - This ensures no gaps or duplicates in paginated results
	///
	/// EXAMPLE:
	/// Page 1: GET /profiles?sortId=name&sortOrder=asc&limit=3
	///   - Returns: Alice(id:100), Bob(id:050), Charlie(id:200)
	///   - NextCursor: "200" (Charlie's id)
	///
	/// Page 2: GET /profiles?sortId=name&sortOrder=asc&limit=3&cursor=200
	///   - Lookup: cursor=200 → Name="Charlie"
	///   - Query: WHERE (name > 'Charlie') OR (name = 'Charlie' AND id > 200)
	///   - Returns records after Charlie in alphabetical order
	/// </summary>
	public async Task<FindStaffProfilesResult> FindStaffProfilesAsync(
		Guid cursor,
		int? limit = null,
		string? sortId = null,
		SortOrder? sortOrder = null,
		CancellationToken cancellationToken = default
	) {
		var effectiveLimit = limit ?? _appSettings.Value.PAGINATION_DEFAULT_LIMIT;
		var effectiveSortOrder = sortOrder ?? SortOrder.Desc;
		var effectiveSortId = (sortId ?? "id").ToLowerInvariant();

		// Define handlers for each sortable field
		// Each handler has 3 responsibilities:
		// 1. GetCursorValue: Fetch the sort field value at the cursor position
		// 2. ApplyFilter: Apply the keyset WHERE clause based on cursor value
		// 3. ApplyOrdering: Apply the ORDER BY clause
		var sortFieldHandlers = new Dictionary<string, SortFieldHandler> {
			// ═══════════════════════════════════════════════════════════════════════
			// HANDLER 1: Sort by Id
			// ═══════════════════════════════════════════════════════════════════════
			// Simplest case - cursor is the Id itself, so we just compare Id > cursor
			["id"] = new SortFieldHandler(
				// GetCursorValue: Just fetch the Id value
				getCursorValue: async (guid) => {
					var profile = await _dbContext.Profile.FindAsync(guid);
					return profile?.Id;
				},
				// ApplyFilter: Simple comparison - WHERE Id > cursor (or < for descending)
				applyFilter: (q, cursorValue, isAsc) => {
					var cursorGuid = (Guid?)cursorValue;
					if (cursorGuid is null) return q;
					return isAsc
						? q.Where(p => p.Id > cursorGuid)  // Ascending: get Ids AFTER cursor
						: q.Where(p => p.Id < cursorGuid); // Descending: get Ids BEFORE cursor
				},
				// ApplyOrdering: ORDER BY Id [ASC|DESC]
				applyOrdering: (q, isAsc) => isAsc
					? q.OrderBy(p => p.Id)
					: q.OrderByDescending(p => p.Id),
				// GetOffset: Count items BEFORE cursor
				getOffset: async (q, cursorValue, isAsc) => {
					var cursorGuid = (Guid?)cursorValue;
					if (cursorGuid is null) return 0;
					// ASC: Count items with Id < cursor (they come before in sort order)
					// DESC: Count items with Id > cursor (they come before in sort order)
					return isAsc
						? await q.CountAsync(p => p.Id < cursorGuid)
						: await q.CountAsync(p => p.Id > cursorGuid);
				}
			),

			// ═══════════════════════════════════════════════════════════════════════
			// HANDLER 2: Sort by Name
			// ═══════════════════════════════════════════════════════════════════════
			// Complex case - need Name AND Id for keyset pagination
			// Why? Multiple profiles can have the same name, so we need Id as tie-breaker
			["name"] = new SortFieldHandler(
				// GetCursorValue: Fetch BOTH Name and Id of the cursor record
				// We need both values to construct the keyset filter correctly
				getCursorValue: async (guid) => {
					var profile = await _dbContext.Profile
						.Where(p => p.Id == guid)
						.Select(p => new { p.Name, p.Id })
						.FirstOrDefaultAsync();
					// Return as tuple: (Name, Id)
					return profile is not null ? (profile.Name, profile.Id) : null;
				},
				// ApplyFilter: Keyset filter with tie-breaker
				// ASC:  WHERE (Name > 'cursorName') OR (Name = 'cursorName' AND Id > cursorId)
				// DESC: WHERE (Name < 'cursorName') OR (Name = 'cursorName' AND Id < cursorId)
				// This handles duplicate names correctly with consistent direction
				applyFilter: (q, cursorValue, isAsc) => {
					if (cursorValue is null) return q;
					var (cursorName, cursorId) = ((string, Guid?))cursorValue;
					return isAsc
						? q.Where(p => p.Name.CompareTo(cursorName) > 0 || (p.Name == cursorName && p.Id > cursorId))
						: q.Where(p => p.Name.CompareTo(cursorName) < 0 || (p.Name == cursorName && p.Id < cursorId));
				},
				// ApplyOrdering: ORDER BY Name, Id (both same direction)
				// Id tie-breaker MUST match primary sort direction for keyset pagination to work correctly
				applyOrdering: (q, isAsc) => isAsc
					? q.OrderBy(p => p.Name).ThenBy(p => p.Id)
					: q.OrderByDescending(p => p.Name).ThenByDescending(p => p.Id),
				// GetOffset: Count items BEFORE cursor (considering tie-breaker)
				getOffset: async (q, cursorValue, isAsc) => {
					if (cursorValue is null) return 0;
					var (cursorName, cursorId) = ((string, Guid?))cursorValue;
					// ASC: Count items with (Name < cursor) OR (Name = cursor AND Id < cursorId)
					// DESC: Count items with (Name > cursor) OR (Name = cursor AND Id > cursorId)
					return isAsc
						? await q.CountAsync(p => p.Name.CompareTo(cursorName) < 0 || (p.Name == cursorName && p.Id < cursorId))
						: await q.CountAsync(p => p.Name.CompareTo(cursorName) > 0 || (p.Name == cursorName && p.Id > cursorId));
				}
			),

			// ═══════════════════════════════════════════════════════════════════════
			// HANDLER 3: Sort by CreatedAt
			// ═══════════════════════════════════════════════════════════════════════
			// Similar to Name - need CreatedAt AND Id for keyset pagination
			// Multiple profiles can be created at the same timestamp
			["created_at"] = new SortFieldHandler(
				// GetCursorValue: Fetch BOTH CreatedAt and Id
				getCursorValue: async (guid) => {
					var profile = await _dbContext.Profile
						.Where(p => p.Id == guid)
						.Select(p => new { p.CreatedAt, p.Id })
						.FirstOrDefaultAsync();
					return profile is not null ? (profile.CreatedAt, profile.Id) : null;
				},
				// ApplyFilter: Keyset filter with tie-breaker in same direction
				// ASC:  WHERE (CreatedAt > cursor) OR (CreatedAt = cursor AND Id > cursorId)
				// DESC: WHERE (CreatedAt < cursor) OR (CreatedAt = cursor AND Id < cursorId)
				applyFilter: (q, cursorValue, isAsc) => {
					if (cursorValue is null) return q;
					var (cursorCreatedAt, cursorId) = ((DateTime, Guid?))cursorValue;
					return isAsc
						? q.Where(p => p.CreatedAt > cursorCreatedAt || (p.CreatedAt == cursorCreatedAt && p.Id > cursorId))
						: q.Where(p => p.CreatedAt < cursorCreatedAt || (p.CreatedAt == cursorCreatedAt && p.Id < cursorId));
				},
				// ApplyOrdering: ORDER BY CreatedAt, Id (both same direction)
				applyOrdering: (q, isAsc) => isAsc
					? q.OrderBy(p => p.CreatedAt).ThenBy(p => p.Id)
					: q.OrderByDescending(p => p.CreatedAt).ThenByDescending(p => p.Id),
				// GetOffset: Count items BEFORE cursor (considering tie-breaker)
				getOffset: async (q, cursorValue, isAsc) => {
					if (cursorValue is null) return 0;
					var (cursorCreatedAt, cursorId) = ((DateTime, Guid?))cursorValue;
					// ASC: Count items with (CreatedAt < cursor) OR (CreatedAt = cursor AND Id < cursorId)
					// DESC: Count items with (CreatedAt > cursor) OR (CreatedAt = cursor AND Id > cursorId)
					return isAsc
						? await q.CountAsync(p => p.CreatedAt < cursorCreatedAt || (p.CreatedAt == cursorCreatedAt && p.Id < cursorId))
						: await q.CountAsync(p => p.CreatedAt > cursorCreatedAt || (p.CreatedAt == cursorCreatedAt && p.Id > cursorId));
				}
			),

			// ═══════════════════════════════════════════════════════════════════════
			// HANDLER 4: Sort by UserAccountCount
			// ═══════════════════════════════════════════════════════════════════════
			// Computed field - count of related UserAccountProfiles
			// Many profiles can have the same count, so Id tie-breaker is essential
			["user_account_count"] = new SortFieldHandler(
				// GetCursorValue: Calculate the count for the cursor record
				getCursorValue: async (guid) => {
					var profile = await _dbContext.Profile
						.Where(p => p.Id == guid)
						.Select(p => new { Count = p.UserAccountProfiles.Count, p.Id })
						.FirstOrDefaultAsync();
					return profile is not null ? (profile.Count, profile.Id) : null;
				},
				// ApplyFilter: Keyset filter with tie-breaker in same direction
				// ASC:  WHERE (Count > cursor) OR (Count = cursor AND Id > cursorId)
				// DESC: WHERE (Count < cursor) OR (Count = cursor AND Id < cursorId)
				applyFilter: (q, cursorValue, isAsc) => {
					if (cursorValue is null) return q;
					var (cursorCount, cursorId) = ((int, Guid?))cursorValue;
					return isAsc
						? q.Where(p => p.UserAccountProfiles.Count > cursorCount || (p.UserAccountProfiles.Count == cursorCount && p.Id > cursorId))
						: q.Where(p => p.UserAccountProfiles.Count < cursorCount || (p.UserAccountProfiles.Count == cursorCount && p.Id < cursorId));
				},
				// ApplyOrdering: ORDER BY UserAccountProfiles.Count, Id (both same direction)
				applyOrdering: (q, isAsc) => isAsc
					? q.OrderBy(p => p.UserAccountProfiles.Count).ThenBy(p => p.Id)
					: q.OrderByDescending(p => p.UserAccountProfiles.Count).ThenByDescending(p => p.Id),
				// GetOffset: Count items BEFORE cursor (considering tie-breaker)
				getOffset: async (q, cursorValue, isAsc) => {
					if (cursorValue is null) return 0;
					var (cursorCount, cursorId) = ((int, Guid?))cursorValue;
					// ASC: Count items with (Count < cursor) OR (Count = cursor AND Id < cursorId)
					// DESC: Count items with (Count > cursor) OR (Count = cursor AND Id > cursorId)
					return isAsc
						? await q.CountAsync(p => p.UserAccountProfiles.Count < cursorCount || (p.UserAccountProfiles.Count == cursorCount && p.Id < cursorId))
						: await q.CountAsync(p => p.UserAccountProfiles.Count > cursorCount || (p.UserAccountProfiles.Count == cursorCount && p.Id > cursorId));
				}
			)
		};

		// ───────────────────────────────────────────────────────────────────────
		// STEP 1: Validate sortId parameter
		// ───────────────────────────────────────────────────────────────────────
		if (!sortFieldHandlers.ContainsKey(effectiveSortId)) {
			return new FindStaffProfilesResult.InvalidSortId(effectiveSortId);
		}

		var handler = sortFieldHandlers[effectiveSortId];

		// ───────────────────────────────────────────────────────────────────────
		// STEP 2: Build base query
		// ───────────────────────────────────────────────────────────────────────
		// Start with staff profiles only, excluding soft-deleted records
		var query = _dbContext.Profile
			.Where(p => p.Scope == ProfileScope.Staff && p.Id != null);

		// ───────────────────────────────────────────────────────────────────────
		// STEP 2.5: Get total count (before applying cursor filter)
		// ───────────────────────────────────────────────────────────────────────
		// Count all staff profiles for pagination UI (shows "X of Y")
		// This is fast for staff profiles (typically < 1000 records)
		var totalCount = await query.CountAsync(cancellationToken);

		// ───────────────────────────────────────────────────────────────────────
		// STEP 2.6: Calculate current offset (for page number calculation)
		// ───────────────────────────────────────────────────────────────────────
		// Count items that come BEFORE the current cursor in the sort order
		// This allows frontend to show correct page number: CurrentPage = floor(offset / limit) + 1
		int currentOffset = 0;
		object? cursorValue = null;

		if (cursor != Guid.Empty) {
			// Fetch the sort field value at the cursor position
			cursorValue = await handler.GetCursorValue(cursor);

			// Validate that cursor exists
			if (cursorValue is null) {
				return new FindStaffProfilesResult.CursorNotFound(cursor.ToString());
			}

			// Calculate how many items come before this cursor
			// Example: If cursor is at position 40 with limit=20, this returns 40
			// Frontend calculates: CurrentPage = floor(40 / 20) + 1 = 3
			currentOffset = await handler.GetOffset(query, cursorValue, effectiveSortOrder == SortOrder.Asc);
		}

		// ───────────────────────────────────────────────────────────────────────
		// STEP 3: Apply cursor-based filter (if paginating)
		// ───────────────────────────────────────────────────────────────────────
		// Apply keyset filter to get records AFTER the cursor
		// cursorValue was already fetched and validated in STEP 2.6
		if (cursor != Guid.Empty && cursorValue is not null) {
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
				Id = p.Id!.Value,
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
				TotalCount = totalCount,  // Total items across all pages
				CurrentOffset = currentOffset  // Items before current page (for calculating page number)
			}
		);
	}

	/// <summary>
	/// Creates a new staff profile.
	/// </summary>
	/// <param name="name">The name of the profile</param>
	/// <param name="description">Optional description for the profile</param>
	/// <param name="cancellationToken">Cancellation token</param>
	/// <returns>
	/// Success with the created profile, or ProfileNameExists if a staff
	/// profile with the same name already exists
	/// </returns>
	public async Task<CreateStaffProfileResult> CreateStaffProfileAsync(
		string name,
		string? description = null,
		CancellationToken cancellationToken = default
	) {
		// Check if profile with same name already exists for staff scope
		var normalizedName = name.Trim();
		var profileExists = await (
			from p in _dbContext.Profile
			where p.Scope == ProfileScope.Staff
				&& p.Name == normalizedName
			select p
		).AnyAsync(cancellationToken);

		if (profileExists) {
			return new CreateStaffProfileResult.ProfileNameExists(normalizedName);
		}

		// Create new staff profile using factory method
		var profile = Profile.CreateStaffProfile(
			normalizedName,
			description?.Trim()
		);

		await _dbContext.Profile.AddAsync(profile, cancellationToken);
		await _dbContext.SaveChangesAsync(cancellationToken);

		return new CreateStaffProfileResult.Success(profile);
	}

	/// <summary>
	/// Handler for a specific sort field in keyset pagination.
	/// Encapsulates the three operations needed to paginate by that field:
	/// 1. GetCursorValue: Look up the sort field value(s) at the cursor position
	/// 2. ApplyFilter: Apply WHERE clause to get records after the cursor
	/// 3. ApplyOrdering: Apply ORDER BY clause for the sort field
	/// </summary>
	private class SortFieldHandler {
		/// <summary>
		/// Fetches the sort field value(s) for the given cursor Id.
		/// Returns object? to support different return types:
		/// - Guid for "id" sort
		/// - (string, Guid) tuple for "name" sort
		/// - (DateTime, Guid) tuple for "created_at" sort
		/// - (int, Guid) tuple for "user_account_count" sort
		/// </summary>
		public Func<Guid, Task<object?>> GetCursorValue { get; }

		/// <summary>
		/// Applies keyset filter to get records after the cursor position.
		/// Parameters:
		/// - IQueryable: The query to filter
		/// - object?: The cursor value from GetCursorValue
		/// - bool: true for ascending, false for descending
		/// Returns: Filtered query
		/// </summary>
		public Func<IQueryable<Profile>, object?, bool, IQueryable<Profile>> ApplyFilter { get; }

		/// <summary>
		/// Applies ordering to the query.
		/// Parameters:
		/// - IQueryable: The query to order
		/// - bool: true for ascending, false for descending
		/// Returns: Ordered query
		/// </summary>
		public Func<IQueryable<Profile>, bool, IQueryable<Profile>> ApplyOrdering { get; }

		/// <summary>
		/// Counts items that come BEFORE the cursor in the sort order.
		/// Used to calculate current page number from offset.
		/// Parameters:
		/// - IQueryable: The base query (before cursor filter)
		/// - object?: The cursor value from GetCursorValue
		/// - bool: true for ascending, false for descending
		/// Returns: Count of items before cursor
		/// </summary>
		public Func<IQueryable<Profile>, object?, bool, Task<int>> GetOffset { get; }

		public SortFieldHandler(
			Func<Guid, Task<object?>> getCursorValue,
			Func<IQueryable<Profile>, object?, bool, IQueryable<Profile>> applyFilter,
			Func<IQueryable<Profile>, bool, IQueryable<Profile>> applyOrdering,
			Func<IQueryable<Profile>, object?, bool, Task<int>> getOffset
		) {
			GetCursorValue = getCursorValue;
			ApplyFilter = applyFilter;
			ApplyOrdering = applyOrdering;
			GetOffset = getOffset;
		}
	}
}
