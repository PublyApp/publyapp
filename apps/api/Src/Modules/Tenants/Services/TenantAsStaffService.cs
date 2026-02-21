using MainApi.Src.Data.DbContext;
using MainApi.Src.Lib;
using MainApi.Src.Lib.Utils;
using MainApi.Src.Modules.Invitations.Entities;
using MainApi.Src.Modules.Profiles.Entities;
using MainApi.Src.Modules.Tenants.Entities;
using MainApi.Src.Modules.Users.Entities;

using Microsoft.EntityFrameworkCore;

namespace MainApi.Src.Modules.Tenants.Services;

public class TenantAsStaffItem {
	public required Tenant Tenant { get; set; }
	public int UsersCount { get; set; }
}

public record CreateTenantWithInitialUsersResult {
	public required Tenant Tenant { get; init; }
	public required List<(string Email, string Token, AccountLevel Level)> InvitationTokens { get; init; }
}

// Result types for suspend/reactivate operations
public enum SuspendTenantError { NotFound, AlreadySuspended, NotActiveStatus }
public enum ReactivateTenantError { NotFound, NotSuspended }
public record SuspendTenantResult(Tenant? Tenant, SuspendTenantError? Error);
public record ReactivateTenantResult(Tenant? Tenant, ReactivateTenantError? Error);

// Result types for update/delete operations
public enum UpdateTenantError { NotFound, MaxUsersBelowCurrentCount }
public record UpdateTenantResult(Tenant? Tenant, UpdateTenantError? Error);

public enum DeleteTenantError { NotFound, NotSuspended }
public record DeleteTenantResult(Tenant? Tenant, DeleteTenantError? Error);

public record UpdateTenantAsStaffArgs(
	string? Name,
	PatchField<string?> LogoUrl,
	int? MaxUsers
);

public interface ITenantAsStaffService {
	Task<Tenant> CreateTenant(Tenant tenant, CancellationToken cancellationToken = default);
	Task<Tenant?> GetTenantByIdAsync(Guid tenantId, CancellationToken cancellationToken = default);
	Task<List<TenantAsStaffItem>> FindTenantsAsync(
		int? page = null,
		int? limit = null,
		string? sortId = null,
		SortOrder? sortOrder = null,
		CancellationToken cancellationToken = default
	);
	Task<int> CountTenantsAsync(CancellationToken cancellationToken = default);

	// NEW: Create tenant with initial users via invitations
	Task<CreateTenantWithInitialUsersResult> CreateTenantWithInitialUsersAsync(
		string name,
		int maxUsers,
		List<(string Email, AccountLevel AccountLevel)> initialUsers,
		Guid invitedByUserId,
		CancellationToken cancellationToken = default
	);

	// Suspend/Reactivate operations
	Task<SuspendTenantResult> SuspendTenantAsync(
		Guid tenantId,
		CancellationToken cancellationToken = default
	);
	Task<ReactivateTenantResult> ReactivateTenantAsync(
		Guid tenantId,
		CancellationToken cancellationToken = default
	);

	// Staff can see suspended tenants (unlike regular GetTenantByIdAsync)
	Task<Tenant?> GetTenantByIdForStaffAsync(
		Guid tenantId,
		CancellationToken cancellationToken = default
	);

	// Count tenant-scoped users (excludes deleted and staff-scoped)
	Task<int> CountTenantUsersAsync(
		Guid tenantId,
		CancellationToken cancellationToken = default
	);

	// Update tenant fields (name, logoUrl, maxUsers)
	Task<UpdateTenantResult> UpdateTenantAsync(
		Guid tenantId,
		UpdateTenantAsStaffArgs args,
		CancellationToken cancellationToken = default
	);

	// Soft-delete a suspended tenant
	Task<DeleteTenantResult> DeleteTenantAsync(
		Guid tenantId,
		CancellationToken cancellationToken = default
	);
}

public class TenantAsStaffService : ITenantAsStaffService {
	private readonly MainApiDbContext _dbContext;

	public TenantAsStaffService(MainApiDbContext dbContext) {
		_dbContext = dbContext;
	}

	public async Task<Tenant> CreateTenant(Tenant tenant, CancellationToken cancellationToken = default) {
		var result = await _dbContext.Tenant.AddAsync(tenant, cancellationToken);
		await _dbContext.SaveChangesAsync(cancellationToken);
		return result.Entity;
	}

