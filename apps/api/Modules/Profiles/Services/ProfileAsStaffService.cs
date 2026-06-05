using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Invitations.Entities;
using PublyApp.Api.Modules.Permissions.Entities;
using PublyApp.Api.Modules.Profiles.Entities;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Modules.Profiles.Services;

public class StaffProfileItem {
	public Guid Id { get; set; }
	public string Name { get; set; } = string.Empty;
	public string? Description { get; set; }
	public int UserAccountCount { get; set; }
}

// Represents per-item failures for bulk operations where some rows can succeed and
// some fail independently.
public sealed record BulkProfileActionFailedItem(
	Guid ProfileId,
	string Error
);

// Normalized aggregate result returned from bulk delete operations.
public sealed record BulkProfileActionResult(
	int SucceededCount,
	int FailedCount,
	List<BulkProfileActionFailedItem> FailedItems
);

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

public sealed record UpdateStaffProfileArgs(
	Guid ProfileId,
	PatchField<string?> Name,
	PatchField<string?> Description
);

public abstract record UpdateStaffProfileResult {
	public sealed record Success(StaffProfileItem Profile)
		: UpdateStaffProfileResult;
	public sealed record ProfileNotFound : UpdateStaffProfileResult;
	public sealed record ProfileNameExists(string Name) : UpdateStaffProfileResult;
}

public sealed record SetStaffProfilePermissionArgs(
	Guid ProfileId,
	string PermissionKey,
	bool IsAssigned
);

public abstract record SetStaffProfilePermissionResult {
	public sealed record Success : SetStaffProfilePermissionResult;
	public sealed record ProfileNotFound : SetStaffProfilePermissionResult;
	public sealed record PermissionNotFound : SetStaffProfilePermissionResult;
}

public sealed record CreateStaffProfileArgs(
	string Name,
	string? Description,
	List<string> Permissions,
	List<string> Emails,
	Guid InvitedByUserId
);

public sealed record BulkDeleteStaffProfilesArgs(
	List<Guid> ProfileIds
);

public abstract record DeleteStaffProfileServiceResult {
	public sealed record Success(int DeletedProfileCount)
		: DeleteStaffProfileServiceResult;
	public sealed record ProfileNotFound : DeleteStaffProfileServiceResult;
}

/// <summary>
/// Discriminated union representing the result of creating a staff profile.
/// </summary>
public abstract record CreateStaffProfileResult {
	/// <summary>
	/// Successful result containing the created profile and operation statistics.
	/// </summary>
	public sealed record Success(
		Profile Profile,
		int PermissionsAssigned,
		int UsersAssigned,
		int InvitationsSent,
		List<(string Email, string Token)> InvitationTokens,
		List<string> EmailsToNotify
	) : CreateStaffProfileResult;

	/// <summary>
	/// Error result when a profile with the same name already exists.
	/// </summary>
	public sealed record ProfileNameExists(string Name) : CreateStaffProfileResult;

	/// <summary>
	/// Error result when one or more permission keys are invalid.
	/// </summary>
	public sealed record InvalidPermissions(List<string> InvalidKeys) : CreateStaffProfileResult;

	/// <summary>
	/// Error result when duplicate emails are provided.
	/// </summary>
	public sealed record DuplicateEmails(List<string> Emails) : CreateStaffProfileResult;

	/// <summary>
	/// Error result when users already have tenant or project accounts.
	/// Staff profiles can only be assigned to users without tenant/project accounts.
	/// </summary>
	public sealed record UsersWithConflictingAccounts(List<string> Emails) : CreateStaffProfileResult;

	/// <summary>
	/// Error result when no permissions are provided.
	/// At least one permission is required for staff profiles.
	/// </summary>
	public sealed record NoPermissionsProvided : CreateStaffProfileResult;
}

public interface IProfileAsStaffService {
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

	Task<UpdateStaffProfileResult> UpdateStaffProfileAsync(
		UpdateStaffProfileArgs args,
		CancellationToken cancellationToken = default
	);

	Task<SetStaffProfilePermissionResult> SetStaffProfilePermissionAsync(
		SetStaffProfilePermissionArgs args,
		CancellationToken cancellationToken = default
	);

