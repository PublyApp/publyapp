using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Modules.Roles.Services;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Modules.Users.Services;

public interface IStaffUserLifecycleService {
	Task<SuspendStaffUserResult> SuspendStaffUserAsync(
		Guid userId,
		CancellationToken cancellationToken = default
	);
	Task<ReactivateStaffUserResult> ReactivateStaffUserAsync(
		Guid userId,
		CancellationToken cancellationToken = default
	);
	Task<BulkStaffUserActionResult> BulkSuspendStaffUsersAsync(
		IReadOnlyCollection<Guid> userIds,
		CancellationToken cancellationToken = default
	);
	Task<BulkStaffUserActionResult> BulkReactivateStaffUsersAsync(
		IReadOnlyCollection<Guid> userIds,
		CancellationToken cancellationToken = default
	);
	Task<BulkStaffUserActionResult> BulkDeleteStaffUsersAsync(
		IReadOnlyCollection<Guid> userIds,
		CancellationToken cancellationToken = default
	);
	Task<DeleteStaffUserResult> DeleteStaffUserAsync(
		Guid userId,
		CancellationToken cancellationToken = default
	);
}

[Service(ServiceLifetime.Scoped)]
public sealed class StaffUserLifecycleService : IStaffUserLifecycleService {
	private readonly AppDbContext _DbContext;
	public StaffUserLifecycleService(
		AppDbContext dbContext
	) {
		this._DbContext = dbContext;
	}

	public async Task<SuspendStaffUserResult> SuspendStaffUserAsync(
		Guid userId,
		CancellationToken cancellationToken = default
	) {
		// Suspension for staff users is a global identity suspension (User.Status).
		// This mirrors the tenant suspend/reactivate semantics: the staff UserAccount
		// is still present, but the user can no longer authenticate/use staff routes.
		var userData = await this._FindLiveStaffUserAsync(userId, cancellationToken);
		if (userData is null) {
			return new SuspendStaffUserResult.NotFound();
		}

		if (userData.User.IsSuspended()) {
			return new SuspendStaffUserResult.AlreadySuspended();
		}

		// Staff last-owner invariant (#2322): the full-access system role is the source of
		// every staff permission, so suspending its last active holder would lock every staff
		// member out for good. Same invariant and response key as the tenant last-admin guard.
		if (userData.IsFullAccess
			&& !await this._HasAnotherActiveStaffFullAccessHolderAsync(
				userId,
				cancellationToken
			)) {
			return new SuspendStaffUserResult.CannotSuspendLastAdmin();
		}

		var now = DateTime.UtcNow;
		var updatedUserCount = await this._BuildLiveStaffUserMutationQuery(userId)
			.Where(x => x.Status != UserStatus.Suspended)
			.ExecuteUpdateAsync(
				setters => setters
					.SetProperty(x => x.Status, UserStatus.Suspended)
					.SetProperty(x => x.UpdatedAt, now),
				cancellationToken
			);

		if (updatedUserCount == 0) {
			return await this._ResolveSuspendStaffUserAfterNoRowsAsync(
				userId,
				cancellationToken
			);
		}

		userData.User.Status = UserStatus.Suspended;

		return new SuspendStaffUserResult.Success(userData);
	}

	public async Task<ReactivateStaffUserResult> ReactivateStaffUserAsync(
		Guid userId,
		CancellationToken cancellationToken = default
	) {
		// Reactivation clears the global identity suspension and restores access.
		// We keep this explicit (not part of the general PATCH) to make the operation
		// harder to trigger accidentally and easier to permission-gate.
		var userData = await this._FindLiveStaffUserAsync(userId, cancellationToken);
		if (userData is null) {
			return new ReactivateStaffUserResult.NotFound();
		}

		if (!userData.User.IsSuspended()) {
			return new ReactivateStaffUserResult.NotSuspended();
		}

		var now = DateTime.UtcNow;
		var updatedUserCount = await this._BuildLiveStaffUserMutationQuery(userId)
			.Where(x => x.Status == UserStatus.Suspended)
			.ExecuteUpdateAsync(
				setters => setters
					.SetProperty(x => x.Status, UserStatus.Active)
					.SetProperty(x => x.UpdatedAt, now),
				cancellationToken
			);

		if (updatedUserCount == 0) {
			return await this._ResolveReactivateStaffUserAfterNoRowsAsync(
				userId,
				cancellationToken
			);
		}

		userData.User.Status = UserStatus.Active;

		return new ReactivateStaffUserResult.Success(userData);
	}