	public async Task<Tenant?> GetTenantByIdAsync(Guid tenantId, CancellationToken cancellationToken = default) {
		var query =
			from tenant in _dbContext.Tenant
			where tenant.Id == tenantId
			select tenant;

		var foundTenant = await query.FirstOrDefaultAsync(cancellationToken);

		if (foundTenant is not null && !Tenant.IsTenantActive(foundTenant)) {
			return null;
		}

		return foundTenant;
	}

	public async Task<List<TenantAsStaffItem>> FindTenantsAsync(
		int? page = null,
		int? limit = null,
		string? sortId = null,
		SortOrder? sortOrder = null,
		CancellationToken cancellationToken = default
	) {
		var effectiveLimit = limit ?? AppEnvironment.Instance.PAGINATION_DEFAULT_LIMIT;
		var effectivePage = page ?? 1;
		var effectiveSortOrder = sortOrder ?? SortOrder.Desc;

		var query =
			from tenant in _dbContext.Tenant
			where tenant.IsDeleted != true
			join userAccount in _dbContext.UserAccount
				.Where(ua => ua.Scope == AccountScope.Tenant && ua.IsDeleted != true)
				on tenant.Id equals userAccount.TenantId into userAccounts
			select new TenantAsStaffItem {
				Tenant = tenant,
				UsersCount = userAccounts.Count()
			};

		if (sortId is not null) {
			query = sortId.ToLower() switch {
				"createdat" => effectiveSortOrder == SortOrder.Asc
					? query.OrderBy(t => t.Tenant.CreatedAt)
					: query.OrderByDescending(t => t.Tenant.CreatedAt),
				"updatedat" => effectiveSortOrder == SortOrder.Asc
					? query.OrderBy(t => t.Tenant.UpdatedAt)
					: query.OrderByDescending(t => t.Tenant.UpdatedAt),
				"code" => effectiveSortOrder == SortOrder.Asc
					? query.OrderBy(t => t.Tenant.Code)
					: query.OrderByDescending(t => t.Tenant.Code),
				"name" => effectiveSortOrder == SortOrder.Asc
					? query.OrderBy(t => t.Tenant.Name)
					: query.OrderByDescending(t => t.Tenant.Name),
				"status" => effectiveSortOrder == SortOrder.Asc
					? query.OrderBy(t => t.Tenant.Status)
					: query.OrderByDescending(t => t.Tenant.Status),
				"userscount" => effectiveSortOrder == SortOrder.Asc
					? query.OrderBy(t => t.UsersCount)
					: query.OrderByDescending(t => t.UsersCount),
				_ => query // Default: no sorting for unsupported fields
			};
		}

		query = query
			.Skip((effectivePage - 1) * effectiveLimit)
			.Take(effectiveLimit);

		return await query
			.ToListAsync(cancellationToken);
	}

	public async Task<int> CountTenantsAsync(CancellationToken cancellationToken = default) {
		var query =
			from tenant in _dbContext.Tenant
			where tenant.IsDeleted != true
			select tenant;

		return await query.CountAsync(cancellationToken);
	}

