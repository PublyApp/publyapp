using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.Permissions.Entities;
using PublyApp.Api.Modules.Roles.Entities;
using PublyApp.Api.Modules.Users.Entities;
using PublyApp.Api.Modules.Users.Services;

namespace PublyApp.Api.Modules.Roles.Services;

public sealed record TenantRoleAuditData(
	Guid RoleId,
	string RoleName,
	string? Description,
	bool IsDefault,
	string? Icon = null,
	string? Tone = null
);

public sealed record CreateTenantRoleArgs(
	Guid TenantId,
	string Name,
	string? Description,
	string? Icon,
	string? Tone,
	List<string> PermissionKeys
);

public abstract record CreateTenantRoleResult {
	public sealed record Success(
		TenantRoleItem Role,
		List<string> InitialPermissionKeys
	)
		: CreateTenantRoleResult;

	public sealed record TenantNotFound : CreateTenantRoleResult;

	public sealed record RoleNameExists(string Name)
		: CreateTenantRoleResult;

	public sealed record InvalidPermissions(List<string> InvalidKeys)
		: CreateTenantRoleResult;
}

public sealed record UpdateTenantRoleArgs(
	Guid TenantId,
	Guid RoleId,
	PatchField<string?> Name,
	PatchField<string?> Description,
	PatchField<string?> Icon,
	PatchField<string?> Tone
);

public abstract record UpdateTenantRoleResult {
	public sealed record Success(
		TenantRoleItem Role,
		TenantRoleAuditData PreviousRole
	)
		: UpdateTenantRoleResult;

	public sealed record RoleNotFound : UpdateTenantRoleResult;

	public sealed record SystemRoleProtected : UpdateTenantRoleResult;

	public sealed record RoleNameExists(string Name)
		: UpdateTenantRoleResult;
}

public sealed record DeleteTenantRoleArgs(
	Guid TenantId,
	Guid RoleId
);

// Tenant bulk-delete input used by staff endpoints. Duplicates are trimmed before DB
// work to keep result counts stable.
public sealed record BulkDeleteTenantRolesArgs(
	Guid TenantId,
	List<Guid> RoleIds
);

public abstract record DeleteTenantRoleResult {
	public sealed record Success(
		TenantRoleAuditData Role,
		int DeletedRoleCount
	)
		: DeleteTenantRoleResult;

	public sealed record RoleNotFound : DeleteTenantRoleResult;

	public sealed record SystemRoleProtected : DeleteTenantRoleResult;

	public sealed record DefaultRoleDeletionNotAllowed : DeleteTenantRoleResult;
}

public sealed record SetTenantRolePermissionArgs(
	Guid TenantId,
	Guid RoleId,
	string PermissionKey,
	bool IsAssigned
);

public abstract record SetTenantRolePermissionResult {
	public sealed record Success(
		TenantRoleAuditData Role,
		bool Changed
	) : SetTenantRolePermissionResult;

	public sealed record RoleNotFound : SetTenantRolePermissionResult;

	public sealed record SystemRoleProtected : SetTenantRolePermissionResult;

	public sealed record PermissionNotFound : SetTenantRolePermissionResult;
}

/// <summary>
/// Identity of the tenant member a role assignment was toggled for, captured for audit.
/// </summary>
public sealed record TenantRoleMemberAuditData(
	Guid UserAccountId,
	Guid UserId,
	bool IsFullAccess
);

public sealed record SetTenantRoleUserArgs(
	Guid TenantId,
	Guid RoleId,
	Guid UserAccountId,
	bool IsAssigned,
	// The acting staff user. The audit entry is written inside this operation's transaction,
	// so the actor must travel with the request rather than be resolved afterwards.
	Guid ActorUserId
);

public abstract record SetTenantRoleUserResult {
	public sealed record Success(
		TenantRoleAuditData Role,
		TenantRoleMemberAuditData Member,
		bool Changed
	) : SetTenantRoleUserResult;

	public sealed record RoleNotFound : SetTenantRoleUserResult;

	public sealed record MemberNotFound : SetTenantRoleUserResult;

	public sealed record MaxRolesPerUserExceeded(int MaxRolesPerUser)
		: SetTenantRoleUserResult;

