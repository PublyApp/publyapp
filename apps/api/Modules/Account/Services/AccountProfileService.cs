using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Modules.Account.Handlers.Tenant;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Modules.Account.Services;

public record UpdateAccountProfileArgs(
	Guid UserId,
	Guid TenantId,
	PatchField<string?> FirstName,
	PatchField<string?> LastName,
	PatchField<string?> AvatarUrl
);

public interface IAccountProfileService {
	Task<AccountProfileResult?> GetAccountProfileAsync(
		Guid userId,
		Guid tenantId,
		CancellationToken cancellationToken = default
	);
	Task<AccountProfileResult?> UpdateAccountProfileAsync(
		UpdateAccountProfileArgs args,
		CancellationToken cancellationToken = default
	);
}

[Service(ServiceLifetime.Scoped)]
public class AccountProfileService : IAccountProfileService {
	private readonly AppDbContext _dbContext;

	public AccountProfileService(AppDbContext dbContext) {
		_dbContext = dbContext;
	}

	public async Task<AccountProfileResult?> GetAccountProfileAsync(
		Guid userId,
		Guid tenantId,
		CancellationToken cancellationToken = default
	) {
		var user = await FindTenantAccountUserAsync(
			userId,
			tenantId,
			cancellationToken
		);

		return user is null ? null : ToResult(user);
	}

	public async Task<AccountProfileResult?> UpdateAccountProfileAsync(
		UpdateAccountProfileArgs args,
		CancellationToken cancellationToken = default
	) {
		var user = await FindTenantAccountUserAsync(
			args.UserId,
			args.TenantId,
			cancellationToken
		);

		if (user is null) {
			return null;
		}

		if (args.FirstName.IsPresent) {
			user.FirstName = args.FirstName.Value;
		}

		if (args.LastName.IsPresent) {
			user.LastName = args.LastName.Value;
		}

		if (args.AvatarUrl.IsPresent) {
			user.AvatarUrl = args.AvatarUrl.Value;
		}

		user.UpdatedAt = DateTime.UtcNow;

		await _dbContext.SaveChangesAsync(cancellationToken);

		return ToResult(user);
	}

	// Same active-tenant-membership predicate as IAccountService
	// .GetUserTenantAccountAsync — the TenantAuthFilter already ran it, so a
	// null here is defense-in-depth (e.g. the account was removed between the
	// filter and this read) rather than the expected outcome.
	private async Task<User?> FindTenantAccountUserAsync(
		Guid userId,
		Guid tenantId,
		CancellationToken cancellationToken
	) {
		return await (
			from ua in _dbContext.UserAccount
			where ua.UserId == userId
				&& ua.TenantId == tenantId
				&& ua.Scope == AccountScope.Tenant
				&& !ua.IsDeleted
				&& ua.Status != AccountStatus.Suspended
				&& !ua.User.IsDeleted
				&& ua.User.Status != UserStatus.Suspended
			select ua.User
		).FirstOrDefaultAsync(cancellationToken);
	}

	private static AccountProfileResult ToResult(User user) {
		return new AccountProfileResult {
			Id = user.GetRequiredId(),
			Email = user.Email,
			FirstName = user.FirstName,
			LastName = user.LastName,
			AvatarUrl = user.AvatarUrl,
		};
	}
}
