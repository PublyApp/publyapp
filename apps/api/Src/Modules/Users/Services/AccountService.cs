using MainApi.Src.Data.DbContext;
using MainApi.Src.Lib;
using MainApi.Src.Modules.Tenants.Entities;
using MainApi.Src.Modules.Users.Entities;

using Microsoft.EntityFrameworkCore;

namespace MainApi.Src.Modules.Users.Services;

public abstract record CreateStaffAccountResult {
	public sealed record Success(UserAccount Account) : CreateStaffAccountResult;
	public sealed record UserAlreadyStaffUser : CreateStaffAccountResult;
	public sealed record UserHasTenantOrProjectAccounts : CreateStaffAccountResult;
}

public abstract record CreateTenantAccountResult {
	public sealed record Success(UserAccount Account) : CreateTenantAccountResult;
	public sealed record UserAlreadyMemberOfTenant : CreateTenantAccountResult;
	public sealed record UserHasStaffAccount : CreateTenantAccountResult;
}

public record UserTenantInfo {
	public Guid Id { get; init; }
	public string Name { get; init; } = string.Empty;
	public string Code { get; init; } = string.Empty;
	public string? LogoUrl { get; init; }
}

public record UserTenantsResult {
	public List<UserTenantInfo> Tenants { get; init; } = [];
	public int TotalCount { get; init; }
}

public interface IAccountService {
	Task<CreateStaffAccountResult> CreateStaffAccountAsync(Guid userId, AccountLevel? accountLevel = null, CancellationToken cancellationToken = default);
	Task<UserAccount?> GetUserStaffAccountAsync(Guid userId, CancellationToken cancellationToken = default);
	Task<UserAccount?> GetUserTenantAccountAsync(Guid userId, Guid tenantId, CancellationToken cancellationToken = default);
	Task<bool> IsUserStaffUserAsync(Guid userId, CancellationToken cancellationToken = default);
	Task<bool> IsUserMemberOfTenantAsync(Guid userId, Guid tenantId, CancellationToken cancellationToken = default);
	Task<bool> IsUserMemberOfActiveTenantAsync(Guid userId, Guid tenantId, CancellationToken cancellationToken = default);
	Task<bool> HasStaffAccountAsync(Guid userId, CancellationToken cancellationToken = default);
	Task<bool> HasTenantAccountAsync(Guid userId, Guid tenantId, CancellationToken cancellationToken = default);
	Task<bool> HasTenantOrProjectAccountsAsync(Guid userId, CancellationToken cancellationToken = default);
	Task<bool> HasStaffAccountByEmailAsync(string email, CancellationToken cancellationToken = default);
	Task<bool> HasTenantOrProjectAccountsByEmailAsync(string email, CancellationToken cancellationToken = default);
	Task<List<string>> GetEmailsWithTenantOrProjectAccountsAsync(List<string> emails, CancellationToken cancellationToken = default);
	Task<List<string>> GetEmailsWithStaffAccountsAsync(List<string> emails, CancellationToken cancellationToken = default);
	Task<List<UserAccount>> FindUserTenantAccountsAsync(Guid userId, int? limit = null, CancellationToken cancellationToken = default);
	Task<UserTenantsResult> GetUserTenantsAsync(Guid userId, int limit = 5, CancellationToken cancellationToken = default);
	Task<CreateTenantAccountResult> CreateTenantAccountAsync(Guid userId, Guid tenantId, AccountLevel accountLevel, CancellationToken cancellationToken = default);
	Task AssignProfileToAccountAsync(Guid accountId, Guid profileId, CancellationToken cancellationToken = default);
}

public class AccountService : IAccountService {
	private readonly MainApiDbContext _dbContext;

	public AccountService(MainApiDbContext dbContext) {
		_dbContext = dbContext;
	}