	/// <summary>Unassigning this link would leave the tenant with no active full-access holder.</summary>
	public sealed record LastFullAccessRoleAssignment : SetTenantRoleUserResult;
}


public interface ITenantRoleAsStaffService {
	Task<Role> GetOrCreateDefaultTenantRoleAsync(
		Guid tenantId,
		CancellationToken cancellationToken = default
	);

	Task<CreateTenantRoleResult> CreateTenantRoleAsync(
		CreateTenantRoleArgs args,
		CancellationToken cancellationToken = default
	);

	Task<UpdateTenantRoleResult> UpdateTenantRoleAsync(
		UpdateTenantRoleArgs args,
		CancellationToken cancellationToken = default
	);

	Task<DeleteTenantRoleResult> DeleteTenantRoleAsync(
		DeleteTenantRoleArgs args,
		CancellationToken cancellationToken = default
	);

	Task<BulkRoleActionResult> BulkDeleteTenantRolesAsync(
		BulkDeleteTenantRolesArgs args,
		CancellationToken cancellationToken = default
	);

	Task<SetTenantRolePermissionResult> SetTenantRolePermissionAsync(
		SetTenantRolePermissionArgs args,
		CancellationToken cancellationToken = default
	);

	Task<SetTenantRoleUserResult> SetTenantRoleUserAsync(
		SetTenantRoleUserArgs args,
		CancellationToken cancellationToken = default
	);
}

[Service(ServiceLifetime.Scoped)]
public sealed class TenantRoleAsStaffService : ITenantRoleAsStaffService {
	private readonly AppDbContext _DbContext;
	private readonly ILogger<TenantRoleAsStaffService> _Logger;
	private readonly IHttpContextAccessor _HttpContextAccessor;

	public TenantRoleAsStaffService(
		AppDbContext dbContext,
		ILogger<TenantRoleAsStaffService> logger,
		// Framework infrastructure, not a domain service: this is the same accessor
		// AuditLogService uses to stamp ip/user-agent, so audit rows written transactionally
		// here are shape-identical to the ones it writes.
		IHttpContextAccessor httpContextAccessor
	) {
		this._DbContext = dbContext;
		this._Logger = logger;
		this._HttpContextAccessor = httpContextAccessor;
	}

	public async Task<Role> GetOrCreateDefaultTenantRoleAsync(
		Guid tenantId,
		CancellationToken cancellationToken = default
	) {
		var query =
			from p in this._DbContext.Role
			where p.Scope == RoleScope.Tenant
				&& p.TenantId == tenantId
				&& p.IsDefault
				&& !p.IsDeleted
			select p;

		var defaultRole = await query.FirstOrDefaultAsync(cancellationToken);
		if (defaultRole is not null) {
			return defaultRole;
		}

		defaultRole = Role.CreateTenantRole(
			tenantId,
			name: "Default role",
			description: "Default role with no permissions",
			isDefault: true
		);

		var savedDefaultRole = await this._DbContext.Role.AddAsync(
			defaultRole,
			cancellationToken
		);
		await this._DbContext.SaveChangesAsync(cancellationToken);

		if (this._Logger.IsEnabled(LogLevel.Information)) {
			this._Logger.LogInformation(
				"Created missing default tenant role for tenant {TenantId}",
				tenantId
			);
		}

		return savedDefaultRole.Entity;
	}

