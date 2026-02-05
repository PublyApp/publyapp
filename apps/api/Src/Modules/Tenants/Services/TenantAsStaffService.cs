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
}