	public async Task<CreateStaffAccountResult> CreateStaffAccountAsync(
		Guid userId,
		AccountLevel? accountLevel = null,
		CancellationToken cancellationToken = default
	) {
		// Check if user already has a staff account (existence-based, not active-only)
		// This aligns with unique constraint and prevents 500s from duplicate insert attempts
		var hasStaffAccount = await HasStaffAccountAsync(userId, cancellationToken);
		if (hasStaffAccount) {
			return new CreateStaffAccountResult.UserAlreadyStaffUser();
		}

		// Business rule: staff and tenant/project accounts are mutually exclusive
		var hasTenantOrProjectAccounts = await HasTenantOrProjectAccountsAsync(userId, cancellationToken);
		if (hasTenantOrProjectAccounts) {
			return new CreateStaffAccountResult.UserHasTenantOrProjectAccounts();
		}

		var account = UserAccount.CreateStaffAccount(userId, accountLevel);

		var addedAccount = await _dbContext.UserAccount
			.AddAsync(account, cancellationToken);

		try {
			await _dbContext.SaveChangesAsync(cancellationToken);
		} catch (DbUpdateException ex) when (IsUniqueConstraintViolation(ex)) {
			// Race condition: another request created the account between our check and insert
			// Detach the failed entity and return appropriate result
			_dbContext.Entry(addedAccount.Entity).State = EntityState.Detached;
			return new CreateStaffAccountResult.UserAlreadyStaffUser();
		}

		return new CreateStaffAccountResult.Success(addedAccount.Entity);
	}

	public async Task<UserAccount?> GetUserStaffAccountAsync(
		Guid userId,
		CancellationToken cancellationToken = default
	) {
		var query =
			from ua in _dbContext.UserAccount
			where ua.UserId == userId
			&& ua.Scope == AccountScope.Staff
			&& !ua.IsDeleted && !ua.IsSuspended
			select ua;

		return await query.FirstOrDefaultAsync(cancellationToken);
	}

	public async Task<UserAccount?> GetUserTenantAccountAsync(
		Guid userId,
		Guid tenantId,
		CancellationToken cancellationToken = default
	) {
		var query =
			from ua in _dbContext.UserAccount
			where ua.UserId == userId
			&& ua.TenantId == tenantId
			&& ua.Scope == AccountScope.Tenant
			&& !ua.IsDeleted && !ua.IsSuspended
			select ua;

		return await query.FirstOrDefaultAsync(cancellationToken);
	}

	public async Task<bool> IsUserStaffUserAsync(
		Guid userId,
		CancellationToken cancellationToken = default
	) {
		var query =
			from ua in _dbContext.UserAccount
			where ua.UserId == userId
			&& ua.Scope == AccountScope.Staff
			&& !ua.IsDeleted && !ua.IsSuspended
			select ua;

		return await query.AnyAsync(cancellationToken);
	}

	public async Task<bool> IsUserMemberOfTenantAsync(
		Guid userId,
		Guid tenantId,
		CancellationToken cancellationToken = default
	) {
		var query =
			from ua in _dbContext.UserAccount
			where ua.UserId == userId
			&& ua.TenantId == tenantId
			&& ua.Scope == AccountScope.Tenant
			&& !ua.IsDeleted && !ua.IsSuspended
			select ua;

		return await query.AnyAsync(cancellationToken);
	}

	public async Task<bool> IsUserMemberOfActiveTenantAsync(
		Guid userId,
		Guid tenantId,
		CancellationToken cancellationToken = default
	) {
		// Same filters as GetUserTenantsAsync for consistency:
		// Checks both account status (not deleted, not suspended)
		// AND tenant status (Active, not suspended, not deleted)
		var query =
			from ua in _dbContext.UserAccount
			join t in _dbContext.Tenant on ua.TenantId equals t.Id
			where ua.UserId == userId
				&& ua.TenantId == tenantId
				&& ua.Scope == AccountScope.Tenant
				&& !ua.IsDeleted && !ua.IsSuspended
				&& !t.IsDeleted && t.Status == TenantStatus.Active && !t.IsSuspended
			select ua;

		return await query.AnyAsync(cancellationToken);
	}

	public async Task<bool> HasStaffAccountAsync(
		Guid userId,
		CancellationToken cancellationToken = default
	) {
		// Note: IsSuspended is intentionally NOT checked here.
		// Suspended accounts still count for mutual exclusivity (identity conflict).
		return await (
			from ua in _dbContext.UserAccount
			where ua.UserId == userId
				&& ua.Scope == AccountScope.Staff
				&& !ua.IsDeleted
			select ua
		).AnyAsync(cancellationToken);
	}