	public async Task<CreateTenantRoleResult> CreateTenantRoleAsync(
		CreateTenantRoleArgs args,
		CancellationToken cancellationToken = default
	) {
		var tenantExists = await (
			from t in this._DbContext.Tenant
			where t.Id == args.TenantId
				&& !t.IsDeleted
			select t.Id
		).AnyAsync(cancellationToken);

		if (!tenantExists) {
			return new CreateTenantRoleResult.TenantNotFound();
		}

		var normalizedName = args.Name.Trim();
		var normalizedDescription = args.Description?.Trim();
		var normalizedPermissionKeys = args.PermissionKeys
			.Select(key => key.Trim())
			.Where(key => !string.IsNullOrWhiteSpace(key))
			.Distinct(StringComparer.Ordinal)
			.OrderBy(key => key, StringComparer.Ordinal)
			.ToList();

		var roleExists = await (
			from p in this._DbContext.Role
			where p.TenantId == args.TenantId
				&& p.Scope == RoleScope.Tenant
				&& !p.IsDeleted
				&& p.Name == normalizedName
			select p.Id
		).AnyAsync(cancellationToken);

		if (roleExists) {
			return new CreateTenantRoleResult.RoleNameExists(normalizedName);
		}

		var validPermissionKeys = await (
			from permission in this._DbContext.Permission
			where normalizedPermissionKeys.Contains(permission.Key)
				&& permission.Scope == PermissionScope.Tenant
				&& !permission.IsDeleted
			select permission.Key
		).ToListAsync(cancellationToken);

		var invalidPermissionKeys = normalizedPermissionKeys
			.Except(validPermissionKeys, StringComparer.Ordinal)
			.ToList();

		if (invalidPermissionKeys.Count > 0) {
			return new CreateTenantRoleResult.InvalidPermissions(
				invalidPermissionKeys
			);
		}

		await using var transaction = await this._DbContext.Database
			.BeginTransactionAsync(cancellationToken);

		var role = Role.CreateTenantRole(
			args.TenantId,
			normalizedName,
			normalizedDescription,
			icon: args.Icon,
			tone: args.Tone
		);

		try {
			await this._DbContext.Role.AddAsync(role, cancellationToken);
			await this._DbContext.SaveChangesAsync(cancellationToken);

			var roleId = role.GetRequiredId();
			if (validPermissionKeys.Count > 0) {
				// Create uses one atomic write batch so the initial permission set cannot drift
				// away from the newly-created role if one of the inserts fails.
				var rolePermissions = validPermissionKeys
					.Select(permissionKey => new RolePermission {
						RoleId = roleId,
						PermissionKey = permissionKey
					})
					.ToList();

				await this._DbContext.RolePermission
					.AddRangeAsync(rolePermissions, cancellationToken);
				await this._DbContext.SaveChangesAsync(cancellationToken);
			}

			await transaction.CommitAsync(cancellationToken);
		} catch (DbUpdateException ex) when (TenantRoleAsStaffService._IsTenantRoleNameUniqueViolation(ex)) {
			// The pre-check keeps the common path friendly, but the unique index is the real
			// guard against concurrent creates or renames racing each other.
			await transaction.RollbackAsync(cancellationToken);
			this._DbContext.Entry(role).State = EntityState.Detached;
			return new CreateTenantRoleResult.RoleNameExists(normalizedName);
		} catch {
			await transaction.RollbackAsync(cancellationToken);
			throw;
		}

		var created = new TenantRoleItem {
			Id = role.GetRequiredId(),
			Name = role.Name,
			Description = role.Description,
			Icon = role.Icon,
			Tone = role.Tone,
			IsDefault = role.IsDefault,
			UserAccountCount = 0,
			PermissionsCount = validPermissionKeys.Count,
			CreatedAt = role.CreatedAt,
			UpdatedAt = role.UpdatedAt,
		};

		return new CreateTenantRoleResult.Success(
			created,
			validPermissionKeys
		);
	}

