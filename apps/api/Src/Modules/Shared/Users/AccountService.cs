using MainApi.Src.Data.DbContext;
using MainApi.Src.Lib;
using MainApi.Src.Modules.Shared.Tenants;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace MainApi.Src.Modules.Shared.Users;

public abstract record CreateStaffAccountResult {
	public sealed record Success(UserAccount Account) : CreateStaffAccountResult;
	public sealed record UserAlreadyStaffMember : CreateStaffAccountResult;
}

public abstract record CreateTenantAccountResult {
	public sealed record Success(UserAccount Account) : CreateTenantAccountResult;
	public sealed record UserAlreadyMemberOfTenant : CreateTenantAccountResult;
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
	Task<bool> IsUserStaffMemberAsync(Guid userId, CancellationToken cancellationToken = default);
	Task<bool> IsUserMemberOfTenantAsync(Guid userId, Guid tenantId, CancellationToken cancellationToken = default);
	Task<List<UserAccount>> FindUserTenantAccountsAsync(Guid userId, int? limit = null, CancellationToken cancellationToken = default);
	Task<UserTenantsResult> GetUserTenantsAsync(Guid userId, int limit = 5, CancellationToken cancellationToken = default);
	Task<CreateTenantAccountResult> CreateTenantAccountAsync(Guid userId, Guid tenantId, AccountLevel accountLevel, CancellationToken cancellationToken = default);
	Task AssignProfileToAccountAsync(Guid accountId, Guid profileId, CancellationToken cancellationToken = default);
}

public class AccountService : IAccountService {
	private readonly MainApiDbContext _dbContext;
	private readonly IOptions<AppSettings> _appSettings;

	public AccountService(MainApiDbContext dbContext, IOptions<AppSettings> appSettings) {
		_dbContext = dbContext;
		_appSettings = appSettings;
	}

	public async Task<CreateStaffAccountResult> CreateStaffAccountAsync(
		Guid userId,
		AccountLevel? accountLevel = null,
		CancellationToken cancellationToken = default
	) {
		// Check if user is already a staff member
		var isUserMemberOfStaff = await IsUserStaffMemberAsync(userId, cancellationToken);
		if (isUserMemberOfStaff) {
			return new CreateStaffAccountResult.UserAlreadyStaffMember();
		}

		var account = UserAccount.CreateStaffAccount(userId, accountLevel);

		var addedAccount = await _dbContext.UserAccount
			.AddAsync(account, cancellationToken);


		await _dbContext.SaveChangesAsync(cancellationToken);

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

	public async Task<bool> IsUserStaffMemberAsync(
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

	public async Task<List<UserAccount>> FindUserTenantAccountsAsync(
		Guid userId,
		int? limit = null,
		CancellationToken cancellationToken = default
	) {
		var effectiveLimit = limit ?? _appSettings.Value.PAGINATION_DEFAULT_LIMIT;

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
		// Check if user is already a member of this tenant
		var isUserMemberOfTenant = await IsUserMemberOfTenantAsync(userId, tenantId, cancellationToken);
		if (isUserMemberOfTenant) {
			return new CreateTenantAccountResult.UserAlreadyMemberOfTenant();
		}

		var account = UserAccount.CreateTenantAccount(userId, tenantId, accountLevel);
		account.ValidateAccountType();

		var addedAccount = await _dbContext.UserAccount
			.AddAsync(account, cancellationToken);

		await _dbContext.SaveChangesAsync(cancellationToken);

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
				&& t.Status == TenantStatus.Active && !t.IsSuspended
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
}
