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
	Task<CreateStaffAccountResult> CreateStaffAccountAsync(Guid userId, CancellationToken cancellationToken = default);
	Task<bool> IsUserStaffMemberAsync(Guid userId, CancellationToken cancellationToken = default);
	Task<bool> IsUserMemberOfTenantAsync(Guid userId, Guid tenantId, CancellationToken cancellationToken = default);
	Task<List<UserAccount>> GetUserAccountsAsync(Guid userId, CancellationToken cancellationToken = default);
	Task<User.User?> GetStaffMemberUserByIdAsync(Guid userId, CancellationToken cancellationToken = default);
}

public class AccountService : IAccountService {
	private readonly MainApiDbContext _dbContext;
	private readonly IOptions<AppSettings> _appSettings;
	private readonly Lazy<Task<Guid>> _staffTenantId;

	public AccountService(MainApiDbContext dbContext, IOptions<AppSettings> appSettings) {
		_dbContext = dbContext;
		_appSettings = appSettings;
		_staffTenantId = new Lazy<Task<Guid>>(async () => {
			var staffTenant = await _dbContext.Tenant
				.Where(x => x.Code == _appSettings.Value.STAFF_TENANT_CODE)
				.Select(x => x.Id)
				.FirstOrDefaultAsync();

			if (staffTenant == Guid.Empty) {
				throw new InvalidOperationException($"Staff tenant with code '{_appSettings.Value.STAFF_TENANT_CODE}' not found. This should be seeded in the database.");
			}

			return staffTenant;
		});
	}

	public async Task<CreateStaffAccountResult> CreateStaffAccountAsync(
		Guid userId,
		CancellationToken cancellationToken = default
	) {
		// Check if user is already a staff member
		var isUserMemberOfStaff = await IsUserStaffMemberAsync(userId, cancellationToken);
		if (isUserMemberOfStaff) {
			return new CreateStaffAccountResult.UserAlreadyStaffMember();
		}

		// Get the staff tenant ID (cached for performance)
		var staffTenantId = await _staffTenantId.Value.ConfigureAwait(false);

		var account = new UserAccount {
			UserId = userId,
			TenantId = staffTenantId,
			AccountType = AccountType.Staff,
			HierarchyLevel = AccountHierarchyLevel.User,
		};

		var addedAccount = await _dbContext.UserAccount
			.AddAsync(account, cancellationToken)
			.ConfigureAwait(false);
		await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

		return new CreateStaffAccountResult.Success(addedAccount.Entity);
	}

	public async Task<bool> IsUserStaffMemberAsync(
		Guid userId,
		CancellationToken cancellationToken = default
	) {
		// Check if user account exists where userId matches and tenant code is "staff"
		return await _dbContext.UserAccount
			.Join(_dbContext.Tenant, ua => ua.TenantId, t => t.Id, (ua, t) => new { ua.Id, ua.UserId, t.Code })
			.AnyAsync(x => x.UserId == userId && x.Code == _appSettings.Value.STAFF_TENANT_CODE, cancellationToken)
			.ConfigureAwait(false);
	}

	public async Task<bool> IsUserMemberOfTenantAsync(
		Guid userId,
		Guid tenantId,
		CancellationToken cancellationToken = default
	) {
		return await _dbContext.UserAccount
			.Where(x => x.UserId == userId && x.TenantId == tenantId)
			.AnyAsync(cancellationToken)
			.ConfigureAwait(false);
	}

	public async Task<List<UserAccount>> GetUserAccountsAsync(
		Guid userId,
		CancellationToken cancellationToken = default
	) {
		return await _dbContext.UserAccount
			.Where(x => x.UserId == userId)
			.ToListAsync(cancellationToken)
			.ConfigureAwait(false);
	}

	public async Task<User.User?> GetStaffMemberUserByIdAsync(
		Guid userId,
		CancellationToken cancellationToken = default
	) {
		// Get the user record where userId matches and tenant code is "staff"
		return await _dbContext.UserAccount
			.Where(ua => ua.UserId == userId && ua.Tenant.Code == _appSettings.Value.STAFF_TENANT_CODE)
			.Select(ua => ua.User)
			.FirstOrDefaultAsync(cancellationToken)
			.ConfigureAwait(false);
	}
}
