using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Modules.Profiles.Entities;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Modules.Users.Services;

public sealed record TenantUserCompanyIdsArgs(
	Guid UserId,
	IReadOnlyCollection<Guid> TenantIds
);

public sealed record AssignTenantUserCompaniesArgs(
	Guid UserId,
	IReadOnlyCollection<Guid> TenantIds,
	AccountLevel Level
);

public sealed record TenantUserCompanyBulkActionFailedItem(
	Guid TenantId,
	string Error
);

public sealed record TenantUserCompanyBulkActionResult(
	int SucceededCount,
	int FailedCount,
	List<TenantUserCompanyBulkActionFailedItem> FailedItems
);


public interface ITenantUserCompanyMembershipService {
	Task<TenantUserCompanyBulkActionResult> AssignTenantUserCompaniesForStaffAsync(
		AssignTenantUserCompaniesArgs args,
		CancellationToken cancellationToken = default
	);
	Task<TenantUserCompanyBulkActionResult> BulkRemoveTenantUserCompaniesForStaffAsync(
		TenantUserCompanyIdsArgs args,
		CancellationToken cancellationToken = default
	);
	Task<TenantUserCompanyBulkActionResult> BulkSuspendTenantUserCompaniesForStaffAsync(
		TenantUserCompanyIdsArgs args,
		CancellationToken cancellationToken = default
	);
	Task<TenantUserCompanyBulkActionResult>
	BulkReactivateTenantUserCompaniesForStaffAsync(
		TenantUserCompanyIdsArgs args,
		CancellationToken cancellationToken = default
	);
}

[Service(ServiceLifetime.Scoped)]
public class TenantUserCompanyMembershipService : ITenantUserCompanyMembershipService {

	private readonly AppDbContext _dbContext;

	public TenantUserCompanyMembershipService(
		AppDbContext dbContext,
		ILogger<TenantUserCompanyMembershipService> logger
	) {
		_dbContext = dbContext;
		_ = logger;
	}

	public async Task<TenantUserCompanyBulkActionResult>
	AssignTenantUserCompaniesForStaffAsync(
		AssignTenantUserCompaniesArgs args,
		CancellationToken cancellationToken = default
	) {
		var tenantIds = args.TenantIds.Distinct().ToList();
		var failedItems = new List<TenantUserCompanyBulkActionFailedItem>();
		var succeededCount = 0;

		var identityError = await GetTenantUserIdentityAssignmentErrorAsync(
			args.UserId,
			cancellationToken
		);

		if (identityError is not null) {
			return BuildTenantUserCompanyBulkFailure(
				tenantIds,
				identityError
			);
		}

		foreach (var tenantId in tenantIds) {
			var tenantExists = await (
				from tenant in _dbContext.Tenant.AsNoTracking()
				where tenant.Id == tenantId
					&& !tenant.IsDeleted
				select tenant.Id
			).AnyAsync(cancellationToken);

			if (!tenantExists) {
				failedItems.Add(
					new TenantUserCompanyBulkActionFailedItem(
						tenantId,
						"Tenant not found"
					)
				);
				continue;
			}

			var existingAccount = await (
				from account in _dbContext.UserAccount.IgnoreQueryFilters()
				where account.UserId == args.UserId
					&& account.TenantId == tenantId
					&& account.Scope == AccountScope.Tenant
					&& account.ProjectId == null
				select account
			).FirstOrDefaultAsync(cancellationToken);

			if (existingAccount is not null && !existingAccount.IsDeleted) {
				failedItems.Add(
					new TenantUserCompanyBulkActionFailedItem(
						tenantId,
						"Already assigned"
					)
				);
				continue;
			}

			await using var transaction =
				await _dbContext.Database.BeginTransactionAsync(
					cancellationToken
				);

			var tenantAccount = existingAccount;
			var now = DateTime.UtcNow;
			var isRestoringRemovedAccount = tenantAccount is not null;
			try {
				// TenantMembershipLockOrder step 1: this path creates or restores a membership
				// for an identity that already exists, so it can widen the tenant set another
				// operation is guarding for that identity — specifically global suspension,
				// whose last-admin guard covers only the tenants it enumerated. Taking the
				// identity mutex orders this "add an admin" against that "reduce the active
				// admin count" instead of letting it slip in behind the enumeration.
				await TenantMembershipLockOrder.LockUserIdentityRowsAsync(
					_dbContext,
					[args.UserId],
					cancellationToken
				);

				if (tenantAccount is null) {
					tenantAccount = UserAccount.CreateTenantAccount(
						args.UserId,
						tenantId,
						args.Level
					);
					tenantAccount.ValidateAccountType();
					await _dbContext.UserAccount.AddAsync(
						tenantAccount,
						cancellationToken
					);
				} else {
					tenantAccount.IsDeleted = false;
					tenantAccount.DeletedAt = null;
					tenantAccount.Status = AccountStatus.Active;
					tenantAccount.Level = args.Level;
					tenantAccount.UpdatedAt = now;
					tenantAccount.ValidateAccountType();
				}

				await _dbContext.SaveChangesAsync(cancellationToken);
				if (isRestoringRemovedAccount) {
					// Removed memberships may still have old profile links. Purge
					// them before adding the tenant default profile so reassignment
					// cannot resurrect stale permissions.
					await TenantUserMembershipOperations
						.RemoveUserAccountProfileLinksAsync(
						_dbContext,
						tenantAccount.GetRequiredId(),
						cancellationToken
					);
					await _dbContext.SaveChangesAsync(cancellationToken);
				}

				await AssignDefaultProfileToTenantAccountAsync(
					tenantAccount,
					tenantId,
					cancellationToken
				);
				await transaction.CommitAsync(cancellationToken);
			} catch {
				await transaction.RollbackAsync(cancellationToken);
				throw;
			}

			succeededCount++;
		}

		return new TenantUserCompanyBulkActionResult(
			SucceededCount: succeededCount,
			FailedCount: failedItems.Count,
			FailedItems: failedItems
		);
	}

