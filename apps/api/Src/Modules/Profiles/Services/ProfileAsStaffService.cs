using MainApi.Src.Data.DbContext;
using MainApi.Src.Lib;
using MainApi.Src.Lib.DI;
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

public class TenantProfileItem {
	public Guid Id { get; set; }
	public string Name { get; set; } = string.Empty;
	public string? Description { get; set; }
	public bool IsDefault { get; set; }
	public int UserAccountCount { get; set; }
}

public sealed record TenantProfileAuditData(
	Guid ProfileId,
	string ProfileName,
	string? Description,
	bool IsDefault
);

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
	string? Search
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

public sealed record CreateTenantProfileArgs(
	Guid TenantId,
	string Name,
	string? Description,
	List<string> PermissionKeys
);

public abstract record CreateTenantProfileResult {
	public sealed record Success(
		TenantProfileItem Profile,
		List<string> InitialPermissionKeys
	)
		: CreateTenantProfileResult;

	public sealed record TenantNotFound : CreateTenantProfileResult;

	public sealed record ProfileNameExists(string Name)
		: CreateTenantProfileResult;

	public sealed record InvalidPermissions(List<string> InvalidKeys)
		: CreateTenantProfileResult;
}

public sealed record UpdateTenantProfileArgs(
	Guid TenantId,
	Guid ProfileId,
	PatchField<string?> Name,
	PatchField<string?> Description
);

public abstract record UpdateTenantProfileResult {
	public sealed record Success(
		TenantProfileItem Profile,
		TenantProfileAuditData PreviousProfile
	)
		: UpdateTenantProfileResult;

	public sealed record ProfileNotFound : UpdateTenantProfileResult;

	public sealed record ProfileNameExists(string Name)
		: UpdateTenantProfileResult;
}

public sealed record DeleteTenantProfileArgs(
	Guid TenantId,
	Guid ProfileId
);

public abstract record DeleteTenantProfileResult {
	public sealed record Success(
		TenantProfileAuditData Profile,
		int DeletedProfileCount
	)
		: DeleteTenantProfileResult;

	public sealed record ProfileNotFound : DeleteTenantProfileResult;

	public sealed record DefaultProfileDeletionNotAllowed : DeleteTenantProfileResult;
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

public sealed record SetTenantProfilePermissionArgs(
	Guid TenantId,
	Guid ProfileId,
	string PermissionKey,
	bool IsAssigned
);

public abstract record SetTenantProfilePermissionResult {
	public sealed record Success(
		TenantProfileAuditData Profile,
		bool Changed
	) : SetTenantProfilePermissionResult;

	public sealed record ProfileNotFound : SetTenantProfilePermissionResult;

	public sealed record PermissionNotFound : SetTenantProfilePermissionResult;
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

public sealed record FindStaffProfilesArgs(
	Guid Cursor,
	int? Limit,
	string? SortId,
	SortOrder? SortOrder,
	string? Search
);

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

public abstract record GetStaffProfileByIdServiceResult {
	public sealed record Success(StaffProfileItem Profile) : GetStaffProfileByIdServiceResult;
	public sealed record ProfileNotFound : GetStaffProfileByIdServiceResult;
}

public abstract record FindStaffProfilePermissionKeysResult {
	public sealed record Success(List<string> PermissionKeys) : FindStaffProfilePermissionKeysResult;
	public sealed record ProfileNotFound : FindStaffProfilePermissionKeysResult;
}

public sealed record UpdateStaffProfileArgs(
	Guid ProfileId,
	PatchField<string?> Name,
	PatchField<string?> Description
);

public abstract record UpdateStaffProfileResult {
	public sealed record Success(StaffProfileItem Profile) : UpdateStaffProfileResult;
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

public abstract record DeleteStaffProfileServiceResult {
	public sealed record Success(int DeletedProfileCount) : DeleteStaffProfileServiceResult;
	public sealed record ProfileNotFound : DeleteStaffProfileServiceResult;
}

public sealed record UnassignStaffProfileUsersArgs(
	Guid ProfileId,
	List<Guid> UserIds
);

public abstract record UnassignStaffProfileUsersServiceResult {
	public sealed record Success(int UnassignedCount) : UnassignStaffProfileUsersServiceResult;
	public sealed record ProfileNotFound : UnassignStaffProfileUsersServiceResult;
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
	Task<Profile> GetOrCreateDefaultTenantProfileAsync(
		Guid tenantId,
		CancellationToken cancellationToken = default
	);