	public async Task<BulkStaffUserActionResult> BulkSuspendStaffUsersAsync(
		IReadOnlyCollection<Guid> userIds,
		CancellationToken cancellationToken = default
	) {
		var requestedIds = userIds.Distinct().ToList();
		if (requestedIds.Count == 0) {
			return new BulkStaffUserActionResult(0, 0, []);
		}

		var liveUserStatuses = await this._FindLiveStaffUserStatusesAsync(
			requestedIds,
			cancellationToken
		);

		var failedItems = new List<BulkStaffUserFailedItem>();
		var candidateUserIds = new List<Guid>();

		foreach (var userId in requestedIds) {
			if (!liveUserStatuses.TryGetValue(userId, out var status)) {
				failedItems.Add(new BulkStaffUserFailedItem(userId, "User not found"));
				continue;
			}

			if (status == UserStatus.Suspended) {
				failedItems.Add(
					new BulkStaffUserFailedItem(
						userId,
						"User is already suspended"
					)
				);
				continue;
			}

			candidateUserIds.Add(userId);
		}

		var succeededCount = 0;
		var now = DateTime.UtcNow;

		// Staff last-owner invariant (#2322), tenant bulk shape: count the active holders once,
		// then decrement for every affected holder so a batch cannot empty the role in one call.
		var activeFullAccessUserIds = (
			await (
				from ua in FullAccessRoleQueries.ActiveStaffFullAccessAccounts(this._DbContext)
				where candidateUserIds.Contains(ua.UserId)
				select ua.UserId
			).ToListAsync(cancellationToken)
		).ToHashSet();
		var activeFullAccessCount =
			await FullAccessRoleQueries.CountActiveStaffFullAccessAsync(
				this._DbContext,
				cancellationToken
			);

		foreach (var userId in candidateUserIds) {
			if (activeFullAccessUserIds.Contains(userId)) {
				if (activeFullAccessCount <= 1) {
					failedItems.Add(new BulkStaffUserFailedItem(userId, "last-admin"));
					continue;
				}

				activeFullAccessCount--;
			}

			var updatedUserCount = await this._BuildLiveStaffUserMutationQuery(userId)
				.Where(x => x.Status != UserStatus.Suspended)
				.ExecuteUpdateAsync(
					setters => setters
						.SetProperty(x => x.Status, UserStatus.Suspended)
						.SetProperty(x => x.UpdatedAt, now),
					cancellationToken
				);

			if (updatedUserCount == 1) {
				succeededCount++;
				continue;
			}

			var resolvedResult = await this._ResolveSuspendStaffUserAfterNoRowsAsync(
				userId,
				cancellationToken
			);

			if (resolvedResult is SuspendStaffUserResult.NotFound) {
				failedItems.Add(new BulkStaffUserFailedItem(userId, "User not found"));
				continue;
			}

			if (resolvedResult is SuspendStaffUserResult.AlreadySuspended) {
				failedItems.Add(
					new BulkStaffUserFailedItem(
						userId,
						"User is already suspended"
					)
				);
				continue;
			}

			throw new InvalidOperationException(
				$"Unknown bulk suspend staff user result: {resolvedResult.GetType().Name}"
			);
		}

		return new BulkStaffUserActionResult(
			succeededCount,
			failedItems.Count,
			failedItems
		);
	}

