using MainApi.Src.Data.DbContext;
using MainApi.Src.Lib;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace MainApi.Src.Features.Common.Account;

public abstract record CreateStaffAccountResult {
	public sealed record Success(UserAccount Account) : CreateStaffAccountResult;
	public sealed record UserAlreadyStaffMember : CreateStaffAccountResult;
}

public interface IAccountService {
	Task<CreateStaffAccountResult> CreateStaffAccountAsync(Guid userId, AccountLevel? accountLevel = null, CancellationToken cancellationToken = default);
	Task<UserAccount?> GetUserStaffAccountAsync(Guid userId, CancellationToken cancellationToken = default);
	Task<bool> IsUserStaffMemberAsync(Guid userId, CancellationToken cancellationToken = default);
	Task<bool> IsUserMemberOfTenantAsync(Guid userId, Guid tenantId, CancellationToken cancellationToken = default);
	Task<List<UserAccount>> FindUserTenantAccountsAsync(Guid userId, int? limit = null, CancellationToken cancellationToken = default);
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
}