	public async Task<UpdateTenantRoleResult> UpdateTenantRoleAsync(
		UpdateTenantRoleArgs args,
		CancellationToken cancellationToken = default
	) {
		var role = await (
			from p in this._DbContext.Role
			where p.Id == args.RoleId
				&& p.Scope == RoleScope.Tenant
				&& p.TenantId == args.TenantId
				&& !p.IsDeleted
			select p
		).FirstOrDefaultAsync(cancellationToken);

		if (role is null) {
			return new UpdateTenantRoleResult.RoleNotFound();
		}

		if (role.IsFullAccess) {
			return new UpdateTenantRoleResult.SystemRoleProtected();
		}

		var previousRole = new TenantRoleAuditData(
			role.GetRequiredId(),
			role.Name,
			role.Description,
			role.IsDefault,
			role.Icon,
			role.Tone
		);

		if (args.Name.IsPresent) {
			var candidateName = args.Name.Value?.Trim();
			if (string.IsNullOrWhiteSpace(candidateName)) {
				throw new InvalidOperationException(
					"UpdateTenantRoleAsync received an invalid name. " +
					"Ensure endpoint validation ran before calling the service."
				);
			}

			var exists = await (
				from p in this._DbContext.Role
				where p.TenantId == args.TenantId
					&& p.Scope == RoleScope.Tenant
					&& !p.IsDeleted
					&& p.Id != args.RoleId
					&& p.Name == candidateName
				select p.Id
			).AnyAsync(cancellationToken);

			if (exists) {
				return new UpdateTenantRoleResult.RoleNameExists(candidateName);
			}

			role.Name = candidateName;
		}

		if (args.Description.IsPresent) {
			role.Description = args.Description.Value?.Trim();
		}

		if (args.Icon.IsPresent) {
			role.Icon = args.Icon.Value;
		}

		if (args.Tone.IsPresent) {
			role.Tone = args.Tone.Value;
		}

		try {
			await this._DbContext.SaveChangesAsync(cancellationToken);
		} catch (DbUpdateException ex) when (TenantRoleAsStaffService._IsTenantRoleNameUniqueViolation(ex)) {
			this._DbContext.Entry(role).State = EntityState.Detached;
			return new UpdateTenantRoleResult.RoleNameExists(role.Name);
		}

		// Role update does not touch assignments, but the response must reflect the
		// current membership count after any concurrent assignment cleanup.
		var userAccountCount = await (
			from uap in this._DbContext.UserAccountRole
			where uap.RoleId == args.RoleId
			select uap.RoleId
		).CountAsync(cancellationToken);

		var permissionsCount = await (
			from rolePermission in this._DbContext.RolePermission
			where rolePermission.RoleId == args.RoleId
			select rolePermission.RoleId
		).CountAsync(cancellationToken);

		var updated = new TenantRoleItem {
			Id = role.GetRequiredId(),
			Name = role.Name,
			Description = role.Description,
			Icon = role.Icon,
			Tone = role.Tone,
			IsDefault = role.IsDefault,
			UserAccountCount = userAccountCount,
			PermissionsCount = permissionsCount,
			CreatedAt = role.CreatedAt,
			UpdatedAt = role.UpdatedAt,
		};

		return new UpdateTenantRoleResult.Success(updated, previousRole);
	}