	public async Task<BulkStaffUserActionResult> BulkReactivateStaffUsersAsync(
		IReadOnlyCollection<Guid> userIds,
		CancellationToken cancellationToken = default
	) {
		var requestedIds = userIds.Distinct().ToList();
		if (requestedIds.Count == 0) {
			return new BulkStaffUserActionResult(0, 0, []);
		}

		var liveUserStatuses = await this._FindLiveStaffUserStatusesAsync(
			requestedIds,
			cancellationToken
		);

		var failedItems = new List<BulkStaffUserFailedItem>();
		var candidateUserIds = new List<Guid>();

		foreach (var userId in requestedIds) {
			if (!liveUserStatuses.TryGetValue(userId, out var status)) {
				failedItems.Add(new BulkStaffUserFailedItem(userId, "User not found"));
				continue;
			}

			if (status != UserStatus.Suspended) {
				failedItems.Add(
					new BulkStaffUserFailedItem(
						userId,
						"User is not currently suspended"
					)
				);
				continue;
			}

			candidateUserIds.Add(userId);
		}

		var succeededCount = 0;
		var now = DateTime.UtcNow;

		foreach (var userId in candidateUserIds) {
			var updatedUserCount = await this._BuildLiveStaffUserMutationQuery(userId)
				.Where(x => x.Status == UserStatus.Suspended)
				.ExecuteUpdateAsync(
					setters => setters
						.SetProperty(x => x.Status, UserStatus.Active)
						.SetProperty(x => x.UpdatedAt, now),
					cancellationToken
				);

			if (updatedUserCount == 1) {
				succeededCount++;
				continue;
			}

			var resolvedResult = await this._ResolveReactivateStaffUserAfterNoRowsAsync(
				userId,
				cancellationToken
			);

			if (resolvedResult is ReactivateStaffUserResult.NotFound) {
				failedItems.Add(new BulkStaffUserFailedItem(userId, "User not found"));
				continue;
			}

			if (resolvedResult is ReactivateStaffUserResult.NotSuspended) {
				failedItems.Add(
					new BulkStaffUserFailedItem(
						userId,
						"User is not currently suspended"
					)
				);
				continue;
			}

			throw new InvalidOperationException(
				$"Unknown bulk reactivate staff user result: {resolvedResult.GetType().Name}"
			);
		}

		return new BulkStaffUserActionResult(
			succeededCount,
			failedItems.Count,
			failedItems
		);
	}

	public async Task<BulkStaffUserActionResult> BulkDeleteStaffUsersAsync(
		IReadOnlyCollection<Guid> userIds,
		CancellationToken cancellationToken = default
	) {
		var requestedIds = userIds.Distinct().ToList();
		if (requestedIds.Count == 0) {
			return new BulkStaffUserActionResult(0, 0, []);
		}

		var failedItems = new List<BulkStaffUserFailedItem>();
		var succeededCount = 0;

		foreach (var userId in requestedIds) {
			var result = await this.DeleteStaffUserAsync(
				userId,
				cancellationToken
			);

			if (result is DeleteStaffUserResult.Success) {
				succeededCount++;
				continue;
			}

			if (result is DeleteStaffUserResult.NotFound) {
				failedItems.Add(new BulkStaffUserFailedItem(userId, "User not found"));
				continue;
			}

			if (result is DeleteStaffUserResult.CannotRemoveLastAdmin) {
				failedItems.Add(new BulkStaffUserFailedItem(userId, "last-admin"));
				continue;
			}

			if (result is DeleteStaffUserResult.NotSuspended) {
				failedItems.Add(
					new BulkStaffUserFailedItem(
						userId,
						"User must be suspended before deletion"
					)
				);
				continue;
			}

			throw new InvalidOperationException(
				$"Unknown bulk delete staff user result: {result.GetType().Name}"
			);
		}

		return new BulkStaffUserActionResult(
			succeededCount,
			failedItems.Count,
			failedItems
		);
	}