	public async Task<bool> HasTenantAccountAsync(
		Guid userId,
		Guid tenantId,
		CancellationToken cancellationToken = default
	) {
		// Note: IsSuspended is intentionally NOT checked here.
		// This is existence-based to align with unique constraint and prevent duplicate insert attempts.
		return await (
			from ua in _dbContext.UserAccount
			where ua.UserId == userId
				&& ua.TenantId == tenantId
				&& ua.Scope == AccountScope.Tenant
				&& !ua.IsDeleted
			select ua
		).AnyAsync(cancellationToken);
	}

	public async Task<bool> HasTenantOrProjectAccountsAsync(
		Guid userId,
		CancellationToken cancellationToken = default
	) {
		// Note: IsSuspended is intentionally NOT checked here.
		// Suspended accounts still count for mutual exclusivity (identity conflict).
		return await (
			from ua in _dbContext.UserAccount
			where ua.UserId == userId
				&& (ua.Scope == AccountScope.Tenant || ua.Scope == AccountScope.Project)
				&& !ua.IsDeleted
			select ua
		).AnyAsync(cancellationToken);
	}

	public async Task<bool> HasStaffAccountByEmailAsync(
		string email,
		CancellationToken cancellationToken = default
	) {
		// Note: IsSuspended is intentionally NOT checked here.
		// Suspended accounts still count for mutual exclusivity (identity conflict).
		var normalizedEmail = email.ToLowerInvariant();

		return await (
			from u in _dbContext.User
			join ua in _dbContext.UserAccount on u.Id equals ua.UserId
			where u.Email == normalizedEmail
				&& ua.Scope == AccountScope.Staff
				&& !u.IsDeleted
				&& !ua.IsDeleted
			select ua
		).AnyAsync(cancellationToken);
	}

	public async Task<bool> HasTenantOrProjectAccountsByEmailAsync(
		string email,
		CancellationToken cancellationToken = default
	) {
		// Note: IsSuspended is intentionally NOT checked here.
		// Suspended accounts still count for mutual exclusivity (identity conflict).
		var normalizedEmail = email.ToLowerInvariant();

		return await (
			from u in _dbContext.User
			join ua in _dbContext.UserAccount on u.Id equals ua.UserId
			where u.Email == normalizedEmail
				&& (ua.Scope == AccountScope.Tenant || ua.Scope == AccountScope.Project)
				&& !u.IsDeleted
				&& !ua.IsDeleted
			select ua
		).AnyAsync(cancellationToken);
	}

	public async Task<List<string>> GetEmailsWithTenantOrProjectAccountsAsync(
		List<string> emails,
		CancellationToken cancellationToken = default
	) {
		// Note: IsSuspended is intentionally NOT checked here.
		// Suspended accounts still count for mutual exclusivity (identity conflict).
		if (emails.Count == 0) return [];

		var normalizedEmails = emails.Select(e => e.ToLowerInvariant()).ToList();

		return await (
			from u in _dbContext.User
			join ua in _dbContext.UserAccount on u.Id equals ua.UserId
			where normalizedEmails.Contains(u.Email)
				&& (ua.Scope == AccountScope.Tenant || ua.Scope == AccountScope.Project)
				&& !u.IsDeleted
				&& !ua.IsDeleted
			select u.Email
		).Distinct().ToListAsync(cancellationToken);
	}

	public async Task<List<string>> GetEmailsWithStaffAccountsAsync(
		List<string> emails,
		CancellationToken cancellationToken = default
	) {
		// Note: IsSuspended is intentionally NOT checked here.
		// Suspended accounts still count for mutual exclusivity (identity conflict).
		if (emails.Count == 0) return [];

		var normalizedEmails = emails.Select(e => e.ToLowerInvariant()).ToList();

		return await (
			from u in _dbContext.User
			join ua in _dbContext.UserAccount on u.Id equals ua.UserId
			where normalizedEmails.Contains(u.Email)
				&& ua.Scope == AccountScope.Staff
				&& !u.IsDeleted
				&& !ua.IsDeleted
			select u.Email
		).Distinct().ToListAsync(cancellationToken);
	}

	public async Task<List<UserAccount>> FindUserTenantAccountsAsync(
		Guid userId,
		int? limit = null,
		CancellationToken cancellationToken = default
	) {
		var effectiveLimit = limit ?? AppEnvironment.Instance.PAGINATION_DEFAULT_LIMIT;

		var query =
			from ua in _dbContext.UserAccount
			where ua.UserId == userId
			&& ua.Scope == AccountScope.Tenant
			&& ua.TenantId != null
			&& !ua.IsDeleted && !ua.IsSuspended
			select ua;

		return await query.Take(effectiveLimit).ToListAsync(cancellationToken);
	}

