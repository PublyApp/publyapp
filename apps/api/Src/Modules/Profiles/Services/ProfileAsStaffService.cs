using MainApi.Src.Data.DbContext;
using MainApi.Src.Lib;
using MainApi.Src.Lib.Utils;
using MainApi.Src.Modules.Invitations.Entities;
using MainApi.Src.Modules.Permissions.Entities;
using MainApi.Src.Modules.Profiles.Entities;
using MainApi.Src.Modules.Users.Entities;

using Microsoft.EntityFrameworkCore;

namespace MainApi.Src.Modules.Profiles.Services;

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
		string? description,
		List<string> permissions,
		List<string> emails,
		Guid invitedByUserId,
		CancellationToken cancellationToken = default
	);
}

public class ProfileAsStaffService : IProfileAsStaffService {
	private readonly MainApiDbContext _dbContext;
	private readonly ILogger<ProfileAsStaffService> _logger;
	public ProfileAsStaffService(
		MainApiDbContext dbContext,
		ILogger<ProfileAsStaffService> logger
	) {
		_dbContext = dbContext;
		_logger = logger;
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
		var effectiveLimit = limit ?? AppEnvironment.Instance.PAGINATION_DEFAULT_LIMIT;

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
	/// Page 1: GET /profiles?sortId=name&amp;sortOrder=asc&amp;limit=3
	///   - Returns: Alice(id:100), Bob(id:050), Charlie(id:200)
	///   - NextCursor: "200" (Charlie's id)
	///
	/// Page 2: GET /profiles?sortId=name&amp;sortOrder=asc&amp;limit=3&amp;cursor=200
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
		var effectiveLimit = limit ?? AppEnvironment.Instance.PAGINATION_DEFAULT_LIMIT;
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
					: q.OrderByDescending(p => p.Id)
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
					: q.OrderByDescending(p => p.Name).ThenByDescending(p => p.Id)
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
					: q.OrderByDescending(p => p.CreatedAt).ThenByDescending(p => p.Id)
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
					: q.OrderByDescending(p => p.UserAccountProfiles.Count).ThenByDescending(p => p.Id)
			)
		};

		// ───────────────────────────────────────────────────────────────────────
		// STEP 1: Validate sortId parameter
		// ───────────────────────────────────────────────────────────────────────
		if (!sortFieldHandlers.TryGetValue(effectiveSortId, out SortFieldHandler? handler)) {
			return new FindStaffProfilesResult.InvalidSortId(effectiveSortId);
		}

		// ───────────────────────────────────────────────────────────────────────
		// STEP 2: Build base query
		// ───────────────────────────────────────────────────────────────────────
		// Start with staff profiles only, excluding soft-deleted records
		var query = _dbContext.Profile
			.Where(p => p.Scope == ProfileScope.Staff && p.Id != null);

		// ───────────────────────────────────────────────────────────────────────
		// STEP 3: Apply cursor-based filter (if paginating)
		// ───────────────────────────────────────────────────────────────────────
		// Apply keyset filter to get records AFTER the cursor
		if (cursor != Guid.Empty) {
			// Fetch the sort field value at the cursor position
			var cursorValue = await handler.GetCursorValue(cursor);

			// Validate that cursor exists
			if (cursorValue is null) {
				return new FindStaffProfilesResult.CursorNotFound(cursor.ToString());
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
			}
		);
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
		string name,
		string? description,
		List<string> permissions,
		List<string> emails,
		Guid invitedByUserId,
		CancellationToken cancellationToken = default
	) {
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
					&& !ua.IsDeleted && !ua.IsSuspended
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
					&& !ua.IsDeleted && !ua.IsSuspended
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
					&& !i.IsAccepted && !i.IsRevoked
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

		public SortFieldHandler(
			Func<Guid, Task<object?>> getCursorValue,
			Func<IQueryable<Profile>, object?, bool, IQueryable<Profile>> applyFilter,
			Func<IQueryable<Profile>, bool, IQueryable<Profile>> applyOrdering
		) {
			GetCursorValue = getCursorValue;
			ApplyFilter = applyFilter;
			ApplyOrdering = applyOrdering;
		}
	}
}