	Task<FindTenantProfilesResult> FindTenantProfilesAsync(
		FindTenantProfilesArgs args,
		CancellationToken cancellationToken = default
	);

	Task<GetTenantProfileByIdResult> GetTenantProfileByIdAsync(
		GetTenantProfileByIdArgs args,
		CancellationToken cancellationToken = default
	);

	Task<CreateTenantProfileResult> CreateTenantProfileAsync(
		CreateTenantProfileArgs args,
		CancellationToken cancellationToken = default
	);

	Task<UpdateTenantProfileResult> UpdateTenantProfileAsync(
		UpdateTenantProfileArgs args,
		CancellationToken cancellationToken = default
	);

	Task<DeleteTenantProfileResult> DeleteTenantProfileAsync(
		DeleteTenantProfileArgs args,
		CancellationToken cancellationToken = default
	);

	Task<FindTenantProfilePermissionKeysResult> FindTenantProfilePermissionKeysAsync(
		FindTenantProfilePermissionKeysArgs args,
		CancellationToken cancellationToken = default
	);

	Task<SetTenantProfilePermissionResult> SetTenantProfilePermissionAsync(
		SetTenantProfilePermissionArgs args,
		CancellationToken cancellationToken = default
	);

	Task<FindStaffProfilesResult> FindStaffProfilesAsync(
		FindStaffProfilesArgs args,
		CancellationToken cancellationToken = default
	);

	Task<FindStaffProfileUsersServiceResult> FindStaffProfileUsersAsync(
		FindStaffProfileUsersArgs args,
		CancellationToken cancellationToken = default
	);

	Task<ResolveStaffProfileUserAssignmentsServiceResult> ResolveStaffProfileUserAssignmentsAsync(
		ResolveStaffProfileUserAssignmentsArgs args,
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
		string name,
		string? description,
		List<string> permissions,
		List<string> emails,
		Guid invitedByUserId,
		CancellationToken cancellationToken = default
	);

	Task<DeleteStaffProfileServiceResult> DeleteStaffProfileAsync(
		Guid profileId,
		CancellationToken cancellationToken = default
	);

	Task<UnassignStaffProfileUsersServiceResult> UnassignStaffProfileUsersAsync(
		UnassignStaffProfileUsersArgs args,
		CancellationToken cancellationToken = default
	);
}

[Service(ServiceLifetime.Scoped)]
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

