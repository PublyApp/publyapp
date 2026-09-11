using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.DI;
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
		_DbContext = dbContext;
	}

	public async Task<SuspendStaffUserResult> SuspendStaffUserAsync(
		Guid userId,
		CancellationToken cancellationToken = default
	) {
		// Suspension for staff users is a global identity suspension (User.Status).
		// This mirrors the tenant suspend/reactivate semantics: the staff UserAccount
		// is still present, but the user can no longer authenticate/use staff routes.
		var userData = await _FindLiveStaffUserAsync(userId, cancellationToken);
		if (userData is null) {
			return new SuspendStaffUserResult.NotFound();
		}

		if (userData.User.IsSuspended()) {
			return new SuspendStaffUserResult.AlreadySuspended();
		}

		var now = DateTime.UtcNow;
		var updatedUserCount = await _BuildLiveStaffUserMutationQuery(userId)
			.Where(x => x.Status != UserStatus.Suspended)
			.ExecuteUpdateAsync(
				setters => setters
					.SetProperty(x => x.Status, UserStatus.Suspended)
					.SetProperty(x => x.UpdatedAt, now),
				cancellationToken
			);

		if (updatedUserCount == 0) {
			return await _ResolveSuspendStaffUserAfterNoRowsAsync(
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
		var userData = await _FindLiveStaffUserAsync(userId, cancellationToken);
		if (userData is null) {
			return new ReactivateStaffUserResult.NotFound();
		}

		if (!userData.User.IsSuspended()) {
			return new ReactivateStaffUserResult.NotSuspended();
		}

		var now = DateTime.UtcNow;
		var updatedUserCount = await _BuildLiveStaffUserMutationQuery(userId)
			.Where(x => x.Status == UserStatus.Suspended)
			.ExecuteUpdateAsync(
				setters => setters
					.SetProperty(x => x.Status, UserStatus.Active)
					.SetProperty(x => x.UpdatedAt, now),
				cancellationToken
			);

		if (updatedUserCount == 0) {
			return await _ResolveReactivateStaffUserAfterNoRowsAsync(
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

		var liveUserStatuses = await _FindLiveStaffUserStatusesAsync(
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

		foreach (var userId in candidateUserIds) {
			var updatedUserCount = await _BuildLiveStaffUserMutationQuery(userId)
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

			var resolvedResult = await _ResolveSuspendStaffUserAfterNoRowsAsync(
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

		var liveUserStatuses = await _FindLiveStaffUserStatusesAsync(
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
			var updatedUserCount = await _BuildLiveStaffUserMutationQuery(userId)
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

			var resolvedResult = await _ResolveReactivateStaffUserAfterNoRowsAsync(
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
			var result = await DeleteStaffUserAsync(
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
		var target = await _FindLiveStaffUserDeleteTargetAsync(
			userId,
			cancellationToken
		);

		if (target is null) {
			return new DeleteStaffUserResult.NotFound();
		}

		if (!target.UserData.User.IsSuspended()) {
			return new DeleteStaffUserResult.NotSuspended();
		}

		var now = DateTime.UtcNow;
		await using var transaction = await _DbContext.Database.BeginTransactionAsync(
			cancellationToken
		);

		var deletedUserCount = await _BuildLiveStaffUserMutationQuery(userId)
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
			return await _ResolveDeleteStaffUserAfterNoRowsAsync(
				userId,
				cancellationToken
			);
		}

		var deletedUserAccountCount = await _DbContext.UserAccount
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

		// Profile links have no independent lifecycle after the staff account is deleted.
		// ExecuteDeleteAsync bypasses soft-delete conversion and removes membership rows.
		await _DbContext.UserAccountProfile
			.Where(x => x.UserAccountId == target.UserAccountId)
			.ExecuteDeleteAsync(cancellationToken);

		await transaction.CommitAsync(cancellationToken);

		return new DeleteStaffUserResult.Success(
			target.UserData,
			target.UserAccountId
		);
	}

	private IQueryable<StaffUserData> _BuildLiveStaffUserQuery(Guid userId) {
		return
			from ua in _DbContext.UserAccount.AsNoTracking()
			where ua.UserId == userId
				&& ua.Scope == AccountScope.Staff
				&& !ua.IsDeleted
				&& !ua.User.IsDeleted
			select new StaffUserData {
				User = ua.User,
				AccountLevel = ua.Level
			};
	}

	private IQueryable<User> _BuildLiveStaffUserMutationQuery(Guid userId) {
		return _DbContext.User.Where(u =>
			u.Id == userId
			&& !u.IsDeleted
			&& _DbContext.UserAccount.Any(ua =>
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
		return await _BuildLiveStaffUserQuery(userId)
			.FirstOrDefaultAsync(cancellationToken);
	}

	private async Task<LiveStaffUserDeleteTarget?> _FindLiveStaffUserDeleteTargetAsync(
		Guid userId,
		CancellationToken cancellationToken
	) {
		return await (
			from ua in _DbContext.UserAccount.AsNoTracking()
			where ua.UserId == userId
				&& ua.Scope == AccountScope.Staff
				&& !ua.IsDeleted
				&& !ua.User.IsDeleted
			select new LiveStaffUserDeleteTarget {
				UserAccountId = ua.GetRequiredId(),
				UserData = new StaffUserData {
					User = ua.User,
					AccountLevel = ua.Level
				}
			}
		).FirstOrDefaultAsync(cancellationToken);
	}

	private async Task<Dictionary<Guid, UserStatus>> _FindLiveStaffUserStatusesAsync(
		IReadOnlyCollection<Guid> userIds,
		CancellationToken cancellationToken
	) {
		return await (
			from ua in _DbContext.UserAccount.AsNoTracking()
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
		var currentUserData = await _FindLiveStaffUserAsync(userId, cancellationToken);
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
		var currentUserData = await _FindLiveStaffUserAsync(userId, cancellationToken);
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
		var currentUserData = await _FindLiveStaffUserAsync(userId, cancellationToken);
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
