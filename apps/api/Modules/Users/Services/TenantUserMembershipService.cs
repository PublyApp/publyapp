using System.Data;

using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Storage;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Modules.Uploads.Services;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Modules.Users.Services;

public abstract record RemoveUserFromTenantResult {
	public sealed record Success() : RemoveUserFromTenantResult;
	public sealed record NotFound() : RemoveUserFromTenantResult;
	public sealed record CannotRemoveLastAdmin() : RemoveUserFromTenantResult;
}

public sealed record BulkRemoveUsersFromTenantArgs(
	Guid TenantId,
	IReadOnlyCollection<Guid> UserIds
);

public sealed record BulkTenantUserActionFailedItem(
	Guid UserId,
	string Error
);

public sealed record BulkTenantUserActionResult(
	int SucceededCount,
	int FailedCount,
	List<BulkTenantUserActionFailedItem> FailedItems
);

public class UpdateTenantUserDocument {
	public PatchField<string?> FirstName { get; set; } = PatchField<string?>.Absent();
	public PatchField<string?> LastName { get; set; } = PatchField<string?>.Absent();
	public PatchField<string?> AvatarUrl { get; set; } = PatchField<string?>.Absent();
}

public abstract record UpdateTenantUserResult {
	public sealed record Success(
		TenantUserData UserData
	) : UpdateTenantUserResult;
	public sealed record NotFound() : UpdateTenantUserResult;
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
	Task<RemoveUserFromTenantResult> RemoveUserFromTenantAsync(
		Guid tenantId,
		Guid userId,
		CancellationToken cancellationToken = default
	);
	Task<BulkTenantUserActionResult> BulkRemoveUsersFromTenantAsync(
		BulkRemoveUsersFromTenantArgs args,
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

	private readonly AppDbContext _DbContext;
	private readonly IUploadAssetReferenceService _UploadReferences;

	public TenantUserMembershipService(
		AppDbContext dbContext,
		IUploadAssetReferenceService uploadReferences,
		ILogger<TenantUserMembershipService> logger
	) {
		this._DbContext = dbContext;
		this._UploadReferences = uploadReferences;
		_ = logger;
	}

	public async Task<RemoveUserFromTenantResult> RemoveUserFromTenantAsync(
		Guid tenantId,
		Guid userId,
		CancellationToken cancellationToken = default
	) {
		return await TenantUserMembershipOperations.RemoveUserFromTenantAsync(
			this._DbContext,
			tenantId,
			userId,
			cancellationToken
		);
	}

	public async Task<BulkTenantUserActionResult> BulkRemoveUsersFromTenantAsync(
		BulkRemoveUsersFromTenantArgs args,
		CancellationToken cancellationToken = default
	) {
		return await TenantUserMembershipOperations.BulkRemoveUsersFromTenantAsync(
			this._DbContext,
			args.TenantId,
			args.UserIds,
			cancellationToken
		);
	}

	public async Task<UpdateTenantUserResult> UpdateTenantUserAsync(
		Guid tenantId,
		Guid userId,
		UpdateTenantUserDocument document,
		CancellationToken cancellationToken = default
	) {
		// Find the user and their account for this tenant
		var userAccount = await (
			from ua in this._DbContext.UserAccount
			join u in this._DbContext.User on ua.UserId equals u.Id
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

		// This method ALWAYS writes BOTH user_accounts and users (their UpdatedAt below), so it
		// always participates in the canonical lock order — not only on demotions. EF Core 10
		// finds no FK dependency edge between those two independent updates (neither a principal
		// key nor a dependent FK changes), so its ModificationCommandComparer orders them by
		// table name — user_accounts BEFORE users — the exact inverse of this order. Without
		// holding users(U) first, a non-demoting PATCH (which locks user_accounts inside its
		// SaveChanges, then waits for users) and a demotion of the same member (which holds
		// users, then waits for user_accounts) deadlock: 40P01 -> 500. See
		// TenantMembershipLockOrder, "a write is a lock". READ COMMITTED so the post-lock
		// revalidation and demotion guard read a fresh snapshot after the mutex wait.
		await using var transaction =
			await this._DbContext.Database.BeginTransactionAsync(cancellationToken);

		try {
			// TenantMembershipLockOrder step 1 — the identity mutex — taken BEFORE any save so
			// that SaveChanges' own row locks (user_accounts then users) are always acquired
			// while we already hold users(U). Every path that writes a member's user_accounts
			// row (this method, demotion, company create/restore, global suspension) takes
			// users(U) first, so no two of them can hold users and user_accounts in opposite
			// orders.
			await TenantMembershipLockOrder.LockUserIdentityRowsAsync(
				this._DbContext,
				[userId],
				cancellationToken
			);

			// Revalidate the tracked target after the mutex wait. While we blocked on users(U),
			// a concurrent holder of it (another PATCH, company create/restore, global
			// suspension) may have soft-deleted the account/user.
			await this._DbContext.Entry(account).ReloadAsync(cancellationToken);
			await this._DbContext.Entry(user).ReloadAsync(cancellationToken);

			if (account.IsDeleted || user.IsDeleted) {
				await transaction.RollbackAsync(cancellationToken);
				return new UpdateTenantUserResult.NotFound();
			}

			// Captured before mutation: the replaced avatar's reference is released
			// in the same transaction as the entity write (#807 F5).
			var previousAvatarUrl = user.AvatarUrl;

			if (document.FirstName.IsPresent) {
				user.FirstName = document.FirstName.Value;
			}
			if (document.LastName.IsPresent) {
				user.LastName = document.LastName.Value;
			}
			if (document.AvatarUrl.IsPresent) {
				// Acquire the new blob's reference BEFORE the entity write so the URL
				// can never commit while its asset reads zero references (#807 F5).
				if (ServedUploadPath.ExtractOrNull(document.AvatarUrl.Value) is { } acquiredPath) {
					await this._UploadReferences.TryAddReferenceAsync(acquiredPath, cancellationToken);
				}
				user.AvatarUrl = document.AvatarUrl.Value;
			}

			account.UpdatedAt = DateTime.UtcNow;
			user.UpdatedAt = DateTime.UtcNow;

			await this._DbContext.SaveChangesAsync(cancellationToken);

			if (document.AvatarUrl.IsPresent && previousAvatarUrl is not null
				&& ServedUploadPath.ExtractOrNull(previousAvatarUrl) is { } releasedPath
				&& previousAvatarUrl != user.AvatarUrl) {
				await this._UploadReferences.TryReleaseReferenceAsync(releasedPath, cancellationToken);
			}

			await transaction.CommitAsync(cancellationToken);
		} catch {
			await transaction.RollbackAsync(cancellationToken);
			throw;
		}

		return new UpdateTenantUserResult.Success(
			new TenantUserData {
				User = user,
				Account = account,
				IsFullAccess = await PublyApp.Api.Modules.Roles.Services.FullAccessRoleQueries
					.IsFullAccessAccountAsync(this._DbContext, account.GetRequiredId(), cancellationToken),
				Roles = await (
					from uap in this._DbContext.UserAccountRole
					join p in this._DbContext.Role on uap.RoleId equals p.Id
					where uap.UserAccountId == account.GetRequiredId() && !p.IsDeleted
					orderby p.Name
					select p.Name
				).ToListAsync(cancellationToken)
			}
		);
	}

	public async Task<SuspendTenantUserResult> SuspendTenantUserAsync(
		Guid tenantId,
		Guid userId,
		CancellationToken cancellationToken = default
	) {
		return await TenantUserMembershipOperations.SuspendTenantUserAsync(
			this._DbContext,
			tenantId,
			userId,
			cancellationToken
		);
	}

	public async Task<ReactivateTenantUserResult> ReactivateTenantUserAsync(
		Guid tenantId,
		Guid userId,
		CancellationToken cancellationToken = default
	) {
		return await TenantUserMembershipOperations.ReactivateTenantUserAsync(
			this._DbContext,
			tenantId,
			userId,
			cancellationToken
		);
	}
}