	public async Task<DeleteTenantRoleResult> DeleteTenantRoleAsync(
		DeleteTenantRoleArgs args,
		CancellationToken cancellationToken = default
	) {
		await using var transaction = await this._DbContext.Database
			.BeginTransactionAsync(cancellationToken);

		try {
			var result = await this._DeleteTenantRoleCoreAsync(args, cancellationToken);

			if (result is DeleteTenantRoleResult.Success) {
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

	private async Task<DeleteTenantRoleResult> _DeleteTenantRoleCoreAsync(
		DeleteTenantRoleArgs args,
		CancellationToken cancellationToken
	) {
		// TenantMembershipLockOrder step 3: pin the role before enumerating its junction
		// rows, so a concurrent assign cannot slip a new link in behind this cleanup.
		var role = await TenantMembershipLockOrder.LockLiveTenantRoleAsync(
			this._DbContext,
			args.TenantId,
			args.RoleId,
			cancellationToken
		);

		if (role is null) {
			return new DeleteTenantRoleResult.RoleNotFound();
		}

		if (role.IsFullAccess) {
			return new DeleteTenantRoleResult.SystemRoleProtected();
		}

		if (role.IsDefault) {
			return new DeleteTenantRoleResult.DefaultRoleDeletionNotAllowed();
		}

		var roleAudit = new TenantRoleAuditData(
			role.GetRequiredId(),
			role.Name,
			role.Description,
			role.IsDefault
		);

		var roleIdValue = role.GetRequiredId();

		// TenantMembershipLockOrder step 5: lock and materialize the junction rows in one
		// statement. A concurrent member-removal cleanup targeting the same link hands us only
		// survivors, so we never issue a tracked delete for a row it already removed.
		var links = await TenantMembershipLockOrder.LockAndMaterializeLinksForRolesAsync(
			this._DbContext,
			[roleIdValue],
			cancellationToken
		);

		if (links.Count > 0) {
			// A deleted tenant role must stop contributing memberships immediately, so we remove
			// the junction rows instead of leaving stale memberships behind.
			this._DbContext.ForceHardDeleteRange(links);
		}

		var permissions = await (
			from pp in this._DbContext.RolePermission
			where pp.RoleId == roleIdValue
			select pp
		).ToListAsync(cancellationToken);

		if (permissions.Count > 0) {
			// Same rationale as the user-account links above: deleting the role should fully
			// detach its permission membership rows in the same transaction.
			this._DbContext.ForceHardDeleteRange(permissions);
		}

		role.IsDeleted = true;
		role.DeletedAt = DateTime.UtcNow;
		role.UpdatedAt = DateTime.UtcNow;

		await this._DbContext.SaveChangesAsync(cancellationToken);

		return new DeleteTenantRoleResult.Success(
			Role: roleAudit,
			DeletedRoleCount: 1
		);
	}

	public async Task<BulkRoleActionResult> BulkDeleteTenantRolesAsync(
		BulkDeleteTenantRolesArgs args,
		CancellationToken cancellationToken = default
	) {
		// Deduplicate caller input once so we evaluate each ID only one time and keep
		// deterministic succeeded/failed counts.
		var requestedRoleIds = args.RoleIds.Distinct().ToList();

		if (requestedRoleIds.Count == 0) {
			return new BulkRoleActionResult(
				SucceededCount: 0,
				FailedCount: 0,
				FailedItems: []
			);
		}

		await using var transaction = await this._DbContext.Database
			.BeginTransactionAsync(cancellationToken);

		try {
			var result = await this._BulkDeleteTenantRolesCoreAsync(
				requestedRoleIds,
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

	private async Task<BulkRoleActionResult> _BulkDeleteTenantRolesCoreAsync(
		List<Guid> requestedRoleIds,
		Guid tenantId,
		CancellationToken cancellationToken
	) {
		var args = new BulkDeleteTenantRolesArgs(tenantId, requestedRoleIds);

		// TenantMembershipLockOrder step 3, batched: pin every candidate role in a
		// deterministic id order before reading them or their junction rows, so concurrent
		// assigns cannot re-link a role this batch is about to purge, and two concurrent
		// bulk deletes cannot deadlock.
		await TenantMembershipLockOrder.LockRoleRowsAsync(
			this._DbContext,
			requestedRoleIds,
			cancellationToken
		);

		// Resolve all matching tenant roles in one DB call; this lets us decide
		// exactly which requested IDs are invalid or protected.
		var roles = await (
			from p in this._DbContext.Role
			where p.TenantId == args.TenantId
				&& p.Scope == RoleScope.Tenant
				&& !p.IsDeleted
				&& p.Id != null
				&& requestedRoleIds.Contains(p.Id.Value)
			select p
		).ToListAsync(cancellationToken);

		var roleById = roles.ToDictionary(p => p.GetRequiredId());
		var failedItems = new List<BulkRoleActionFailedItem>();

		foreach (var requestedRoleId in requestedRoleIds) {
			if (!roleById.TryGetValue(requestedRoleId, out var role)) {
				failedItems.Add(
					new BulkRoleActionFailedItem(
						requestedRoleId,
						"Role not found"
					)
				);
				continue;
			}

			if (role.IsDefault || role.IsFullAccess) {
				failedItems.Add(
					new BulkRoleActionFailedItem(
						requestedRoleId,
						role.IsFullAccess
							? "Full-access system role cannot be deleted"
							: "Default tenant role cannot be deleted"
					)
				);
			}
		}

		// Exclude default roles from bulk operations to preserve the existing
		// platform rule that defaults are not deletable.
		var deletableRoleIds = roles
			.Where(role => !role.IsDefault && !role.IsFullAccess)
			.Select(role => role.GetRequiredId())
			.ToList();

		if (deletableRoleIds.Count == 0) {
			return new BulkRoleActionResult(
				SucceededCount: 0,
				FailedCount: failedItems.Count,
				FailedItems: failedItems
			);
		}

		// TenantMembershipLockOrder step 5, batched — same rationale as the single-role path.
		var links = await TenantMembershipLockOrder.LockAndMaterializeLinksForRolesAsync(
			this._DbContext,
			deletableRoleIds,
			cancellationToken
		);

		if (links.Count > 0) {
			this._DbContext.ForceHardDeleteRange(links);
		}

		var permissions = await (
			from pp in this._DbContext.RolePermission
			where deletableRoleIds.Contains(pp.RoleId)
			select pp
		).ToListAsync(cancellationToken);

		if (permissions.Count > 0) {
			this._DbContext.ForceHardDeleteRange(permissions);
		}

		// Keep a single pass over non-default roles for the actual soft-delete.
		var rolesToDelete = roleById
			.Values
			.Where(role => !role.IsDefault && !role.IsFullAccess)
			.ToList();

		foreach (var role in rolesToDelete) {
			role.IsDeleted = true;
			role.DeletedAt = DateTime.UtcNow;
			role.UpdatedAt = DateTime.UtcNow;
		}

		await this._DbContext.SaveChangesAsync(cancellationToken);

		var failedItemsById = new HashSet<Guid>(
			failedItems.Select(item => item.RoleId)
		);

		var succeededRoleIds = requestedRoleIds
			.Where(id => !failedItemsById.Contains(id))
			.ToList();

		return new BulkRoleActionResult(
			SucceededCount: succeededRoleIds.Count,
			FailedCount: failedItems.Count,
			FailedItems: failedItems
		);
	}

	public async Task<SetTenantRolePermissionResult>
		SetTenantRolePermissionAsync(
			SetTenantRolePermissionArgs args,
			CancellationToken cancellationToken = default
		) {
		var role = await (
			from p in this._DbContext.Role
			where p.Id == args.RoleId
				&& p.Scope == RoleScope.Tenant
				&& p.TenantId == args.TenantId
				&& !p.IsDeleted
			select p
		).FirstOrDefaultAsync(cancellationToken);

		if (role is null) {
			return new SetTenantRolePermissionResult.RoleNotFound();
		}

		if (role.IsFullAccess) {
			return new SetTenantRolePermissionResult.SystemRoleProtected();
		}

		var roleAudit = new TenantRoleAuditData(
			role.GetRequiredId(),
			role.Name,
			role.Description,
			role.IsDefault
		);

		var permissionExists = await (
			from p in this._DbContext.Permission
			where p.Key == args.PermissionKey
				&& !p.IsDeleted
				&& p.Scope == PermissionScope.Tenant
			select p.Key
		).AnyAsync(cancellationToken);

		if (!permissionExists) {
			return new SetTenantRolePermissionResult.PermissionNotFound();
		}

		var existing = await (
			from pp in this._DbContext.RolePermission
			where pp.RoleId == args.RoleId
				&& pp.PermissionKey == args.PermissionKey
			select pp
		).FirstOrDefaultAsync(cancellationToken);

		if (existing is null) {
			if (args.IsAssigned) {
				await this._DbContext.RolePermission.AddAsync(
					new RolePermission {
						RoleId = args.RoleId,
						PermissionKey = args.PermissionKey,
					},
					cancellationToken
				);

				await this._DbContext.SaveChangesAsync(cancellationToken);
				return new SetTenantRolePermissionResult.Success(
					roleAudit,
					Changed: true
				);
			}

			return new SetTenantRolePermissionResult.Success(
				roleAudit,
				Changed: false
			);
		}

		if (args.IsAssigned) {
			// Existing row already represents an active grant; repeated POST is idempotent.
			return new SetTenantRolePermissionResult.Success(
				roleAudit,
				Changed: false
			);
		}

		// DELETE removes the active grant. There is no inactive row to preserve because audit
		// logs are the history source for permission-assignment changes.
		this._DbContext.RolePermission.Remove(existing);
		await this._DbContext.SaveChangesAsync(cancellationToken);

		return new SetTenantRolePermissionResult.Success(
			roleAudit,
			Changed: true
		);
	}

	public async Task<SetTenantRoleUserResult> SetTenantRoleUserAsync(
		SetTenantRoleUserArgs args,
		CancellationToken cancellationToken = default
	) {
		await using var transaction = await this._DbContext.Database
			.BeginTransactionAsync(cancellationToken);

		try {
			var (result, shouldCommit) = await this._SetTenantRoleUserCoreAsync(
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
	/// Transactional body of <see cref="SetTenantRoleUserAsync"/>. Follows
	/// <see cref="TenantMembershipLockOrder"/>: lock the live role, then the live account,
	/// then read junction state. Returns the caller-visible result plus whether the transaction
	/// may be committed — the duplicate-race backstop reports success but must roll back,
	/// because PostgreSQL has already aborted the transaction.
	/// </summary>
	private async Task<(SetTenantRoleUserResult Result, bool ShouldCommit)>
		_SetTenantRoleUserCoreAsync(
			SetTenantRoleUserArgs args,
			CancellationToken cancellationToken
		) {
		// Lock order step 3. Locking with the liveness predicate (rather than reading live and
		// locking by id) is what makes the tenant/scope/soft-delete guards linearizable: a
		// role deleted while we waited yields no row here, so we cannot insert a junction
		// row under a role the delete path already purged.
		// A staff-scope role, another tenant's role and a deleted role are all
		// indistinguishable "not found", mirroring SetTenantRolePermissionAsync and avoiding
		// leaks about roles outside this tenant.
		var role = await TenantMembershipLockOrder.LockLiveTenantRoleAsync(
			this._DbContext,
			args.TenantId,
			args.RoleId,
			cancellationToken
		);

		if (role is null) {
			return (new SetTenantRoleUserResult.RoleNotFound(), false);
		}

		// Lock order step 4. Blocks cross-tenant assignment, and a membership removed while we
		// waited yields no row instead of a lock on a soft-deleted account.
		var member = await TenantMembershipLockOrder.LockLiveTenantAccountAsync(
			this._DbContext,
			args.TenantId,
			args.UserAccountId,
			cancellationToken
		);

		if (member is null) {
			return (new SetTenantRoleUserResult.MemberNotFound(), false);
		}

		var roleAudit = new TenantRoleAuditData(
			role.GetRequiredId(),
			role.Name,
			role.Description,
			role.IsDefault
		);

		var isMemberFullAccess = await (
			from uap in this._DbContext.UserAccountRole
			join p in this._DbContext.Role on uap.RoleId equals p.Id
			where uap.UserAccountId == args.UserAccountId
				&& p.IsFullAccess
				&& !p.IsDeleted
			select p.Id
		).AnyAsync(cancellationToken);

		var memberAudit = new TenantRoleMemberAuditData(
			member.GetRequiredId(),
			member.UserId,
			isMemberFullAccess
		);

		// Lock order step 5: both parents are pinned, so junction state read from here is
		// stable for the rest of the transaction.
		var existing = await (
			from uap in this._DbContext.UserAccountRole
			where uap.UserAccountId == args.UserAccountId
				&& uap.RoleId == args.RoleId
			select uap
		).FirstOrDefaultAsync(cancellationToken);

		if (!args.IsAssigned) {
			if (existing is null) {
				// Unassigning something that is not assigned is a no-op success.
				return (
					new SetTenantRoleUserResult.Success(
						roleAudit,
						memberAudit,
						Changed: false
					),
					true
				);
			}

			if (role.IsFullAccess) {
				// Demoting the last owner would leave the tenant with nobody able to grant
				// access again. This replaces the removed account-level demotion guard: the role
				// unassign is now the only way to demote.
				await TenantMembershipLockOrder.LockTenantRowsAsync(
					this._DbContext,
					[args.TenantId],
					cancellationToken
				);
				var isActiveMember =
					member.Status != AccountStatus.Suspended
					&& await this._DbContext.User.AnyAsync(u =>
						u.Id == member.UserId
						&& !u.IsDeleted
						&& u.Status != UserStatus.Suspended,
						cancellationToken);
				var activeFullAccessCount =
					await FullAccessRoleQueries.CountActiveTenantFullAccessAsync(
						this._DbContext,
						args.TenantId,
						cancellationToken
					);
				if (isActiveMember && activeFullAccessCount <= 1) {
					return (new SetTenantRoleUserResult.LastFullAccessRoleAssignment(), false);
				}
			}

			// Junction rows carry no soft-delete state; membership history lives in audit logs.
			// The audit entry is therefore added to this same SaveChanges: the row and its only
			// record must become durable together or not at all.
			this._DbContext.ForceHardDelete(existing);
			this._AddAuditEntry(
				args,
				AuditActions.TenantRoleUserUnassigned,
				roleAudit,
				memberAudit
			);
			await this._DbContext.SaveChangesAsync(cancellationToken);

			return (
				new SetTenantRoleUserResult.Success(
					roleAudit,
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
				new SetTenantRoleUserResult.Success(
					roleAudit,
					memberAudit,
					Changed: false
				),
				true
			);
		}

		// The cap is a COUNT invariant, which no table constraint can express. The account row
		// lock taken above is what stops two concurrent assigns from both observing a below-cap
		// count and then inserting past it.
		// Count only live assignments: a junction row pointing at a soft-deleted role grants
		// nothing, so it must not consume the member's quota.
		var liveRoleCount = await (
			from uap in this._DbContext.UserAccountRole
			from p in this._DbContext.Role
			where p.Id == uap.RoleId
				&& uap.UserAccountId == args.UserAccountId
				&& !p.IsDeleted
			select uap.RoleId
		).CountAsync(cancellationToken);

		var maxRolesPerUser = AppEnvironment.Instance.MAX_ROLES_PER_USER;
		if (liveRoleCount >= maxRolesPerUser) {
			return (
				new SetTenantRoleUserResult.MaxRolesPerUserExceeded(maxRolesPerUser),
				false
			);
		}

		var assignment = new UserAccountRole {
			UserAccountId = args.UserAccountId,
			RoleId = args.RoleId,
		};

		try {
			await this._DbContext.UserAccountRole.AddAsync(assignment, cancellationToken);
			this._AddAuditEntry(
				args,
				AuditActions.TenantRoleUserAssigned,
				roleAudit,
				memberAudit
			);
			await this._DbContext.SaveChangesAsync(cancellationToken);
		} catch (DbUpdateException ex) when (TenantRoleAsStaffService._IsUserAccountRoleDuplicateViolation(ex)) {
			// Defense in depth behind the row lock: the composite primary key is the final
			// authority on "assigned at most once", so a lost insert race is still idempotent.
			// PostgreSQL has aborted the transaction, so the caller must roll back — which also
			// discards this attempt's audit entry. That is correct: the winning writer recorded
			// the assignment, and no state change of ours became durable.
			foreach (var entry in this._DbContext.ChangeTracker.Entries()
				.Where(e => e.State == EntityState.Added)
				.ToList()) {
				entry.State = EntityState.Detached;
			}

			return (
				new SetTenantRoleUserResult.Success(
					roleAudit,
					memberAudit,
					Changed: false
				),
				false
			);
		}

		return (
			new SetTenantRoleUserResult.Success(
				roleAudit,
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
	private void _AddAuditEntry(
		SetTenantRoleUserArgs args,
		string action,
		TenantRoleAuditData roleAudit,
		TenantRoleMemberAuditData memberAudit
	) {
		var httpContext = this._HttpContextAccessor.HttpContext;

		var auditLog = AuditLog.CreateEntry(
			userId: args.ActorUserId,
			action: action,
			targetId: args.RoleId,
			details: new {
				TenantId = args.TenantId,
				RoleId = args.RoleId,
				RoleName = roleAudit.RoleName,
				IsDefault = roleAudit.IsDefault,
				UserAccountId = memberAudit.UserAccountId,
				UserId = memberAudit.UserId,
				IsFullAccess = memberAudit.IsFullAccess
			},
			ipAddress: httpContext?.Connection.RemoteIpAddress?.ToString(),
			userAgent: httpContext?.Request.Headers.UserAgent.ToString()
		);

		_ = this._DbContext.AuditLog.Add(auditLog);
	}

	/// <summary>
	/// Detects a duplicate user_account_roles row (composite primary key violation).
	/// PostgreSQL error code 23505 = unique_violation.
	/// </summary>
	private static bool _IsUserAccountRoleDuplicateViolation(DbUpdateException ex) {
		if (ex.InnerException is Npgsql.PostgresException pgEx) {
			return pgEx.SqlState == "23505"
				&& pgEx.TableName is not null
				&& pgEx.TableName.Equals(
					"user_account_roles",
					StringComparison.OrdinalIgnoreCase
				);
		}

		return false;
	}

	/// <summary>
	/// Detects unique constraint violations on the roles table.
	/// PostgreSQL error code 23505 = unique_violation.
	/// We only map the active tenant-role name invariant here.
	/// </summary>
	private static bool _IsTenantRoleNameUniqueViolation(DbUpdateException ex) {
		if (ex.InnerException is Npgsql.PostgresException pgEx) {
			return pgEx.SqlState == "23505"
				&& pgEx.TableName is not null
				&& pgEx.TableName.Equals("roles", StringComparison.OrdinalIgnoreCase);
		}

		return false;
	}
}