	public async Task<TenantUserCompanyBulkActionResult>
	BulkRemoveTenantUserCompaniesForStaffAsync(
		TenantUserCompanyIdsArgs args,
		CancellationToken cancellationToken = default
	) {
		var failedItems = new List<TenantUserCompanyBulkActionFailedItem>();
		var succeededCount = 0;

		foreach (var tenantId in args.TenantIds.Distinct()) {
			var result = await TenantUserMembershipOperations.RemoveUserFromTenantAsync(
				_dbContext,
				tenantId,
				args.UserId,
				cancellationToken
			);

			if (result is RemoveUserFromTenantResult.Success) {
				succeededCount++;
				continue;
			}

			failedItems.Add(
				new TenantUserCompanyBulkActionFailedItem(
					tenantId,
					GetRemoveTenantUserCompanyError(result)
				)
			);
		}

		return new TenantUserCompanyBulkActionResult(
			SucceededCount: succeededCount,
			FailedCount: failedItems.Count,
			FailedItems: failedItems
		);
	}

	public async Task<TenantUserCompanyBulkActionResult>
	BulkSuspendTenantUserCompaniesForStaffAsync(
		TenantUserCompanyIdsArgs args,
		CancellationToken cancellationToken = default
	) {
		var failedItems = new List<TenantUserCompanyBulkActionFailedItem>();
		var succeededCount = 0;

		foreach (var tenantId in args.TenantIds.Distinct()) {
			var result = await TenantUserMembershipOperations.SuspendTenantUserAsync(
				_dbContext,
				tenantId,
				args.UserId,
				cancellationToken
			);

			if (result is SuspendTenantUserResult.Success) {
				succeededCount++;
				continue;
			}

			failedItems.Add(
				new TenantUserCompanyBulkActionFailedItem(
					tenantId,
					GetSuspendTenantUserCompanyError(result)
				)
			);
		}

		return new TenantUserCompanyBulkActionResult(
			SucceededCount: succeededCount,
			FailedCount: failedItems.Count,
			FailedItems: failedItems
		);
	}

	public async Task<TenantUserCompanyBulkActionResult>
	BulkReactivateTenantUserCompaniesForStaffAsync(
		TenantUserCompanyIdsArgs args,
		CancellationToken cancellationToken = default
	) {
		var failedItems = new List<TenantUserCompanyBulkActionFailedItem>();
		var succeededCount = 0;

		foreach (var tenantId in args.TenantIds.Distinct()) {
			var result = await TenantUserMembershipOperations.ReactivateTenantUserAsync(
				_dbContext,
				tenantId,
				args.UserId,
				cancellationToken
			);

			if (result is ReactivateTenantUserResult.Success) {
				succeededCount++;
				continue;
			}

			failedItems.Add(
				new TenantUserCompanyBulkActionFailedItem(
					tenantId,
					GetReactivateTenantUserCompanyError(result)
				)
			);
		}

		return new TenantUserCompanyBulkActionResult(
			SucceededCount: succeededCount,
			FailedCount: failedItems.Count,
			FailedItems: failedItems
		);
	}