	public async Task<CreateTenantWithInitialUsersResult> CreateTenantWithInitialUsersAsync(
		string name,
		int maxUsers,
		List<(string Email, AccountLevel AccountLevel)> initialUsers,
		Guid invitedByUserId,
		CancellationToken cancellationToken = default
	) {
		await using var transaction = await _dbContext.Database.BeginTransactionAsync(cancellationToken);

		try {
			// 1. Create tenant
			var tenant = new Tenant {
				Name = name,
				Code = CryptoUtils.RandomString(10).ToLower(),
				Status = TenantStatus.Pending,
				MaxUsers = maxUsers
			};

			var savedTenant = await _dbContext.Tenant.AddAsync(tenant, cancellationToken);
			await _dbContext.SaveChangesAsync(cancellationToken);
			var tenantId = savedTenant.Entity.GetRequiredId();

			// 2. Create "Default profile" for non-admin users
			var defaultProfile = Profile.CreateTenantProfile(
				tenantId,
				name: "Default profile",
				description: "Default profile with no permissions"
			);
			var savedDefaultProfile = await _dbContext.Profile.AddAsync(defaultProfile, cancellationToken);
			await _dbContext.SaveChangesAsync(cancellationToken);
			var defaultProfileId = savedDefaultProfile.Entity.GetRequiredId();

			// 3. Create invitations with appropriate profiles
			// NOTE: No need to validate existing users/memberships for a BRAND NEW tenant!
			// All validation is done in the validator (duplicates, admin requirement, etc.)
			var invitationTokens = new List<(string Email, string Token, AccountLevel Level)>();
			var expiresAt = DateTime.UtcNow.AddDays(7);

			foreach (var (email, accountLevel) in initialUsers) {
				var token = CryptoUtils.RandomString(AppEnvironment.Instance.INVITATION_TOKEN_LENGTH);

				// Determine profile IDs based on account level
				List<Guid> profileIds;
				if (accountLevel == AccountLevel.Admin) {
					// Admin users don't need profiles (they have all rights)
					profileIds = new List<Guid>();
				} else {
					// Non-admin users need at least 1 profile (app requirement)
					// Assign the default profile
					profileIds = new List<Guid> { defaultProfileId };
				}

				var invitation = Invitation.CreateTenantInvitationWithProfiles(
					email,
					tenantId,
					profileIds,
					invitedByUserId,
					expiresAt,
					token
				);

				// Store the account level in the invitation
				invitation.AccountLevel = accountLevel;

				invitation.ValidateInvitationType();
				_dbContext.Invitation.Add(invitation);

				invitationTokens.Add((email, token, accountLevel));
			}

			await _dbContext.SaveChangesAsync(cancellationToken);
			await transaction.CommitAsync(cancellationToken);

			return new CreateTenantWithInitialUsersResult {
				Tenant = savedTenant.Entity,
				InvitationTokens = invitationTokens
			};

		} catch {
			await transaction.RollbackAsync(cancellationToken);
			throw;
		}
	}

	public async Task<SuspendTenantResult> SuspendTenantAsync(
		Guid tenantId,
		CancellationToken cancellationToken = default
	) {
		// Use AsNoTracking for initial query to avoid EF tracking conflicts
		var tenant = await (
			from t in _dbContext.Tenant.AsNoTracking()
			where t.Id == tenantId && !t.IsDeleted
			select t
		).FirstOrDefaultAsync(cancellationToken);

		if (tenant is null) {
			return new SuspendTenantResult(null, SuspendTenantError.NotFound);
		}
		if (tenant.IsSuspended) {
			return new SuspendTenantResult(null, SuspendTenantError.AlreadySuspended);
		}
		if (tenant.Status != TenantStatus.Active) {
			return new SuspendTenantResult(null, SuspendTenantError.NotActiveStatus);
		}

		// Atomic update with WHERE clause checking current state (race condition safe)
		var rowsAffected = await _dbContext.Tenant
			.Where(t =>
				t.Id == tenantId &&
				!t.IsDeleted &&
				!t.IsSuspended &&
				t.Status == TenantStatus.Active)
			.ExecuteUpdateAsync(
				setters => setters
					.SetProperty(t => t.IsSuspended, true)
					.SetProperty(t => t.Status, TenantStatus.Suspended)
					.SetProperty(t => t.UpdatedAt, DateTime.UtcNow),
				cancellationToken);

		if (rowsAffected == 0) {
			// Race condition: someone else changed the state between our read and update
			return new SuspendTenantResult(null, SuspendTenantError.AlreadySuspended);
		}

		// Re-fetch tenant to return current state
		var updatedTenant = await (
			from t in _dbContext.Tenant.AsNoTracking()
			where t.Id == tenantId
			select t
		).FirstOrDefaultAsync(cancellationToken);

		return new SuspendTenantResult(updatedTenant, null);
	}

	public async Task<ReactivateTenantResult> ReactivateTenantAsync(
		Guid tenantId,
		CancellationToken cancellationToken = default
	) {
		// Use AsNoTracking for initial query to avoid EF tracking conflicts
		var tenant = await (
			from t in _dbContext.Tenant.AsNoTracking()
			where t.Id == tenantId && !t.IsDeleted
			select t
		).FirstOrDefaultAsync(cancellationToken);

		if (tenant is null) {
			return new ReactivateTenantResult(null, ReactivateTenantError.NotFound);
		}
		if (!tenant.IsSuspended) {
			return new ReactivateTenantResult(null, ReactivateTenantError.NotSuspended);
		}

		// Atomic update with WHERE clause checking current state (race condition safe)
		var rowsAffected = await _dbContext.Tenant
			.Where(t =>
				t.Id == tenantId &&
				!t.IsDeleted &&
				t.IsSuspended &&
				t.Status == TenantStatus.Suspended)
			.ExecuteUpdateAsync(
				setters => setters
					.SetProperty(t => t.IsSuspended, false)
					.SetProperty(t => t.Status, TenantStatus.Active)
					.SetProperty(t => t.UpdatedAt, DateTime.UtcNow),
				cancellationToken);

		if (rowsAffected == 0) {
			// Race condition: someone else changed the state between our read and update
			return new ReactivateTenantResult(null, ReactivateTenantError.NotSuspended);
		}

		// Re-fetch tenant to return current state
		var updatedTenant = await (
			from t in _dbContext.Tenant.AsNoTracking()
			where t.Id == tenantId
			select t
		).FirstOrDefaultAsync(cancellationToken);

		return new ReactivateTenantResult(updatedTenant, null);
	}

