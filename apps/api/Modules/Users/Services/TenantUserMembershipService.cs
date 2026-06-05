using System.Data;

using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Modules.Profiles.Entities;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Modules.Users.Services;

public abstract record RemoveUserFromTenantResult {
	public sealed record Success() : RemoveUserFromTenantResult;
	public sealed record NotFound() : RemoveUserFromTenantResult;
	public sealed record CannotRemoveLastAdmin() : RemoveUserFromTenantResult;
}

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


public class UpdateTenantUserDocument {
	public PatchField<string?> FirstName { get; set; } = PatchField<string?>.Absent();
	public PatchField<string?> LastName { get; set; } = PatchField<string?>.Absent();
	public PatchField<string?> AvatarUrl { get; set; } = PatchField<string?>.Absent();
	public string? Level { get; set; }
}

public abstract record UpdateTenantUserResult {
	public sealed record Success(
		TenantUserData UserData
	) : UpdateTenantUserResult;
	public sealed record NotFound() : UpdateTenantUserResult;
	public sealed record CannotDemoteLastAdmin() : UpdateTenantUserResult;
}

public abstract record SuspendTenantUserResult {
	public sealed record Success(TenantUserData UserData) : SuspendTenantUserResult;
	public sealed record NotFound() : SuspendTenantUserResult;
	public sealed record AlreadySuspended() : SuspendTenantUserResult;
	public sealed record CannotSuspendLastAdmin() : SuspendTenantUserResult;
}

public abstract record ReactivateTenantUserResult {
	public sealed record Success(TenantUserData UserData) : ReactivateTenantUserResult;
	public sealed record NotFound() : ReactivateTenantUserResult;
	public sealed record NotSuspended() : ReactivateTenantUserResult;
}

public interface ITenantUserMembershipService {
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
	Task<RemoveUserFromTenantResult> RemoveUserFromTenantAsync(
		Guid tenantId,
		Guid userId,
		CancellationToken cancellationToken = default
	);
	Task<UpdateTenantUserResult> UpdateTenantUserAsync(
		Guid tenantId,
		Guid userId,
		UpdateTenantUserDocument document,
		CancellationToken cancellationToken = default
	);
	Task<SuspendTenantUserResult> SuspendTenantUserAsync(
		Guid tenantId,
		Guid userId,
		CancellationToken cancellationToken = default
	);
	Task<ReactivateTenantUserResult> ReactivateTenantUserAsync(
		Guid tenantId,
		Guid userId,
		CancellationToken cancellationToken = default
	);
}

[Service(ServiceLifetime.Scoped)]
public class TenantUserMembershipService : ITenantUserMembershipService {

	private readonly AppDbContext _dbContext;

