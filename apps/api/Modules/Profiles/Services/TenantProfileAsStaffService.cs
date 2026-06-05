using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Modules.Permissions.Entities;
using PublyApp.Api.Modules.Profiles.Entities;

namespace PublyApp.Api.Modules.Profiles.Services;

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

// Tenant bulk-delete input used by staff endpoints. Duplicates are trimmed before DB
// work to keep result counts stable.
public sealed record BulkDeleteTenantProfilesArgs(
	Guid TenantId,
	List<Guid> ProfileIds
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


public interface ITenantProfileAsStaffService {
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

	Task<BulkProfileActionResult> BulkDeleteTenantProfilesAsync(
		BulkDeleteTenantProfilesArgs args,
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
}

[Service(ServiceLifetime.Scoped)]
public sealed class TenantProfileAsStaffService : ITenantProfileAsStaffService {
	private readonly AppDbContext _dbContext;
	private readonly ILogger<TenantProfileAsStaffService> _logger;

	public TenantProfileAsStaffService(
		AppDbContext dbContext,
		ILogger<TenantProfileAsStaffService> logger
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
				UserAccountCount = p.UserAccountProfiles.Count,
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

		// Profile update does not touch assignments, but the response must reflect the
		// current membership count after any concurrent assignment cleanup.
		var userAccountCount = await (
			from uap in _dbContext.UserAccountProfile
			where uap.ProfileId == args.ProfileId
			select uap.ProfileId
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
			// the junction rows instead of leaving stale memberships behind.
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

	public async Task<BulkProfileActionResult> BulkDeleteTenantProfilesAsync(
		BulkDeleteTenantProfilesArgs args,
		CancellationToken cancellationToken = default
	) {
		// Deduplicate caller input once so we evaluate each ID only one time and keep
		// deterministic succeeded/failed counts.
		var requestedProfileIds = args.ProfileIds.Distinct().ToList();

		if (requestedProfileIds.Count == 0) {
			return new BulkProfileActionResult(
				SucceededCount: 0,
				FailedCount: 0,
				FailedItems: []
			);
		}

		// Resolve all matching tenant profiles in one DB call; this lets us decide
		// exactly which requested IDs are invalid or protected.
		var profiles = await (
			from p in _dbContext.Profile
			where p.TenantId == args.TenantId
				&& p.Scope == ProfileScope.Tenant
				&& !p.IsDeleted
				&& p.Id != null
				&& requestedProfileIds.Contains(p.Id.Value)
			select p
		).ToListAsync(cancellationToken);

		var profileById = profiles.ToDictionary(p => p.GetRequiredId());
		var failedItems = new List<BulkProfileActionFailedItem>();

		foreach (var requestedProfileId in requestedProfileIds) {
			if (!profileById.TryGetValue(requestedProfileId, out var profile)) {
				failedItems.Add(
					new BulkProfileActionFailedItem(
						requestedProfileId,
						"Profile not found"
					)
				);
				continue;
			}

			if (profile.IsDefault) {
				failedItems.Add(
					new BulkProfileActionFailedItem(
						requestedProfileId,
						"Default tenant profile cannot be deleted"
					)
				);
			}
		}

		// Exclude default profiles from bulk operations to preserve the existing
		// platform rule that defaults are not deletable.
		var deletableProfileIds = profiles
			.Where(profile => !profile.IsDefault)
			.Select(profile => profile.GetRequiredId())
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

		// Keep a single pass over non-default profiles for the actual soft-delete.
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

		var failedItemsById = new HashSet<Guid>(
			failedItems.Select(item => item.ProfileId)
		);

		var succeededProfileIds = requestedProfileIds
			.Where(id => !failedItemsById.Contains(id))
			.ToList();

		return new BulkProfileActionResult(
			SucceededCount: succeededProfileIds.Count,
			FailedCount: failedItems.Count,
			FailedItems: failedItems
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
			// Existing row already represents an active grant; repeated POST is idempotent.
			return new SetTenantProfilePermissionResult.Success(
				profileAudit,
				Changed: false
			);
		}

		// DELETE removes the active grant. There is no inactive row to preserve because audit
		// logs are the history source for permission-assignment changes.
		_dbContext.ProfilePermission.Remove(existing);
		await _dbContext.SaveChangesAsync(cancellationToken);

		return new SetTenantProfilePermissionResult.Success(
			profileAudit,
			Changed: true
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
}