	public async Task<Tenant?> GetTenantByIdForStaffAsync(
		Guid tenantId,
		CancellationToken cancellationToken = default
	) {
		// Staff can see suspended tenants (but not deleted ones)
		return await (
			from tenant in _dbContext.Tenant
			where tenant.Id == tenantId && !tenant.IsDeleted
			select tenant
		).FirstOrDefaultAsync(cancellationToken);
	}

	public async Task<int> CountTenantUsersAsync(
		Guid tenantId,
		CancellationToken cancellationToken = default
	) {
		var count =
			from ua in _dbContext.UserAccount
			where ua.TenantId == tenantId
				&& ua.Scope == AccountScope.Tenant
				&& !ua.IsDeleted
			select ua;

		return await count.CountAsync(cancellationToken);
	}

	public async Task<UpdateTenantResult> UpdateTenantAsync(
		Guid tenantId,
		UpdateTenantAsStaffArgs args,
		CancellationToken cancellationToken = default
	) {
		var tenant = await (
			from t in _dbContext.Tenant
			where t.Id == tenantId && !t.IsDeleted
			select t
		).FirstOrDefaultAsync(cancellationToken);

		if (tenant is null) {
			return new UpdateTenantResult(
				null, UpdateTenantError.NotFound
			);
		}

		// Validate MaxUsers against current user count
		if (args.MaxUsers is not null) {
			var currentUserCount = await CountTenantUsersAsync(
				tenantId, cancellationToken
			);
			if (args.MaxUsers.Value < currentUserCount) {
				return new UpdateTenantResult(
					null,
					UpdateTenantError.MaxUsersBelowCurrentCount
				);
			}
		}

		// Mutate tracked entity
		if (args.Name is not null) {
			tenant.Name = args.Name;
		}
		if (args.LogoUrl.IsPresent) {
			tenant.LogoUrl = args.LogoUrl.Value;
		}
		if (args.MaxUsers is not null) {
			tenant.MaxUsers = args.MaxUsers.Value;
		}
		tenant.UpdatedAt = DateTime.UtcNow;
		await _dbContext.SaveChangesAsync(cancellationToken);

		return new UpdateTenantResult(tenant, null);
	}

	public async Task<DeleteTenantResult> DeleteTenantAsync(
		Guid tenantId,
		CancellationToken cancellationToken = default
	) {
		var tenant = await (
			from t in _dbContext.Tenant.AsNoTracking()
			where t.Id == tenantId && !t.IsDeleted
			select t
		).FirstOrDefaultAsync(cancellationToken);

		if (tenant is null) {
			return new DeleteTenantResult(
				null, DeleteTenantError.NotFound
			);
		}

		if (!tenant.IsSuspended) {
			return new DeleteTenantResult(
				null, DeleteTenantError.NotSuspended
			);
		}

		// Atomic soft-delete with WHERE clause (race-condition safe)
		var rowsAffected = await _dbContext.Tenant
			.Where(t =>
				t.Id == tenantId
				&& !t.IsDeleted
				&& t.IsSuspended)
			.ExecuteUpdateAsync(
				setters => setters
					.SetProperty(t => t.IsDeleted, true)
					.SetProperty(
						t => t.DeletedAt, DateTime.UtcNow
					)
					.SetProperty(
						t => t.IsSuspended, false
					)
					.SetProperty(
						t => t.Status, TenantStatus.Archived
					)
					.SetProperty(
						t => t.UpdatedAt, DateTime.UtcNow
					),
				cancellationToken
			);

		if (rowsAffected == 0) {
			// Race condition: state changed between read and update
			return new DeleteTenantResult(
				null, DeleteTenantError.NotSuspended
			);
		}

		return new DeleteTenantResult(tenant, null);
	}
}