	public TenantUserMembershipService(
		AppDbContext dbContext,
		ILogger<TenantUserMembershipService> logger
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
					await RemoveUserAccountProfileLinksAsync(
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
			var result = await RemoveUserFromTenantAsync(
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
			var result = await SuspendTenantUserAsync(
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
			var result = await ReactivateTenantUserAsync(
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

	public async Task<RemoveUserFromTenantResult> RemoveUserFromTenantAsync(
		Guid tenantId,
		Guid userId,
		CancellationToken cancellationToken = default
	) {
		// Find the user account for this tenant
		var userAccount = await (
			from ua in _dbContext.UserAccount
			where ua.TenantId == tenantId
				&& ua.UserId == userId
				&& ua.Scope == AccountScope.Tenant
				&& !ua.IsDeleted
			select ua
		).FirstOrDefaultAsync(cancellationToken);

		if (userAccount is null) {
			return new RemoveUserFromTenantResult.NotFound();
		}

		// Wrap admin check and soft delete in a transaction to prevent race conditions
		await using var transaction =
			await _dbContext.Database.BeginTransactionAsync(
				IsolationLevel.Serializable,
				cancellationToken
			);

		try {
			// Check if this user is the last admin
			if (userAccount.Level == AccountLevel.Admin) {
				var isRemovingActiveAdmin = await IsActiveTenantAdminAsync(
					tenantId,
					userId,
					cancellationToken
				);
				var activeAdminCount = isRemovingActiveAdmin
					? await CountActiveTenantAdminsAsync(
						tenantId,
						cancellationToken
					)
					: 0;

				if (isRemovingActiveAdmin && activeAdminCount <= 1) {
					return new RemoveUserFromTenantResult.CannotRemoveLastAdmin();
				}
			}

			// Soft delete the user account
			userAccount.IsDeleted = true;
			userAccount.DeletedAt = DateTime.UtcNow;
			await RemoveUserAccountProfileLinksAsync(
				userAccount.GetRequiredId(),
				cancellationToken
			);
			await _dbContext.SaveChangesAsync(cancellationToken);

			await transaction.CommitAsync(cancellationToken);
		} catch {
			await transaction.RollbackAsync(cancellationToken);
			throw;
		}

		return new RemoveUserFromTenantResult.Success();
	}

	public async Task<UpdateTenantUserResult> UpdateTenantUserAsync(
		Guid tenantId,
		Guid userId,
		UpdateTenantUserDocument document,
		CancellationToken cancellationToken = default
	) {
		// Find the user and their account for this tenant
		var userAccount = await (
			from ua in _dbContext.UserAccount
			join u in _dbContext.User on ua.UserId equals u.Id
			where ua.TenantId == tenantId
				&& ua.UserId == userId
				&& ua.Scope == AccountScope.Tenant
				&& !ua.IsDeleted
				&& !u.IsDeleted
			select new { User = u, Account = ua }
		).FirstOrDefaultAsync(cancellationToken);

		if (userAccount is null) {
			return new UpdateTenantUserResult.NotFound();
		}

		var user = userAccount.User;
		var account = userAccount.Account;

		// Determine new level if provided
		AccountLevel? newLevel = null;
		if (document.Level is not null) {
			newLevel = UserAccount.ParseLevel(document.Level);
			if (newLevel is null) {
				return new UpdateTenantUserResult.NotFound();
			}
		}

		// Determine if we need a transaction for the last-admin invariant check
		var needsAdminInvariantTransaction =
			document.Level is not null
			&& account.Level == AccountLevel.Admin
			&& newLevel != AccountLevel.Admin;

		await using var transaction =
			needsAdminInvariantTransaction
				? await _dbContext.Database.BeginTransactionAsync(
					IsolationLevel.Serializable,
					cancellationToken
				)
				: null;

		try {
			// Check last-admin invariant if demoting from admin
			if (needsAdminInvariantTransaction) {
				var isDemotingActiveAdmin = await IsActiveTenantAdminAsync(
					tenantId,
					userId,
					cancellationToken
				);
				var hasAnotherActiveAdmin = isDemotingActiveAdmin
					&& await TenantHasAnotherActiveAdminAsync(
						tenantId,
						userId,
						cancellationToken
					);

				if (isDemotingActiveAdmin && !hasAnotherActiveAdmin) {
					return new UpdateTenantUserResult.CannotDemoteLastAdmin();
				}
			}

			// Apply all changes: account level + user profile fields
			if (newLevel is not null) {
				account.Level = newLevel.Value;
			}
			if (document.FirstName.IsPresent) {
				user.FirstName = document.FirstName.Value;
			}
			if (document.LastName.IsPresent) {
				user.LastName = document.LastName.Value;
			}
			if (document.AvatarUrl.IsPresent) {
				user.AvatarUrl = document.AvatarUrl.Value;
			}

			account.UpdatedAt = DateTime.UtcNow;
			user.UpdatedAt = DateTime.UtcNow;

			await _dbContext.SaveChangesAsync(cancellationToken);

			if (transaction is not null) {
				await transaction.CommitAsync(cancellationToken);
			}
		} catch {
			if (transaction is not null) {
				await transaction.RollbackAsync(cancellationToken);
			}
			throw;
		}

		return new UpdateTenantUserResult.Success(
			new TenantUserData {
				User = user,
				Account = account,
				AccountLevel = account.Level
			}
		);
	}

	private IQueryable<UserAccount> BuildActiveTenantAdminAccountsQuery(
		Guid tenantId
	) {
		// A globally suspended User cannot satisfy tenant last-admin protection,
		// even when the tenant membership row itself is still active.
		return
			from ua in _dbContext.UserAccount
			join u in _dbContext.User on ua.UserId equals u.Id
			where ua.TenantId == tenantId
				&& ua.Scope == AccountScope.Tenant
				&& ua.Level == AccountLevel.Admin
				&& ua.Status != AccountStatus.Suspended
				&& !ua.IsDeleted
				&& !u.IsDeleted
				&& u.Status != UserStatus.Suspended
			select ua;
	}

	private async Task<bool> IsActiveTenantAdminAsync(
		Guid tenantId,
		Guid userId,
		CancellationToken cancellationToken
	) {
		return await (
			from ua in BuildActiveTenantAdminAccountsQuery(tenantId)
			where ua.UserId == userId
			select ua
		).AnyAsync(cancellationToken);
	}

	private async Task<int> CountActiveTenantAdminsAsync(
		Guid tenantId,
		CancellationToken cancellationToken
	) {
		return await BuildActiveTenantAdminAccountsQuery(tenantId)
			.CountAsync(cancellationToken);
	}

	private async Task<bool> TenantHasAnotherActiveAdminAsync(
		Guid tenantId,
		Guid userId,
		CancellationToken cancellationToken
	) {
		return await (
			from ua in BuildActiveTenantAdminAccountsQuery(tenantId)
			where ua.UserId != userId
			select ua
		).AnyAsync(cancellationToken);
	}

	private async Task RemoveUserAccountProfileLinksAsync(
		Guid userAccountId,
		CancellationToken cancellationToken
	) {
		// UserAccountProfile is current membership state. Hard-delete links when
		// membership is removed or restored so stale permissions cannot return.
		var links = await (
			from link in _dbContext.UserAccountProfile
			where link.UserAccountId == userAccountId
			select link
		).ToListAsync(cancellationToken);

		_dbContext.UserAccountProfile.RemoveRange(links);
	}

	public async Task<SuspendTenantUserResult> SuspendTenantUserAsync(
		Guid tenantId,
		Guid userId,
		CancellationToken cancellationToken = default
	) {
		// Find the user account for this tenant
		var userAccount = await (
			from ua in _dbContext.UserAccount
			join u in _dbContext.User on ua.UserId equals u.Id
			where ua.TenantId == tenantId
				&& ua.UserId == userId
				&& ua.Scope == AccountScope.Tenant
				&& !ua.IsDeleted
				&& !u.IsDeleted
			select new { User = u, Account = ua }
		).FirstOrDefaultAsync(cancellationToken);

		if (userAccount is null) {
			return new SuspendTenantUserResult.NotFound();
		}

		var account = userAccount.Account;

		if (account.IsSuspended()) {
			return new SuspendTenantUserResult.AlreadySuspended();
		}

		// Check last-admin invariant: cannot suspend the last active admin
		if (account.Level == AccountLevel.Admin) {
			var isSuspendingActiveAdmin = await IsActiveTenantAdminAsync(
				tenantId,
				userId,
				cancellationToken
			);
			var activeAdminCount = isSuspendingActiveAdmin
				? await CountActiveTenantAdminsAsync(
					tenantId,
					cancellationToken
				)
				: 0;

			if (isSuspendingActiveAdmin && activeAdminCount <= 1) {
				return new SuspendTenantUserResult.CannotSuspendLastAdmin();
			}
		}

		// Use atomic update for race-condition safety
		var rowsAffected = await _dbContext.UserAccount
			.Where(ua =>
				ua.TenantId == tenantId
				&& ua.UserId == userId
				&& ua.Scope == AccountScope.Tenant
				&& !ua.IsDeleted
				&& ua.Status != AccountStatus.Suspended
			)
			.ExecuteUpdateAsync(setters => setters
				.SetProperty(ua => ua.Status, AccountStatus.Suspended)
				.SetProperty(ua => ua.UpdatedAt, DateTime.UtcNow),
				cancellationToken);

		if (rowsAffected == 0) {
			return new SuspendTenantUserResult.AlreadySuspended();
		}

		// Re-fetch to return current state
		var updatedAccount = await (
			from ua in _dbContext.UserAccount
				.AsNoTracking()
			join u in _dbContext.User on ua.UserId equals u.Id
			where ua.TenantId == tenantId
				&& ua.UserId == userId
				&& ua.Scope == AccountScope.Tenant
			select new { User = u, Account = ua }
		).FirstOrDefaultAsync(cancellationToken);

		if (updatedAccount is null) {
			throw new InvalidOperationException(
				"User account not found after successful suspend. "
				+ "This indicates a data integrity issue."
			);
		}

		return new SuspendTenantUserResult.Success(
			new TenantUserData {
				User = updatedAccount.User,
				Account = updatedAccount.Account,
				AccountLevel = updatedAccount.Account.Level
			}
		);
	}

	public async Task<ReactivateTenantUserResult> ReactivateTenantUserAsync(
		Guid tenantId,
		Guid userId,
		CancellationToken cancellationToken = default
	) {
		// Find the user account for this tenant
		var userAccount = await (
			from ua in _dbContext.UserAccount
				.AsNoTracking()
			join u in _dbContext.User on ua.UserId equals u.Id
			where ua.TenantId == tenantId
				&& ua.UserId == userId
				&& ua.Scope == AccountScope.Tenant
				&& !ua.IsDeleted
				&& !u.IsDeleted
			select new { User = u, Account = ua }
		).FirstOrDefaultAsync(cancellationToken);

		if (userAccount is null) {
			return new ReactivateTenantUserResult.NotFound();
		}

		var account = userAccount.Account;

		if (!account.IsSuspended()) {
			return new ReactivateTenantUserResult.NotSuspended();
		}

		// Use atomic update for race-condition safety
		var rowsAffected = await _dbContext.UserAccount
			.Where(ua =>
				ua.TenantId == tenantId
				&& ua.UserId == userId
				&& ua.Scope == AccountScope.Tenant
				&& !ua.IsDeleted
				&& ua.Status == AccountStatus.Suspended
			)
			.ExecuteUpdateAsync(setters => setters
				.SetProperty(ua => ua.Status, AccountStatus.Active)
				.SetProperty(ua => ua.UpdatedAt, DateTime.UtcNow),
				cancellationToken);

		if (rowsAffected == 0) {
			return new ReactivateTenantUserResult.NotSuspended();
		}

		// Re-fetch to return current state
		var updatedAccount = await (
			from ua in _dbContext.UserAccount
				.AsNoTracking()
			join u in _dbContext.User on ua.UserId equals u.Id
			where ua.TenantId == tenantId
				&& ua.UserId == userId
				&& ua.Scope == AccountScope.Tenant
			select new { User = u, Account = ua }
		).FirstOrDefaultAsync(cancellationToken);

		if (updatedAccount is null) {
			throw new InvalidOperationException(
				"User account not found after successful reactivate. "
				+ "This indicates a data integrity issue."
			);
		}

		return new ReactivateTenantUserResult.Success(
			new TenantUserData {
				User = updatedAccount.User,
				Account = updatedAccount.Account,
				AccountLevel = updatedAccount.Account.Level
			}
		);
	}
}