	Task<CreateStaffProfileResult> CreateStaffProfileAsync(
		CreateStaffProfileArgs args,
		CancellationToken cancellationToken = default
	);

	Task<DeleteStaffProfileServiceResult> DeleteStaffProfileAsync(
		Guid profileId,
		CancellationToken cancellationToken = default
	);
	// Bulk staff profile deletion used by staff actions.
	Task<BulkProfileActionResult> BulkDeleteStaffProfilesAsync(
		BulkDeleteStaffProfilesArgs args,
		CancellationToken cancellationToken = default
	);
}

[Service(ServiceLifetime.Scoped)]
public class ProfileAsStaffService : IProfileAsStaffService {
	private readonly AppDbContext _dbContext;
	private readonly ILogger<ProfileAsStaffService> _logger;
	public ProfileAsStaffService(
		AppDbContext dbContext,
		ILogger<ProfileAsStaffService> logger
	) {
		_dbContext = dbContext;
		_logger = logger;
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

	public async Task<UpdateStaffProfileResult> UpdateStaffProfileAsync(
		UpdateStaffProfileArgs args,
		CancellationToken cancellationToken = default
	) {
		var profile = await (
			from p in _dbContext.Profile
			where p.Id == args.ProfileId
				&& p.Scope == ProfileScope.Staff
				&& !p.IsDeleted
			select p
		).FirstOrDefaultAsync(cancellationToken);

		if (profile is null) {
			return new UpdateStaffProfileResult.ProfileNotFound();
		}

		if (args.Name.IsPresent) {
			var candidateName = args.Name.Value?.Trim();

			// Validation should prevent null/empty names. This is a post-validation guard.
			if (string.IsNullOrWhiteSpace(candidateName)) {
				throw new InvalidOperationException(
					"UpdateStaffProfileAsync received an invalid name. " +
					"Ensure endpoint validation ran before calling the service."
				);
			}

			var exists = await (
				from p in _dbContext.Profile
				where p.Scope == ProfileScope.Staff
					&& !p.IsDeleted
					&& p.Id != args.ProfileId
					&& p.Name == candidateName
				select p.Id
			).AnyAsync(cancellationToken);

			if (exists) {
				return new UpdateStaffProfileResult.ProfileNameExists(candidateName);
			}

			profile.Name = candidateName;
		}

		if (args.Description.IsPresent) {
			profile.Description = args.Description.Value?.Trim();
		}

		await _dbContext.SaveChangesAsync(cancellationToken);

		// Same response contract as tenant profiles: count active membership rows only.
		var userAccountCount = await (
			from uap in _dbContext.UserAccountProfile
			where uap.ProfileId == args.ProfileId
			select uap.ProfileId
		).CountAsync(cancellationToken);

		var updated = new StaffProfileItem {
			Id = profile.GetRequiredId(),
			Name = profile.Name,
			Description = profile.Description,
			UserAccountCount = userAccountCount,
		};

		return new UpdateStaffProfileResult.Success(updated);
	}

	public async Task<SetStaffProfilePermissionResult> SetStaffProfilePermissionAsync(
		SetStaffProfilePermissionArgs args,
		CancellationToken cancellationToken = default
	) {
		var profileExists = await (
			from p in _dbContext.Profile
			where p.Id == args.ProfileId
				&& p.Scope == ProfileScope.Staff
				&& !p.IsDeleted
			select p.Id
		).AnyAsync(cancellationToken);

		if (!profileExists) {
			return new SetStaffProfilePermissionResult.ProfileNotFound();
		}

		var permissionExists = await (
			from p in _dbContext.Permission
			where p.Key == args.PermissionKey
				&& !p.IsDeleted
				&& p.Scope == PermissionScope.Staff
			select p.Key
		).AnyAsync(cancellationToken);

		if (!permissionExists) {
			return new SetStaffProfilePermissionResult.PermissionNotFound();
		}

		var existing = await (
			from pp in _dbContext.ProfilePermission
			where pp.ProfileId == args.ProfileId
				&& pp.PermissionKey == args.PermissionKey
			select pp
		).FirstOrDefaultAsync(cancellationToken);

		if (existing is null) {
			if (args.IsAssigned) {
				// First-time assignment: create the junction row.
				await _dbContext.ProfilePermission.AddAsync(
					new ProfilePermission {
						ProfileId = args.ProfileId,
						PermissionKey = args.PermissionKey,
					},
					cancellationToken
				);

				await _dbContext.SaveChangesAsync(cancellationToken);
			}

			// Unassigning a non-existent row is a no-op (idempotent).
			return new SetStaffProfilePermissionResult.Success();
		}

		if (args.IsAssigned) {
			// Existing row already represents an active grant; repeated POST is idempotent.
			return new SetStaffProfilePermissionResult.Success();
		}

		// DELETE removes the grant row so future POST can insert a fresh composite-key row.
		_dbContext.ProfilePermission.Remove(existing);
		await _dbContext.SaveChangesAsync(cancellationToken);

		return new SetStaffProfilePermissionResult.Success();
	}

	/// <summary>
	/// Creates a new staff profile with permissions and user assignments.
	/// </summary>
	/// <param name="name">The name of the profile</param>
	/// <param name="description">Optional description for the profile</param>
	/// <param name="permissions">List of permission keys to assign</param>
	/// <param name="emails">List of user emails to assign or invite</param>
	/// <param name="invitedByUserId">User ID creating the profile</param>
	/// <param name="cancellationToken">Cancellation token</param>
	/// <returns>
	/// Success with statistics, or error result if validation fails
	/// </returns>
	public async Task<CreateStaffProfileResult> CreateStaffProfileAsync(
		CreateStaffProfileArgs args,
		CancellationToken cancellationToken = default
	) {
		var name = args.Name;
		var description = args.Description;
		var permissions = args.Permissions;
		var emails = args.Emails;
		var invitedByUserId = args.InvitedByUserId;

		// Normalize and validate inputs
		var normalizedName = name.Trim();
		var normalizedEmails = emails
			.Select(e => e.Trim().ToLowerInvariant())
			.ToList();

		// CRITICAL: Business rule - at least one permission is required
		if (permissions.Count == 0) {
			return new CreateStaffProfileResult.NoPermissionsProvided();
		}

		// Check for duplicate emails in input
		var duplicateEmails = normalizedEmails
			.GroupBy(e => e)
			.Where(g => g.Count() > 1)
			.Select(g => g.Key)
			.ToList();

		if (duplicateEmails.Count > 0) {
			return new CreateStaffProfileResult.DuplicateEmails(duplicateEmails);
		}

		// Check if profile name already exists
		var profileExists = await (
			from p in _dbContext.Profile
			where p.Scope == ProfileScope.Staff
				&& p.Name == normalizedName
			select p
		).AnyAsync(cancellationToken);

		if (profileExists) {
			return new CreateStaffProfileResult.ProfileNameExists(normalizedName);
		}

		// Validate all permissions exist AND are Staff-scoped
		var validPermissionKeys = await (
			from p in _dbContext.Permission
			where permissions.Contains(p.Key)
				&& p.Scope == PermissionScope.Staff
			select p.Key
		).ToListAsync(cancellationToken);

		var invalidPermissions = permissions
			.Except(validPermissionKeys)
			.ToList();

		if (invalidPermissions.Count > 0) {
			return new CreateStaffProfileResult.InvalidPermissions(invalidPermissions);
		}

		// Begin transaction
		await using var transaction = await _dbContext.Database
			.BeginTransactionAsync(cancellationToken);

		try {
			// Create new staff profile using factory method
			var profile = Profile.CreateStaffProfile(
				normalizedName,
				description?.Trim()
			);

			await _dbContext.Profile.AddAsync(profile, cancellationToken);
			await _dbContext.SaveChangesAsync(cancellationToken);
			// Profile ID is now available

			var profileId = profile.GetRequiredId();

			// Create ProfilePermission entities
			var profilePermissions = permissions
				.Select(permissionKey => new ProfilePermission {
					ProfileId = profileId,
					PermissionKey = permissionKey
				})
				.ToList();

			if (profilePermissions.Count > 0) {
				await _dbContext.ProfilePermission
					.AddRangeAsync(profilePermissions, cancellationToken);
			}

			// Batch fetch existing users
			var existingUsers = await (
				from u in _dbContext.User
				where normalizedEmails.Contains(u.Email)
					&& !u.IsDeleted
				select u
			).ToListAsync(cancellationToken);

			var existingUserEmails = existingUsers
				.Select(u => u.Email.ToLowerInvariant())
				.ToHashSet();

			// CRITICAL: Check for users with tenant or project accounts
			// Staff profiles can ONLY be assigned to users without tenant/project accounts
			var existingUserIds = existingUsers.Select(u => u.GetRequiredId()).ToList();
			var conflictingAccounts = await (
				from ua in _dbContext.UserAccount
				where existingUserIds.Contains(ua.UserId)
					&& (ua.Scope == AccountScope.Tenant || ua.Scope == AccountScope.Project)
					&& !ua.IsDeleted && ua.Status != AccountStatus.Suspended
				select ua.UserId
			).ToListAsync(cancellationToken);

			if (conflictingAccounts.Count > 0) {
				// Get emails of users with conflicting accounts
				var conflictingUserIds = conflictingAccounts.ToHashSet();
				var conflictingEmails = existingUsers
					.Where(u => conflictingUserIds.Contains(u.GetRequiredId()))
					.Select(u => u.Email)
					.ToList();

				return new CreateStaffProfileResult.UsersWithConflictingAccounts(conflictingEmails);
			}
			// Batch fetch existing staff accounts for these users
			var existingStaffAccounts = await (
				from ua in _dbContext.UserAccount
				where existingUserIds.Contains(ua.UserId)
					&& ua.Scope == AccountScope.Staff
					&& !ua.IsDeleted && ua.Status != AccountStatus.Suspended
				select ua
			).ToListAsync(cancellationToken);

			var usersWithStaffAccounts = existingStaffAccounts
				.Select(ua => ua.UserId)
				.ToHashSet();

			// CRITICAL: Batch fetch existing UserAccountProfile links to prevent duplicates
			var existingStaffAccountIds = existingStaffAccounts
				.Select(ua => ua.GetRequiredId())
				.ToList();

			var existingProfileLinks = await (
				from uap in _dbContext.UserAccountProfile
				where existingStaffAccountIds.Contains(uap.UserAccountId)
					&& uap.ProfileId == profileId
				select uap.UserAccountId
			).ToListAsync(cancellationToken);

			var accountsAlreadyLinked = existingProfileLinks.ToHashSet();

			// Identify missing emails (need invitations)
			var missingEmails = normalizedEmails
				.Except(existingUserEmails)
				.ToList();

			// PERFORMANCE OPTIMIZATION: Batch create UserAccounts to avoid multiple SaveChanges

			// Step 6a: Identify users needing new staff accounts
			var usersNeedingStaffAccounts = existingUsers
				.Where(u => !usersWithStaffAccounts.Contains(u.GetRequiredId()))
				.ToList();

			// Step 6b: Batch create all new UserAccounts (SINGLE SaveChanges)
			var newUserAccountsMap = new Dictionary<Guid, UserAccount>();

			if (usersNeedingStaffAccounts.Count > 0) {
				var newUserAccountsToCreate = usersNeedingStaffAccounts
					.Select(user => {
						var userAccount = UserAccount.CreateStaffAccount(
							user.GetRequiredId(),
							AccountLevel.User
						);
						newUserAccountsMap[user.GetRequiredId()] = userAccount;
						return userAccount;
					})
					.ToList();

				await _dbContext.UserAccount.AddRangeAsync(newUserAccountsToCreate, cancellationToken);
				await _dbContext.SaveChangesAsync(cancellationToken);
				// All UserAccount IDs are now available
			}

			// Step 6c: Create UserAccountProfile links for all users
			var newUserAccountProfiles = new List<UserAccountProfile>();
			var newLinksCreated = 0;
			var existingLinksSkipped = 0;
			var emailsToNotify = new List<string>();

			foreach (var user in existingUsers) {
				var userId = user.GetRequiredId();
				Guid accountId;

				// Check if user already has a staff account
				if (!usersWithStaffAccounts.Contains(userId)) {
					// User just got a new staff account - get it from our map
					var newAccount = newUserAccountsMap[userId];
					accountId = newAccount.GetRequiredId();
					emailsToNotify.Add(user.Email);
				} else {
					// User has existing staff account
					var existingAccount = existingStaffAccounts
						.First(ua => ua.UserId == userId);
					accountId = existingAccount.GetRequiredId();

					// CRITICAL: Only create link if it doesn't already exist
					if (accountsAlreadyLinked.Contains(accountId)) {
						existingLinksSkipped++;
						continue;
					}

					emailsToNotify.Add(user.Email);
				}

				// Create UserAccountProfile link
				var userAccountProfile = new UserAccountProfile {
					UserAccountId = accountId,
					ProfileId = profileId
				};
				newUserAccountProfiles.Add(userAccountProfile);
				newLinksCreated++;
			}

			// Batch insert all UserAccountProfile links
			if (newUserAccountProfiles.Count > 0) {
				await _dbContext.UserAccountProfile
					.AddRangeAsync(newUserAccountProfiles, cancellationToken);
			}

			// Check for existing pending invitations
			var existingInvitations = await (
				from i in _dbContext.Invitation
				where missingEmails.Contains(i.Email)
					&& i.Scope == InvitationScope.Staff
					&& i.Status == InvitationStatus.Pending
				select i.Email.ToLowerInvariant()
			).ToListAsync(cancellationToken);

			// Filter out emails with pending invitations
			var emailsNeedingInvitations = missingEmails
				.Except(existingInvitations)
				.ToList();

			// Generate invitations with tokens
			var invitationTokens = new List<(string Email, string Token)>();
			var newInvitations = new List<Invitation>();

			foreach (var email in emailsNeedingInvitations) {
				if (email is null) {
					throw new InvalidOperationException(
						"CreateStaffProfileAsync encountered a null invitation email after validation."
					);
				}

				// Generate token using CryptoUtils
				var token = CryptoUtils.RandomString(AppEnvironment.Instance.INVITATION_TOKEN_LENGTH);
				var expiresAt = DateTime.UtcNow.AddDays(7);

				var invitation = Invitation.CreateStaffInvitationWithProfiles(
					email,
					new List<Guid> { profileId },
					invitedByUserId,
					expiresAt,
					token
				);

				invitation.ValidateInvitationType();
				newInvitations.Add(invitation);
				invitationTokens.Add((email, token));
			}

			if (newInvitations.Count > 0) {
				await _dbContext.Invitation
					.AddRangeAsync(newInvitations, cancellationToken);
			}

			// Save all changes
			await _dbContext.SaveChangesAsync(cancellationToken);
			await transaction.CommitAsync(cancellationToken);

			if (_logger.IsEnabled(LogLevel.Information)) {
				_logger.LogInformation(
					"Created staff profile {ProfileName} with {PermissionsCount} permissions, " +
					"{NewLinksCount} new user assignments, {ExistingLinksCount} existing links skipped, " +
					"{InvitationsCount} invitations sent",
					normalizedName,
					permissions.Count,
					newLinksCreated,
					existingLinksSkipped,
					invitationTokens.Count
				);
			}

			return new CreateStaffProfileResult.Success(
				profile,
				permissions.Count,
				newLinksCreated,
				invitationTokens.Count,
				invitationTokens,
				emailsToNotify
			);
		} catch (Exception ex) {
			await transaction.RollbackAsync(cancellationToken);
			if (_logger.IsEnabled(LogLevel.Error)) {
				_logger.LogError(ex, "Failed to create staff profile {ProfileName}", normalizedName);
			}
			throw;
		}
	}

	public async Task<DeleteStaffProfileServiceResult> DeleteStaffProfileAsync(
		Guid profileId,
		CancellationToken cancellationToken = default
	) {
		// This is a staff-only route: treat missing/non-staff profiles as not found.
		var profile = await (
			from p in _dbContext.Profile
			where p.Id == profileId
				&& p.Scope == ProfileScope.Staff
				&& !p.IsDeleted
			select p
		).FirstOrDefaultAsync(cancellationToken);

		if (profile is null) {
			return new DeleteStaffProfileServiceResult.ProfileNotFound();
		}

		// Soft-delete the profile (repo convention).
		// We also hard-delete the junction rows so that:
		// - the profile stops contributing to UserAccountCount immediately, and
		// - re-creating links later can't conflict with unique constraints.
		var profileIdValue = profile.GetRequiredId();

		var links = await (
			from uap in _dbContext.UserAccountProfile
			where uap.ProfileId == profileIdValue
			select uap
		).ToListAsync(cancellationToken);

		if (links.Count > 0) {
			_dbContext.ForceHardDeleteRange(links);
		}

		var permissions = await (
			from pp in _dbContext.ProfilePermission
			where pp.ProfileId == profileIdValue
			select pp
		).ToListAsync(cancellationToken);

		if (permissions.Count > 0) {
			_dbContext.ForceHardDeleteRange(permissions);
		}

		profile.IsDeleted = true;
		profile.DeletedAt = DateTime.UtcNow;
		profile.UpdatedAt = DateTime.UtcNow;

		await _dbContext.SaveChangesAsync(cancellationToken);

		return new DeleteStaffProfileServiceResult.Success(DeletedProfileCount: 1);
	}

	public async Task<BulkProfileActionResult> BulkDeleteStaffProfilesAsync(
		BulkDeleteStaffProfilesArgs args,
		CancellationToken cancellationToken = default
	) {
		// Deduplicate caller input first to avoid duplicate work and duplicate
		// failed/succeeded accounting for repeated IDs.
		var requestedProfileIds = args.ProfileIds.Distinct().ToList();

		if (requestedProfileIds.Count == 0) {
			return new BulkProfileActionResult(
				SucceededCount: 0,
				FailedCount: 0,
				FailedItems: []
			);
		}

		// Load candidate staff profiles once, then evaluate each requested ID without
		// issuing a per-profile delete request.
		var profiles = await (
			from p in _dbContext.Profile
			where p.Scope == ProfileScope.Staff
				&& !p.IsDeleted
				&& p.Id != null
				&& requestedProfileIds.Contains(p.Id.Value)
			select p
		).ToListAsync(cancellationToken);

		var profileById = profiles.ToDictionary(p => p.GetRequiredId());
		var failedItems = new List<BulkProfileActionFailedItem>();
		foreach (var requestedProfileId in requestedProfileIds) {
			if (!profileById.ContainsKey(requestedProfileId)) {
				failedItems.Add(
					new BulkProfileActionFailedItem(
						requestedProfileId,
						"Profile not found"
					)
				);
			}
		}

		// Drop default profiles from the delete list before touching joins or row state.
		var deletableProfileIds = profileById
			.Where(profile => !profile.Value.IsDefault)
			.Select(profile => profile.Key)
			.ToList();
		if (deletableProfileIds.Count == 0) {
			return new BulkProfileActionResult(
				SucceededCount: 0,
				FailedCount: failedItems.Count,
				FailedItems: failedItems
			);
		}

		var links = await (
			from uap in _dbContext.UserAccountProfile
			where deletableProfileIds.Contains(uap.ProfileId)
			select uap
		).ToListAsync(cancellationToken);

		if (links.Count > 0) {
			_dbContext.ForceHardDeleteRange(links);
		}

		var permissions = await (
			from pp in _dbContext.ProfilePermission
			where deletableProfileIds.Contains(pp.ProfileId)
			select pp
		).ToListAsync(cancellationToken);

		if (permissions.Count > 0) {
			_dbContext.ForceHardDeleteRange(permissions);
		}

		// Soft-delete only non-default profiles in-memory and persist once.
		var profilesToDelete = profileById
			.Values
			.Where(profile => !profile.IsDefault)
			.ToList();

		foreach (var profile in profilesToDelete) {
			profile.IsDeleted = true;
			profile.DeletedAt = DateTime.UtcNow;
			profile.UpdatedAt = DateTime.UtcNow;
		}

		await _dbContext.SaveChangesAsync(cancellationToken);

		var failedProfileIds = new HashSet<Guid>(failedItems.Select(item => item.ProfileId));
		var succeededProfileIds = requestedProfileIds
			.Where(id => !failedProfileIds.Contains(id))
			.ToList();

		return new BulkProfileActionResult(
			SucceededCount: succeededProfileIds.Count,
			FailedCount: failedItems.Count,
			FailedItems: failedItems
		);
	}



}