	private async Task<string?> GetTenantUserIdentityAssignmentErrorAsync(
		Guid userId,
		CancellationToken cancellationToken
	) {
		var userExists = await (
			from user in _dbContext.User.AsNoTracking()
			where user.Id == userId
				&& !user.IsDeleted
			select user.Id
		).AnyAsync(cancellationToken);

		if (!userExists) {
			return "Tenant user not found";
		}

		var hasTenantIdentity = await (
			from account in _dbContext.UserAccount.IgnoreQueryFilters()
			where account.UserId == userId
				&& account.Scope == AccountScope.Tenant
			select account.Id
		).AnyAsync(cancellationToken);

		if (!hasTenantIdentity) {
			return "Tenant user not found";
		}

		var hasStaffAccount = await (
			from account in _dbContext.UserAccount.AsNoTracking()
			where account.UserId == userId
				&& account.Scope == AccountScope.Staff
				&& !account.IsDeleted
			select account.Id
		).AnyAsync(cancellationToken);

		if (hasStaffAccount) {
			return "User has a staff account";
		}

		return null;
	}

	private static TenantUserCompanyBulkActionResult
	BuildTenantUserCompanyBulkFailure(
		IReadOnlyCollection<Guid> tenantIds,
		string error
	) {
		var failedItems = tenantIds
			.Select(tenantId => new TenantUserCompanyBulkActionFailedItem(
				tenantId,
				error
			))
			.ToList();

		return new TenantUserCompanyBulkActionResult(
			SucceededCount: 0,
			FailedCount: failedItems.Count,
			FailedItems: failedItems
		);
	}

	private async Task AssignDefaultProfileToTenantAccountAsync(
		UserAccount account,
		Guid tenantId,
		CancellationToken cancellationToken
	) {
		if (account.Level == AccountLevel.Admin) {
			return;
		}

		var accountId = account.GetRequiredId();
		var defaultProfile = await GetOrCreateDefaultTenantProfileAsync(
			tenantId,
			cancellationToken
		);
		var profileId = defaultProfile.GetRequiredId();

		var linkExists = await (
			from link in _dbContext.UserAccountProfile
			where link.UserAccountId == accountId
				&& link.ProfileId == profileId
			select link
		).AnyAsync(cancellationToken);

		if (linkExists) {
			return;
		}

		await _dbContext.UserAccountProfile.AddAsync(
			new UserAccountProfile {
				UserAccountId = accountId,
				ProfileId = profileId,
			},
			cancellationToken
		);
		await _dbContext.SaveChangesAsync(cancellationToken);
	}

	private async Task<Profile> GetOrCreateDefaultTenantProfileAsync(
		Guid tenantId,
		CancellationToken cancellationToken
	) {
		var defaultProfile = await (
			from profile in _dbContext.Profile
			where profile.Scope == ProfileScope.Tenant
				&& profile.TenantId == tenantId
				&& profile.IsDefault
				&& !profile.IsDeleted
			select profile
		).FirstOrDefaultAsync(cancellationToken);

		if (defaultProfile is not null) {
			return defaultProfile;
		}

		defaultProfile = Profile.CreateTenantProfile(
			tenantId,
			name: "Default profile",
			description: "Default profile with no permissions",
			isDefault: true
		);

		var savedProfile = await _dbContext.Profile.AddAsync(
			defaultProfile,
			cancellationToken
		);
		await _dbContext.SaveChangesAsync(cancellationToken);

		return savedProfile.Entity;
	}

	private static string GetRemoveTenantUserCompanyError(
		RemoveUserFromTenantResult result
	) {
		return result switch {
			RemoveUserFromTenantResult.NotFound => "User not found in tenant",
			RemoveUserFromTenantResult.CannotRemoveLastAdmin =>
				"Cannot remove the last admin from the tenant",
			_ => "Failed to remove user from tenant",
		};
	}

	private static string GetSuspendTenantUserCompanyError(
		SuspendTenantUserResult result
	) {
		return result switch {
			SuspendTenantUserResult.NotFound => "User not found in tenant",
			SuspendTenantUserResult.AlreadySuspended => "Already suspended",
			SuspendTenantUserResult.CannotSuspendLastAdmin =>
				"Cannot suspend the last admin from the tenant",
			_ => "Failed to suspend user in tenant",
		};
	}

	private static string GetReactivateTenantUserCompanyError(
		ReactivateTenantUserResult result
	) {
		return result switch {
			ReactivateTenantUserResult.NotFound => "User not found in tenant",
			ReactivateTenantUserResult.NotSuspended => "User is not suspended",
			_ => "Failed to reactivate user in tenant",
		};
	}

}