	public async Task<DeleteStaffUserResult> DeleteStaffUserAsync(
		Guid userId,
		CancellationToken cancellationToken = default
	) {
		var target = await this._FindLiveStaffUserDeleteTargetAsync(
			userId,
			cancellationToken
		);

		if (target is null) {
			return new DeleteStaffUserResult.NotFound();
		}

		// Staff last-owner invariant (#2322). Checked before the "must be suspended" rule so the
		// informative refusal wins for a sole active owner: deleting the only full-access holder
		// destroys the last role assignment, after which nobody can grant it again.
		if (target.UserData.IsFullAccess
			&& !await this._HasAnotherActiveStaffFullAccessHolderAsync(
				userId,
				cancellationToken
			)) {
			return new DeleteStaffUserResult.CannotRemoveLastAdmin();
		}

		if (!target.UserData.User.IsSuspended()) {
			return new DeleteStaffUserResult.NotSuspended();
		}

		var now = DateTime.UtcNow;
		await using var transaction = await this._DbContext.Database.BeginTransactionAsync(
			cancellationToken
		);

		var deletedUserCount = await this._BuildLiveStaffUserMutationQuery(userId)
			.Where(x => x.Status == UserStatus.Suspended)
			.ExecuteUpdateAsync(
				setters => setters
					.SetProperty(x => x.IsDeleted, true)
					.SetProperty(x => x.DeletedAt, now)
					.SetProperty(x => x.UpdatedAt, now),
				cancellationToken
			);

		if (deletedUserCount == 0) {
			await transaction.RollbackAsync(cancellationToken);
			return await this._ResolveDeleteStaffUserAfterNoRowsAsync(
				userId,
				cancellationToken
			);
		}

		var deletedUserAccountCount = await this._DbContext.UserAccount
			.Where(x =>
				x.Id == target.UserAccountId
				&& x.UserId == userId
				&& x.Scope == AccountScope.Staff
				&& !x.IsDeleted
			)
			.ExecuteUpdateAsync(
				setters => setters
					.SetProperty(x => x.IsDeleted, true)
					.SetProperty(x => x.DeletedAt, now)
					.SetProperty(x => x.UpdatedAt, now),
				cancellationToken
			);

		if (deletedUserAccountCount != 1) {
			await transaction.RollbackAsync(cancellationToken);
			return new DeleteStaffUserResult.NotFound();
		}

		// Role links have no independent lifecycle after the staff account is deleted.
		// ExecuteDeleteAsync bypasses soft-delete conversion and removes membership rows.
		await this._DbContext.UserAccountRole
			.Where(x => x.UserAccountId == target.UserAccountId)
			.ExecuteDeleteAsync(cancellationToken);

		await transaction.CommitAsync(cancellationToken);

		return new DeleteStaffUserResult.Success(
			target.UserData,
			target.UserAccountId
		);
	}

	/// <summary>
	/// True when an active staff full-access holder other than <paramref name="excludedUserId"/>
	/// remains. "Active" is the shared <see cref="FullAccessRoleQueries"/> definition, so a
	/// suspended account or user never satisfies the last-owner invariant.
	/// </summary>
	private Task<bool> _HasAnotherActiveStaffFullAccessHolderAsync(
		Guid excludedUserId,
		CancellationToken cancellationToken
	) {
		return FullAccessRoleQueries
			.ActiveStaffFullAccessAccounts(this._DbContext)
			.AnyAsync(
				account => account.UserId != excludedUserId,
				cancellationToken
			);
	}

	private IQueryable<StaffUserData> _BuildLiveStaffUserQuery(Guid userId) {
		return
			from ua in this._DbContext.UserAccount.AsNoTracking()
			where ua.UserId == userId
				&& ua.Scope == AccountScope.Staff
				&& !ua.IsDeleted
				&& !ua.User.IsDeleted
			select new StaffUserData {
				User = ua.User,
				IsFullAccess = this._DbContext.UserAccountRole.Any(uap =>
					uap.UserAccountId == ua.Id
					&& !uap.Role.IsDeleted
					&& uap.Role.IsFullAccess),
				Roles = (
					from uap in this._DbContext.UserAccountRole
					join p in this._DbContext.Role on uap.RoleId equals p.Id
					where uap.UserAccountId == ua.Id && !p.IsDeleted
					orderby p.Name
					select p.Name
				).ToList()
			};
	}

	private IQueryable<User> _BuildLiveStaffUserMutationQuery(Guid userId) {
		return this._DbContext.User.Where(u =>
			u.Id == userId
			&& !u.IsDeleted
			&& this._DbContext.UserAccount.Any(ua =>
				ua.UserId == u.Id
				&& ua.Scope == AccountScope.Staff
				&& !ua.IsDeleted
			)
		);
	}