	public async Task<Profile> GetOrCreateDefaultTenantProfileAsync(
		Guid tenantId,
		CancellationToken cancellationToken = default
	) {
		var query =
			from p in _dbContext.Profile
			where p.Scope == ProfileScope.Tenant
				&& p.TenantId == tenantId
				&& p.IsDefault
				&& !p.IsDeleted
			select p;

		var defaultProfile = await query.FirstOrDefaultAsync(cancellationToken);
		if (defaultProfile is not null) {
			return defaultProfile;
		}

		defaultProfile = Profile.CreateTenantProfile(
			tenantId,
			name: "Default profile",
			description: "Default profile with no permissions",
			isDefault: true
		);

		var savedDefaultProfile = await _dbContext.Profile.AddAsync(
			defaultProfile,
			cancellationToken
		);
		await _dbContext.SaveChangesAsync(cancellationToken);

		if (_logger.IsEnabled(LogLevel.Information)) {
			_logger.LogInformation(
				"Created missing default tenant profile for tenant {TenantId}",
				tenantId
			);
		}

		return savedDefaultProfile.Entity;
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
			// Keep cursor semantics explicit per sort field so each branch stays consistent with
			// the repo's keyset pagination rules and matching composite indexes.
			["id"] = new CursorSortFieldHandler<Profile>(
				getCursorValue: async (guid) => {
					var profileId = await _dbContext.Profile
						.AsNoTracking()
						.Where(p =>
							p.Id == guid
							&& p.Scope == ProfileScope.Tenant
							&& p.TenantId == args.TenantId
							&& !p.IsDeleted
						)
						.Select(p => p.Id)
						.FirstOrDefaultAsync(cancellationToken);
					return profileId;
				},
				applyFilter: (q, cursorValue, isAscLocal) => {
					var cursorGuid = (Guid?)cursorValue;
					if (cursorGuid is null) {
						return q;
					}

					return isAscLocal
						? q.Where(p => p.Id > cursorGuid)
						: q.Where(p => p.Id < cursorGuid);
				},
				applyOrdering: (q, isAscLocal) => isAscLocal
					? q.OrderBy(p => p.Id)
					: q.OrderByDescending(p => p.Id)
			),
			["name"] = new CursorSortFieldHandler<Profile>(
				getCursorValue: async (guid) => {
					var profile = await _dbContext.Profile
						.AsNoTracking()
						.Where(p =>
							p.Id == guid
							&& p.Scope == ProfileScope.Tenant
							&& p.TenantId == args.TenantId
							&& !p.IsDeleted
						)
						.Select(p => new { p.Name, p.Id })
						.FirstOrDefaultAsync(cancellationToken);
					return profile is not null ? (profile.Name, profile.Id) : null;
				},
				applyFilter: (q, cursorValue, isAscLocal) => {
					if (cursorValue is null) {
						return q;
					}

					var (cursorName, cursorId) = ((string, Guid?))cursorValue;

					return isAscLocal
						? q.Where(p => p.Name.CompareTo(cursorName) > 0 || (p.Name == cursorName && p.Id > cursorId))
						: q.Where(p => p.Name.CompareTo(cursorName) < 0 || (p.Name == cursorName && p.Id < cursorId));
				},
				applyOrdering: (q, isAscLocal) => isAscLocal
					? q.OrderBy(p => p.Name).ThenBy(p => p.Id)
					: q.OrderByDescending(p => p.Name).ThenByDescending(p => p.Id)
			),
			["created_at"] = new CursorSortFieldHandler<Profile>(
				getCursorValue: async (guid) => {
					var profile = await _dbContext.Profile
						.AsNoTracking()
						.Where(p =>
							p.Id == guid
							&& p.Scope == ProfileScope.Tenant
							&& p.TenantId == args.TenantId
							&& !p.IsDeleted
						)
						.Select(p => new { p.CreatedAt, p.Id })
						.FirstOrDefaultAsync(cancellationToken);
					return profile is not null ? (profile.CreatedAt, profile.Id) : null;
				},
				applyFilter: (q, cursorValue, isAscLocal) => {
					if (cursorValue is null) {
						return q;
					}

					var (cursorCreatedAt, cursorId) = ((DateTime, Guid?))cursorValue;
					return isAscLocal
						? q.Where(p => p.CreatedAt > cursorCreatedAt || (p.CreatedAt == cursorCreatedAt && p.Id > cursorId))
						: q.Where(p => p.CreatedAt < cursorCreatedAt || (p.CreatedAt == cursorCreatedAt && p.Id < cursorId));
				},
				applyOrdering: (q, isAscLocal) => isAscLocal
					? q.OrderBy(p => p.CreatedAt).ThenBy(p => p.Id)
					: q.OrderByDescending(p => p.CreatedAt).ThenByDescending(p => p.Id)
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
			var pattern = $"%{q}%";
			query = query.Where(p =>
				EF.Functions.ILike(p.Name, pattern)
				|| (p.Description != null && EF.Functions.ILike(p.Description, pattern))
			);
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

		// The list DTO needs assignment counts, but we fetch them in one grouped query so the
		// table avoids per-row lookups.
		var userAccountCounts = await (
			from uap in _dbContext.UserAccountProfile.AsNoTracking()
			where profileIds.Contains(uap.ProfileId)
				&& !uap.IsDeleted
			group uap by uap.ProfileId into g
			select new { ProfileId = g.Key, Count = g.Count() }
		).ToListAsync(cancellationToken);

		var userAccountCountByProfileId = new Dictionary<Guid, int>();
		foreach (var row in userAccountCounts) {
			userAccountCountByProfileId[row.ProfileId] = row.Count;
		}

		var items = profiles.Select(p => {
			var profileId = p.GetRequiredId();
			return new TenantProfileItem {
				Id = profileId,
				Name = p.Name,
				Description = p.Description,
				IsDefault = p.IsDefault,
				UserAccountCount = userAccountCountByProfileId.GetValueOrDefault(profileId, 0),
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
				IsDefault = p.IsDefault,
				UserAccountCount = p.UserAccountProfiles.Count(uap => !uap.IsDeleted),
			}
		).FirstOrDefaultAsync(cancellationToken);

		if (profile is null) {
			return new GetTenantProfileByIdResult.ProfileNotFound();
		}

		return new GetTenantProfileByIdResult.Success(profile);
	}

	public async Task<CreateTenantProfileResult> CreateTenantProfileAsync(
		CreateTenantProfileArgs args,
		CancellationToken cancellationToken = default
	) {
		var tenantExists = await (
			from t in _dbContext.Tenant
			where t.Id == args.TenantId
				&& !t.IsDeleted
			select t.Id
		).AnyAsync(cancellationToken);

		if (!tenantExists) {
			return new CreateTenantProfileResult.TenantNotFound();
		}

		var normalizedName = args.Name.Trim();
		var normalizedDescription = args.Description?.Trim();
		var normalizedPermissionKeys = args.PermissionKeys
			.Select(key => key.Trim())
			.Where(key => !string.IsNullOrWhiteSpace(key))
			.Distinct(StringComparer.Ordinal)
			.OrderBy(key => key, StringComparer.Ordinal)
			.ToList();

		var profileExists = await (
			from p in _dbContext.Profile
			where p.TenantId == args.TenantId
				&& p.Scope == ProfileScope.Tenant
				&& !p.IsDeleted
				&& p.Name == normalizedName
			select p.Id
		).AnyAsync(cancellationToken);

		if (profileExists) {
			return new CreateTenantProfileResult.ProfileNameExists(normalizedName);
		}

		var validPermissionKeys = await (
			from permission in _dbContext.Permission
			where normalizedPermissionKeys.Contains(permission.Key)
				&& permission.Scope == PermissionScope.Tenant
				&& !permission.IsDeleted
			select permission.Key
		).ToListAsync(cancellationToken);

		var invalidPermissionKeys = normalizedPermissionKeys
			.Except(validPermissionKeys, StringComparer.Ordinal)
			.ToList();

		if (invalidPermissionKeys.Count > 0) {
			return new CreateTenantProfileResult.InvalidPermissions(
				invalidPermissionKeys
			);
		}

		await using var transaction = await _dbContext.Database
			.BeginTransactionAsync(cancellationToken);

		var profile = Profile.CreateTenantProfile(
			args.TenantId,
			normalizedName,
			normalizedDescription
		);

		try {
			await _dbContext.Profile.AddAsync(profile, cancellationToken);
			await _dbContext.SaveChangesAsync(cancellationToken);

			var profileId = profile.GetRequiredId();
			if (validPermissionKeys.Count > 0) {
				// Create uses one atomic write batch so the initial permission set cannot drift
				// away from the newly-created profile if one of the inserts fails.
				var profilePermissions = validPermissionKeys
					.Select(permissionKey => new ProfilePermission {
						ProfileId = profileId,
						PermissionKey = permissionKey
					})
					.ToList();

				await _dbContext.ProfilePermission
					.AddRangeAsync(profilePermissions, cancellationToken);
				await _dbContext.SaveChangesAsync(cancellationToken);
			}

			await transaction.CommitAsync(cancellationToken);
		} catch (DbUpdateException ex) when (IsTenantProfileNameUniqueViolation(ex)) {
			// The pre-check keeps the common path friendly, but the unique index is the real
			// guard against concurrent creates or renames racing each other.
			await transaction.RollbackAsync(cancellationToken);
			_dbContext.Entry(profile).State = EntityState.Detached;
			return new CreateTenantProfileResult.ProfileNameExists(normalizedName);
		} catch {
			await transaction.RollbackAsync(cancellationToken);
			throw;
		}

		var created = new TenantProfileItem {
			Id = profile.GetRequiredId(),
			Name = profile.Name,
			Description = profile.Description,
			IsDefault = profile.IsDefault,
			UserAccountCount = 0,
		};

		return new CreateTenantProfileResult.Success(
			created,
			validPermissionKeys
		);
	}

	public async Task<UpdateTenantProfileResult> UpdateTenantProfileAsync(
		UpdateTenantProfileArgs args,
		CancellationToken cancellationToken = default
	) {
		var profile = await (
			from p in _dbContext.Profile
			where p.Id == args.ProfileId
				&& p.Scope == ProfileScope.Tenant
				&& p.TenantId == args.TenantId
				&& !p.IsDeleted
			select p
		).FirstOrDefaultAsync(cancellationToken);

		if (profile is null) {
			return new UpdateTenantProfileResult.ProfileNotFound();
		}

		var previousProfile = new TenantProfileAuditData(
			profile.GetRequiredId(),
			profile.Name,
			profile.Description,
			profile.IsDefault
		);

		if (args.Name.IsPresent) {
			var candidateName = args.Name.Value?.Trim();
			if (string.IsNullOrWhiteSpace(candidateName)) {
				throw new InvalidOperationException(
					"UpdateTenantProfileAsync received an invalid name. " +
					"Ensure endpoint validation ran before calling the service."
				);
			}

			var exists = await (
				from p in _dbContext.Profile
				where p.TenantId == args.TenantId
					&& p.Scope == ProfileScope.Tenant
					&& !p.IsDeleted
					&& p.Id != args.ProfileId
					&& p.Name == candidateName
				select p.Id
			).AnyAsync(cancellationToken);

			if (exists) {
				return new UpdateTenantProfileResult.ProfileNameExists(candidateName);
			}

			profile.Name = candidateName;
		}

		if (args.Description.IsPresent) {
			profile.Description = args.Description.Value?.Trim();
		}

		try {
			await _dbContext.SaveChangesAsync(cancellationToken);
		} catch (DbUpdateException ex) when (IsTenantProfileNameUniqueViolation(ex)) {
			_dbContext.Entry(profile).State = EntityState.Detached;
			return new UpdateTenantProfileResult.ProfileNameExists(profile.Name);
		}

		var userAccountCount = await (
			from uap in _dbContext.UserAccountProfile
			where uap.ProfileId == args.ProfileId
				&& !uap.IsDeleted
			select uap.Id
		).CountAsync(cancellationToken);

		var updated = new TenantProfileItem {
			Id = profile.GetRequiredId(),
			Name = profile.Name,
			Description = profile.Description,
			IsDefault = profile.IsDefault,
			UserAccountCount = userAccountCount,
		};

		return new UpdateTenantProfileResult.Success(updated, previousProfile);
	}

	public async Task<DeleteTenantProfileResult> DeleteTenantProfileAsync(
		DeleteTenantProfileArgs args,
		CancellationToken cancellationToken = default
	) {
		var profile = await (
			from p in _dbContext.Profile
			where p.Id == args.ProfileId
				&& p.Scope == ProfileScope.Tenant
				&& p.TenantId == args.TenantId
				&& !p.IsDeleted
			select p
		).FirstOrDefaultAsync(cancellationToken);

		if (profile is null) {
			return new DeleteTenantProfileResult.ProfileNotFound();
		}

		if (profile.IsDefault) {
			return new DeleteTenantProfileResult.DefaultProfileDeletionNotAllowed();
		}

		var profileAudit = new TenantProfileAuditData(
			profile.GetRequiredId(),
			profile.Name,
			profile.Description,
			profile.IsDefault
		);

		var profileIdValue = profile.GetRequiredId();

		var links = await (
			from uap in _dbContext.UserAccountProfile
			where uap.ProfileId == profileIdValue
			select uap
		).ToListAsync(cancellationToken);

		if (links.Count > 0) {
			// A deleted tenant profile must stop contributing memberships immediately, so we remove
			// the junction rows instead of leaving soft-deleted joins behind.
			_dbContext.ForceHardDeleteRange(links);
		}

		var permissions = await (
			from pp in _dbContext.ProfilePermission
			where pp.ProfileId == profileIdValue
			select pp
		).ToListAsync(cancellationToken);

		if (permissions.Count > 0) {
			// Same rationale as the user-account links above: deleting the profile should fully
			// detach its permission membership rows in the same transaction.
			_dbContext.ForceHardDeleteRange(permissions);
		}

		profile.IsDeleted = true;
		profile.DeletedAt = DateTime.UtcNow;
		profile.UpdatedAt = DateTime.UtcNow;

		await _dbContext.SaveChangesAsync(cancellationToken);

		return new DeleteTenantProfileResult.Success(
			Profile: profileAudit,
			DeletedProfileCount: 1
		);
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
				&& !pp.IsDeleted
				&& !p.IsDeleted
				&& p.Scope == PermissionScope.Tenant
			select pp.PermissionKey
		)
			.OrderBy(k => k)
			.ToListAsync(cancellationToken);

		return new FindTenantProfilePermissionKeysResult.Success(permissionKeys);
	}

	public async Task<SetTenantProfilePermissionResult>
		SetTenantProfilePermissionAsync(
			SetTenantProfilePermissionArgs args,
			CancellationToken cancellationToken = default
		) {
		var profile = await (
			from p in _dbContext.Profile
			where p.Id == args.ProfileId
				&& p.Scope == ProfileScope.Tenant
				&& p.TenantId == args.TenantId
				&& !p.IsDeleted
			select p
		).FirstOrDefaultAsync(cancellationToken);

		if (profile is null) {
			return new SetTenantProfilePermissionResult.ProfileNotFound();
		}

		var profileAudit = new TenantProfileAuditData(
			profile.GetRequiredId(),
			profile.Name,
			profile.Description,
			profile.IsDefault
		);

		var permissionExists = await (
			from p in _dbContext.Permission
			where p.Key == args.PermissionKey
				&& !p.IsDeleted
				&& p.Scope == PermissionScope.Tenant
			select p.Key
		).AnyAsync(cancellationToken);

		if (!permissionExists) {
			return new SetTenantProfilePermissionResult.PermissionNotFound();
		}

		var existing = await (
			from pp in _dbContext.ProfilePermission
			where pp.ProfileId == args.ProfileId
				&& pp.PermissionKey == args.PermissionKey
			select pp
		).FirstOrDefaultAsync(cancellationToken);

		if (existing is null) {
			if (args.IsAssigned) {
				await _dbContext.ProfilePermission.AddAsync(
					new ProfilePermission {
						ProfileId = args.ProfileId,
						PermissionKey = args.PermissionKey,
					},
					cancellationToken
				);

				await _dbContext.SaveChangesAsync(cancellationToken);
				return new SetTenantProfilePermissionResult.Success(
					profileAudit,
					Changed: true
				);
			}

			return new SetTenantProfilePermissionResult.Success(
				profileAudit,
				Changed: false
			);
		}

		if (args.IsAssigned) {
			if (existing.IsDeleted) {
				existing.IsDeleted = false;
				existing.DeletedAt = null;
				existing.UpdatedAt = DateTime.UtcNow;
				await _dbContext.SaveChangesAsync(cancellationToken);
				return new SetTenantProfilePermissionResult.Success(
					profileAudit,
					Changed: true
				);
			}

			return new SetTenantProfilePermissionResult.Success(
				profileAudit,
				Changed: false
			);
		}

		if (!existing.IsDeleted) {
			existing.IsDeleted = true;
			existing.DeletedAt = DateTime.UtcNow;
			existing.UpdatedAt = DateTime.UtcNow;
			await _dbContext.SaveChangesAsync(cancellationToken);
			return new SetTenantProfilePermissionResult.Success(
				profileAudit,
				Changed: true
			);
		}

		return new SetTenantProfilePermissionResult.Success(
			profileAudit,
			Changed: false
		);
	}

	/// <summary>
	/// Detects unique constraint violations on the profiles table.
	/// PostgreSQL error code 23505 = unique_violation.
	/// We only map the active tenant-profile name invariant here.
	/// </summary>
	private static bool IsTenantProfileNameUniqueViolation(DbUpdateException ex) {
		if (ex.InnerException is Npgsql.PostgresException pgEx) {
			return pgEx.SqlState == "23505"
				&& pgEx.TableName is not null
				&& pgEx.TableName.Equals("profiles", StringComparison.OrdinalIgnoreCase);
		}

		return false;
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
				&& !uap.IsDeleted
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
			var wildcard = $"%{search}%";
			query = query.Where(x =>
				EF.Functions.ILike(x.Email, wildcard)
				|| EF.Functions.ILike(x.FirstName ?? "", wildcard)
				|| EF.Functions.ILike(x.LastName ?? "", wildcard)
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

	public async Task<ResolveStaffProfileUserAssignmentsServiceResult> ResolveStaffProfileUserAssignmentsAsync(
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
		// - Deleted junction links are ignored
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
				&& !uap.IsDeleted
			select u.Id
		)
			.Distinct()
			.ToListAsync(cancellationToken);

		var assignedLookup = assignedUserIds
			.Where(id => id is not null)
			.Select(id => id!.Value)
			.ToHashSet();

		var assignments = args.UserIds
			.Distinct()
			.Select(userId => new StaffProfileUserAssignmentResolutionItem(
				UserId: userId,
				IsAssigned: assignedLookup.Contains(userId)
			))
			.ToList();

		return new ResolveStaffProfileUserAssignmentsServiceResult.Success(assignments);
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
				&& !pp.IsDeleted
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

		var userAccountCount = await (
			from uap in _dbContext.UserAccountProfile
			where uap.ProfileId == args.ProfileId
				&& !uap.IsDeleted
			select uap.Id
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
			if (existing.IsDeleted) {
				// Re-assigning after a previous unassign: revive the soft-deleted junction row.
				existing.IsDeleted = false;
				existing.DeletedAt = null;
				existing.UpdatedAt = DateTime.UtcNow;
				await _dbContext.SaveChangesAsync(cancellationToken);
			}

			return new SetStaffProfilePermissionResult.Success();
		}

		// Unassign
		if (!existing.IsDeleted) {
			// Soft-delete the junction row to preserve assignment history for future audit needs.
			existing.IsDeleted = true;
			existing.DeletedAt = DateTime.UtcNow;
			existing.UpdatedAt = DateTime.UtcNow;
			await _dbContext.SaveChangesAsync(cancellationToken);
		}

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
			return new UnassignStaffProfileUsersServiceResult.Success(UnassignedCount: 0);
		}

		// Resolve staff UserAccount IDs for the given User IDs.
		// We intentionally allow suspended users/accounts here: unassigning a profile is safe,
		// and admin tooling often needs to clean up assignments on non-active users.
		var userIdsNullable = args.UserIds.Select(id => (Guid?)id).ToList();
		var staffAccountIds = await (
			from ua in _dbContext.UserAccount
			where userIdsNullable.Contains(ua.UserId)
				&& ua.Scope == AccountScope.Staff
				&& !ua.IsDeleted
				&& !ua.User.IsDeleted
			select ua.Id
		).ToListAsync(cancellationToken);

		if (staffAccountIds.Count == 0) {
			return new UnassignStaffProfileUsersServiceResult.Success(UnassignedCount: 0);
		}

		// Hard-delete junction links to avoid unique constraint conflicts when links are re-added later.
		var linksToRemove = await (
			from uap in _dbContext.UserAccountProfile
			where uap.ProfileId == args.ProfileId
				&& staffAccountIds.Contains(uap.UserAccountId)
			select uap
		).ToListAsync(cancellationToken);

		if (linksToRemove.Count > 0) {
			_dbContext.ForceHardDeleteRange(linksToRemove);
			await _dbContext.SaveChangesAsync(cancellationToken);
		}

		return new UnassignStaffProfileUsersServiceResult.Success(
			UnassignedCount: linksToRemove.Count
		);
	}

}