	public async Task<CreateTenantAccountResult> CreateTenantAccountAsync(
		Guid userId,
		Guid tenantId,
		AccountLevel accountLevel,
		CancellationToken cancellationToken = default
	) {
		// Check if user already has a tenant account for this tenant (existence-based, not active-only)
		// This aligns with unique constraint and prevents 500s from duplicate insert attempts
		var hasTenantAccount = await HasTenantAccountAsync(userId, tenantId, cancellationToken);
		if (hasTenantAccount) {
			return new CreateTenantAccountResult.UserAlreadyMemberOfTenant();
		}

		// Business rule: staff and tenant/project accounts are mutually exclusive
		var hasStaffAccount = await HasStaffAccountAsync(userId, cancellationToken);
		if (hasStaffAccount) {
			return new CreateTenantAccountResult.UserHasStaffAccount();
		}

		var account = UserAccount.CreateTenantAccount(userId, tenantId, accountLevel);
		account.ValidateAccountType();

		var addedAccount = await _dbContext.UserAccount
			.AddAsync(account, cancellationToken);

		try {
			await _dbContext.SaveChangesAsync(cancellationToken);
		} catch (DbUpdateException ex) when (IsUniqueConstraintViolation(ex)) {
			// Race condition: another request created the account between our check and insert
			// Detach the failed entity and return appropriate result
			_dbContext.Entry(addedAccount.Entity).State = EntityState.Detached;
			return new CreateTenantAccountResult.UserAlreadyMemberOfTenant();
		}

		return new CreateTenantAccountResult.Success(addedAccount.Entity);
	}

	public async Task AssignProfileToAccountAsync(
		Guid accountId,
		Guid profileId,
		CancellationToken cancellationToken = default
	) {
		// Check if assignment already exists
		var existingAssignment = await (
			from uap in _dbContext.UserAccountProfile
			where uap.UserAccountId == accountId
			&& uap.ProfileId == profileId
			select uap
		).FirstOrDefaultAsync(cancellationToken);

		if (existingAssignment is not null) {
			// Already assigned, no-op
			return;
		}

		var userAccountProfile = new UserAccountProfile {
			UserAccountId = accountId,
			ProfileId = profileId
		};

		await _dbContext.UserAccountProfile.AddAsync(userAccountProfile, cancellationToken);
		await _dbContext.SaveChangesAsync(cancellationToken);
	}

	public async Task<UserTenantsResult> GetUserTenantsAsync(
		Guid userId,
		int limit = 5,
		CancellationToken cancellationToken = default
	) {
		var baseQuery =
			from ua in _dbContext.UserAccount
			join t in _dbContext.Tenant on ua.TenantId equals t.Id
			where ua.UserId == userId
				&& ua.Scope == AccountScope.Tenant
				&& ua.TenantId != null
				&& !ua.IsDeleted && !ua.IsSuspended
				&& !t.IsDeleted && t.Status == TenantStatus.Active && !t.IsSuspended
			select new { ua, t };

		var totalCount = await baseQuery.CountAsync(cancellationToken);

		var tenants = await baseQuery
			.OrderBy(x => x.t.Name)
			.Take(limit)
			.Select(x => new UserTenantInfo {
				Id = x.t.Id!.Value,
				Name = x.t.Name,
				Code = x.t.Code,
				LogoUrl = x.t.LogoUrl
			})
			.ToListAsync(cancellationToken);

		return new UserTenantsResult {
			Tenants = tenants,
			TotalCount = totalCount
		};
	}

	/// <summary>
	/// Detects unique constraint violations on user_accounts table.
	/// PostgreSQL error code 23505 = unique_violation.
	/// Checks table name to avoid masking unrelated unique violations.
	/// </summary>
	private static bool IsUniqueConstraintViolation(DbUpdateException ex) {
		// Check for PostgreSQL unique constraint violation (23505) on user_accounts table
		if (ex.InnerException is Npgsql.PostgresException pgEx) {
			return pgEx.SqlState == "23505"
				&& pgEx.TableName is not null
				&& pgEx.TableName.Equals("user_accounts", StringComparison.OrdinalIgnoreCase);
		}
		return false;
	}
}