	private async Task<StaffUserData?> _FindLiveStaffUserAsync(
		Guid userId,
		CancellationToken cancellationToken
	) {
		return await this._BuildLiveStaffUserQuery(userId)
			.FirstOrDefaultAsync(cancellationToken);
	}

	private async Task<LiveStaffUserDeleteTarget?> _FindLiveStaffUserDeleteTargetAsync(
		Guid userId,
		CancellationToken cancellationToken
	) {
		return await (
			from ua in this._DbContext.UserAccount.AsNoTracking()
			where ua.UserId == userId
				&& ua.Scope == AccountScope.Staff
				&& !ua.IsDeleted
				&& !ua.User.IsDeleted
			select new LiveStaffUserDeleteTarget {
				UserAccountId = ua.GetRequiredId(),
				UserData = new StaffUserData {
					User = ua.User,
					IsFullAccess = this._DbContext.UserAccountRole.Any(uap =>
						uap.UserAccountId == ua.Id
						&& !uap.Role.IsDeleted
						&& uap.Role.IsFullAccess),
					Roles = (
						from uap in this._DbContext.UserAccountRole
						join p in this._DbContext.Role on uap.RoleId equals p.Id
						where uap.UserAccountId == ua.Id && !p.IsDeleted
						orderby p.Name
						select p.Name
					).ToList()
				}
			}
		).FirstOrDefaultAsync(cancellationToken);
	}

	private async Task<Dictionary<Guid, UserStatus>> _FindLiveStaffUserStatusesAsync(
		IReadOnlyCollection<Guid> userIds,
		CancellationToken cancellationToken
	) {
		return await (
			from ua in this._DbContext.UserAccount.AsNoTracking()
			where userIds.Contains(ua.UserId)
				&& ua.Scope == AccountScope.Staff
				&& !ua.IsDeleted
				&& !ua.User.IsDeleted
			select new LiveStaffUserStatus {
				UserId = ua.UserId,
				Status = ua.User.Status
			}
		).ToDictionaryAsync(
			x => x.UserId,
			x => x.Status,
			cancellationToken
		);
	}

	private sealed record LiveStaffUserStatus {
		public required Guid UserId { get; init; }
		public required UserStatus Status { get; init; }
	}

	private async Task<SuspendStaffUserResult> _ResolveSuspendStaffUserAfterNoRowsAsync(
		Guid userId,
		CancellationToken cancellationToken
	) {
		var currentUserData = await this._FindLiveStaffUserAsync(userId, cancellationToken);
		if (currentUserData is null) {
			return new SuspendStaffUserResult.NotFound();
		}

		if (currentUserData.User.IsSuspended()) {
			return new SuspendStaffUserResult.AlreadySuspended();
		}

		throw new InvalidOperationException(
			"Staff user still matched suspend preconditions after a 0-row update."
		);
	}

	private async Task<ReactivateStaffUserResult> _ResolveReactivateStaffUserAfterNoRowsAsync(
		Guid userId,
		CancellationToken cancellationToken
	) {
		var currentUserData = await this._FindLiveStaffUserAsync(userId, cancellationToken);
		if (currentUserData is null) {
			return new ReactivateStaffUserResult.NotFound();
		}

		if (!currentUserData.User.IsSuspended()) {
			return new ReactivateStaffUserResult.NotSuspended();
		}

		throw new InvalidOperationException(
			"Staff user still matched reactivate preconditions after a 0-row update."
		);
	}

	private async Task<DeleteStaffUserResult> _ResolveDeleteStaffUserAfterNoRowsAsync(
		Guid userId,
		CancellationToken cancellationToken
	) {
		var currentUserData = await this._FindLiveStaffUserAsync(userId, cancellationToken);
		if (currentUserData is null) {
			return new DeleteStaffUserResult.NotFound();
		}

		if (!currentUserData.User.IsSuspended()) {
			return new DeleteStaffUserResult.NotSuspended();
		}

		throw new InvalidOperationException(
			"Staff user still matched delete preconditions after a 0-row update."
		);
	}

	private sealed class LiveStaffUserDeleteTarget {
		public required Guid UserAccountId { get; init; }
		public required StaffUserData UserData { get; init; }
	}

}
