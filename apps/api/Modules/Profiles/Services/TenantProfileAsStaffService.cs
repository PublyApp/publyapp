using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.Permissions.Entities;
using PublyApp.Api.Modules.Profiles.Entities;
using PublyApp.Api.Modules.Users.Entities;
using PublyApp.Api.Modules.Users.Services;

namespace PublyApp.Api.Modules.Profiles.Services;

public sealed record TenantProfileAuditData(
	Guid ProfileId,
	string ProfileName,
	string? Description,
	bool IsDefault,
	string? Icon = null,
	string? Tone = null
);

public sealed record CreateTenantProfileArgs(
	Guid TenantId,
	string Name,
	string? Description,
	string? Icon,
	string? Tone,
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
	PatchField<string?> Description,
	PatchField<string?> Icon,
	PatchField<string?> Tone
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
/// Identity of the tenant member a profile assignment was toggled for, captured for audit.
/// </summary>
public sealed record TenantProfileMemberAuditData(
	Guid UserAccountId,
	Guid UserId,
	AccountLevel Level
);

public sealed record SetTenantProfileUserArgs(
	Guid TenantId,
	Guid ProfileId,
	Guid UserAccountId,
	bool IsAssigned,
	// The acting staff user. The audit entry is written inside this operation's transaction,
	// so the actor must travel with the request rather than be resolved afterwards.
	Guid ActorUserId
);

public abstract record SetTenantProfileUserResult {
	public sealed record Success(
		TenantProfileAuditData Profile,
		TenantProfileMemberAuditData Member,
		bool Changed
	) : SetTenantProfileUserResult;

	public sealed record ProfileNotFound : SetTenantProfileUserResult;

	public sealed record MemberNotFound : SetTenantProfileUserResult;

	public sealed record MaxProfilesPerUserExceeded(int MaxProfilesPerUser)
		: SetTenantProfileUserResult;
}


public interface ITenantProfileAsStaffService {
	Task<Profile> GetOrCreateDefaultTenantProfileAsync(
		Guid tenantId,
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

	Task<SetTenantProfilePermissionResult> SetTenantProfilePermissionAsync(
		SetTenantProfilePermissionArgs args,
		CancellationToken cancellationToken = default
	);

	Task<SetTenantProfileUserResult> SetTenantProfileUserAsync(
		SetTenantProfileUserArgs args,
		CancellationToken cancellationToken = default
	);
}

[Service(ServiceLifetime.Scoped)]
public sealed class TenantProfileAsStaffService : ITenantProfileAsStaffService {
	private readonly AppDbContext _dbContext;
	private readonly ILogger<TenantProfileAsStaffService> _logger;
	private readonly IHttpContextAccessor _httpContextAccessor;

	public TenantProfileAsStaffService(
		AppDbContext dbContext,
		ILogger<TenantProfileAsStaffService> logger,
		// Framework infrastructure, not a domain service: this is the same accessor
		// AuditLogService uses to stamp ip/user-agent, so audit rows written transactionally
		// here are shape-identical to the ones it writes.
		IHttpContextAccessor httpContextAccessor
	) {
		_dbContext = dbContext;
		_logger = logger;
		_httpContextAccessor = httpContextAccessor;
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
			normalizedDescription,
			icon: args.Icon,
			tone: args.Tone
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
			Icon = profile.Icon,
			Tone = profile.Tone,
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
			profile.IsDefault,
			profile.Icon,
			profile.Tone
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

		if (args.Icon.IsPresent) {
			profile.Icon = args.Icon.Value;
		}

		if (args.Tone.IsPresent) {
			profile.Tone = args.Tone.Value;
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
			Icon = profile.Icon,
			Tone = profile.Tone,
			IsDefault = profile.IsDefault,
			UserAccountCount = userAccountCount,
		};

		return new UpdateTenantProfileResult.Success(updated, previousProfile);
	}

	public async Task<DeleteTenantProfileResult> DeleteTenantProfileAsync(
		DeleteTenantProfileArgs args,
		CancellationToken cancellationToken = default
	) {
		await using var transaction = await _dbContext.Database
			.BeginTransactionAsync(cancellationToken);

		try {
			var result = await DeleteTenantProfileCoreAsync(args, cancellationToken);

			if (result is DeleteTenantProfileResult.Success) {
				await transaction.CommitAsync(cancellationToken);
			} else {
				await transaction.RollbackAsync(cancellationToken);
			}

			return result;
		} catch {
			await transaction.RollbackAsync(cancellationToken);
			throw;
		}
	}

	private async Task<DeleteTenantProfileResult> DeleteTenantProfileCoreAsync(
		DeleteTenantProfileArgs args,
		CancellationToken cancellationToken
	) {
		// TenantMembershipLockOrder step 3: pin the profile before enumerating its junction
		// rows, so a concurrent assign cannot slip a new link in behind this cleanup.
		var profile = await TenantMembershipLockOrder.LockLiveTenantProfileAsync(
			_dbContext,
			args.TenantId,
			args.ProfileId,
			cancellationToken
		);

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

		// TenantMembershipLockOrder step 5: lock and materialize the junction rows in one
		// statement. A concurrent member-removal cleanup targeting the same link hands us only
		// survivors, so we never issue a tracked delete for a row it already removed.
		var links = await TenantMembershipLockOrder.LockAndMaterializeLinksForProfilesAsync(
			_dbContext,
			[profileIdValue],
			cancellationToken
		);

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

		await using var transaction = await _dbContext.Database
			.BeginTransactionAsync(cancellationToken);

		try {
			var result = await BulkDeleteTenantProfilesCoreAsync(
				requestedProfileIds,
				args.TenantId,
				cancellationToken
			);
			await transaction.CommitAsync(cancellationToken);
			return result;
		} catch {
			await transaction.RollbackAsync(cancellationToken);
			throw;
		}
	}

	private async Task<BulkProfileActionResult> BulkDeleteTenantProfilesCoreAsync(
		List<Guid> requestedProfileIds,
		Guid tenantId,
		CancellationToken cancellationToken
	) {
		var args = new BulkDeleteTenantProfilesArgs(tenantId, requestedProfileIds);

		// TenantMembershipLockOrder step 3, batched: pin every candidate profile in a
		// deterministic id order before reading them or their junction rows, so concurrent
		// assigns cannot re-link a profile this batch is about to purge, and two concurrent
		// bulk deletes cannot deadlock.
		await TenantMembershipLockOrder.LockProfileRowsAsync(
			_dbContext,
			requestedProfileIds,
			cancellationToken
		);

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

		// TenantMembershipLockOrder step 5, batched — same rationale as the single-profile path.
		var links = await TenantMembershipLockOrder.LockAndMaterializeLinksForProfilesAsync(
			_dbContext,
			deletableProfileIds,
			cancellationToken
		);

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

	public async Task<SetTenantProfileUserResult> SetTenantProfileUserAsync(
		SetTenantProfileUserArgs args,
		CancellationToken cancellationToken = default
	) {
		await using var transaction = await _dbContext.Database
			.BeginTransactionAsync(cancellationToken);

		try {
			var (result, shouldCommit) = await SetTenantProfileUserCoreAsync(
				args,
				cancellationToken
			);

			if (shouldCommit) {
				await transaction.CommitAsync(cancellationToken);
			} else {
				// Guard rejections and the duplicate-race backstop still exit a transaction
				// that has taken row locks; release them explicitly rather than relying on
				// disposal.
				await transaction.RollbackAsync(cancellationToken);
			}

			return result;
		} catch {
			await transaction.RollbackAsync(cancellationToken);
			throw;
		}
	}

	/// <summary>
	/// Transactional body of <see cref="SetTenantProfileUserAsync"/>. Follows
	/// <see cref="TenantMembershipLockOrder"/>: lock the live profile, then the live account,
	/// then read junction state. Returns the caller-visible result plus whether the transaction
	/// may be committed — the duplicate-race backstop reports success but must roll back,
	/// because PostgreSQL has already aborted the transaction.
	/// </summary>
	private async Task<(SetTenantProfileUserResult Result, bool ShouldCommit)>
		SetTenantProfileUserCoreAsync(
			SetTenantProfileUserArgs args,
			CancellationToken cancellationToken
		) {
		// Lock order step 3. Locking with the liveness predicate (rather than reading live and
		// locking by id) is what makes the tenant/scope/soft-delete guards linearizable: a
		// profile deleted while we waited yields no row here, so we cannot insert a junction
		// row under a profile the delete path already purged.
		// A staff-scope profile, another tenant's profile and a deleted profile are all
		// indistinguishable "not found", mirroring SetTenantProfilePermissionAsync and avoiding
		// leaks about profiles outside this tenant.
		var profile = await TenantMembershipLockOrder.LockLiveTenantProfileAsync(
			_dbContext,
			args.TenantId,
			args.ProfileId,
			cancellationToken
		);

		if (profile is null) {
			return (new SetTenantProfileUserResult.ProfileNotFound(), false);
		}

		// Lock order step 4. Blocks cross-tenant assignment, and a membership removed while we
		// waited yields no row instead of a lock on a soft-deleted account.
		var member = await TenantMembershipLockOrder.LockLiveTenantAccountAsync(
			_dbContext,
			args.TenantId,
			args.UserAccountId,
			cancellationToken
		);

		if (member is null) {
			return (new SetTenantProfileUserResult.MemberNotFound(), false);
		}

		var profileAudit = new TenantProfileAuditData(
			profile.GetRequiredId(),
			profile.Name,
			profile.Description,
			profile.IsDefault
		);

		var memberAudit = new TenantProfileMemberAuditData(
			member.GetRequiredId(),
			member.UserId,
			member.Level
		);

		// Lock order step 5: both parents are pinned, so junction state read from here is
		// stable for the rest of the transaction.
		var existing = await (
			from uap in _dbContext.UserAccountProfile
			where uap.UserAccountId == args.UserAccountId
				&& uap.ProfileId == args.ProfileId
			select uap
		).FirstOrDefaultAsync(cancellationToken);

		if (!args.IsAssigned) {
			if (existing is null) {
				// Unassigning something that is not assigned is a no-op success.
				return (
					new SetTenantProfileUserResult.Success(
						profileAudit,
						memberAudit,
						Changed: false
					),
					true
				);
			}

			// Junction rows carry no soft-delete state; membership history lives in audit logs.
			// The audit entry is therefore added to this same SaveChanges: the row and its only
			// record must become durable together or not at all.
			_dbContext.ForceHardDelete(existing);
			AddAuditEntry(
				args,
				AuditActions.TenantProfileUserUnassigned,
				profileAudit,
				memberAudit
			);
			await _dbContext.SaveChangesAsync(cancellationToken);

			return (
				new SetTenantProfileUserResult.Success(
					profileAudit,
					memberAudit,
					Changed: true
				),
				true
			);
		}

		if (existing is not null) {
			// Already assigned: repeated POST is idempotent. This is checked before the cap so
			// that re-asserting an existing assignment never fails, even for a member who is
			// already at the cap. No state change, so no audit entry.
			return (
				new SetTenantProfileUserResult.Success(
					profileAudit,
					memberAudit,
					Changed: false
				),
				true
			);
		}

		// The cap is a COUNT invariant, which no table constraint can express. The account row
		// lock taken above is what stops two concurrent assigns from both observing a below-cap
		// count and then inserting past it.
		// Count only live assignments: a junction row pointing at a soft-deleted profile grants
		// nothing, so it must not consume the member's quota.
		var liveProfileCount = await (
			from uap in _dbContext.UserAccountProfile
			from p in _dbContext.Profile
			where p.Id == uap.ProfileId
				&& uap.UserAccountId == args.UserAccountId
				&& !p.IsDeleted
			select uap.ProfileId
		).CountAsync(cancellationToken);

		var maxProfilesPerUser = AppEnvironment.Instance.MAX_PROFILES_PER_USER;
		if (liveProfileCount >= maxProfilesPerUser) {
			return (
				new SetTenantProfileUserResult.MaxProfilesPerUserExceeded(maxProfilesPerUser),
				false
			);
		}

		var assignment = new UserAccountProfile {
			UserAccountId = args.UserAccountId,
			ProfileId = args.ProfileId,
		};

		try {
			await _dbContext.UserAccountProfile.AddAsync(assignment, cancellationToken);
			AddAuditEntry(
				args,
				AuditActions.TenantProfileUserAssigned,
				profileAudit,
				memberAudit
			);
			await _dbContext.SaveChangesAsync(cancellationToken);
		} catch (DbUpdateException ex) when (IsUserAccountProfileDuplicateViolation(ex)) {
			// Defense in depth behind the row lock: the composite primary key is the final
			// authority on "assigned at most once", so a lost insert race is still idempotent.
			// PostgreSQL has aborted the transaction, so the caller must roll back — which also
			// discards this attempt's audit entry. That is correct: the winning writer recorded
			// the assignment, and no state change of ours became durable.
			foreach (var entry in _dbContext.ChangeTracker.Entries()
				.Where(e => e.State == EntityState.Added)
				.ToList()) {
				entry.State = EntityState.Detached;
			}

			return (
				new SetTenantProfileUserResult.Success(
					profileAudit,
					memberAudit,
					Changed: false
				),
				false
			);
		}

		return (
			new SetTenantProfileUserResult.Success(
				profileAudit,
				memberAudit,
				Changed: true
			),
			true
		);
	}

	/// <summary>
	/// Adds the audit entry to the current change tracker so it is flushed by the same
	/// <c>SaveChanges</c> — and therefore the same transaction — as the junction mutation it
	/// records. Deliberately does not go through <c>IAuditLogService</c>: that would be a
	/// service-to-service dependency, and its own <c>SaveChanges</c> would make the audit a
	/// second commit that a cancellation could skip.
	/// </summary>
	private void AddAuditEntry(
		SetTenantProfileUserArgs args,
		string action,
		TenantProfileAuditData profileAudit,
		TenantProfileMemberAuditData memberAudit
	) {
		var httpContext = _httpContextAccessor.HttpContext;

		var auditLog = AuditLog.CreateEntry(
			userId: args.ActorUserId,
			action: action,
			targetId: args.ProfileId,
			details: new {
				TenantId = args.TenantId,
				ProfileId = args.ProfileId,
				ProfileName = profileAudit.ProfileName,
				IsDefault = profileAudit.IsDefault,
				UserAccountId = memberAudit.UserAccountId,
				UserId = memberAudit.UserId,
				AccountLevel = memberAudit.Level.ToString()
			},
			ipAddress: httpContext?.Connection.RemoteIpAddress?.ToString(),
			userAgent: httpContext?.Request.Headers.UserAgent.ToString()
		);

		_ = _dbContext.AuditLog.Add(auditLog);
	}

	/// <summary>
	/// Detects a duplicate user_account_profiles row (composite primary key violation).
	/// PostgreSQL error code 23505 = unique_violation.
	/// </summary>
	private static bool IsUserAccountProfileDuplicateViolation(DbUpdateException ex) {
		if (ex.InnerException is Npgsql.PostgresException pgEx) {
			return pgEx.SqlState == "23505"
				&& pgEx.TableName is not null
				&& pgEx.TableName.Equals(
					"user_account_profiles",
					StringComparison.OrdinalIgnoreCase
				);
		}

		return false;
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
