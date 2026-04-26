using System.Data;

using MainApi.Src.Data.DbContext;
using MainApi.Src.Lib;
using MainApi.Src.Lib.DI;
using MainApi.Src.Modules.Profiles.Entities;
using MainApi.Src.Modules.Users.Entities;

using Microsoft.EntityFrameworkCore;

namespace MainApi.Src.Modules.Users.Services;

public abstract record CreateUserResult {
	public sealed record Success(User User) : CreateUserResult;
	public sealed record UserAlreadyExists(User User) : CreateUserResult;
}


public class StaffUserData {
	public required User User { get; set; }
	public required AccountLevel AccountLevel { get; set; }
}

public abstract record FindStaffUsersResult {
	public sealed record Success(
		CursorPaginatedResult<StaffUserData> Data
	) : FindStaffUsersResult;

	public sealed record CursorNotFound(
		string Cursor
	) : FindStaffUsersResult;

	public sealed record InvalidSortId(
		string SortId
	) : FindStaffUsersResult;
}

public sealed record FindStaffUsersFilters(
	string? Search,
	IReadOnlySet<UserStatus>? Status
);

public sealed record FindStaffUsersArgs(
	Guid Cursor,
	int? Limit,
	string? SortId,
	SortOrder? SortOrder,
	FindStaffUsersFilters? Filters
);

public class UpdateUserDocument {
	public string? Email { get; set; }
	public PatchField<string?> LastName { get; set; } = PatchField<string?>.Absent();
	public PatchField<string?> FirstName { get; set; } = PatchField<string?>.Absent();
	public PatchField<string?> AvatarUrl { get; set; } = PatchField<string?>.Absent();
	public string? AccountLevel { get; set; }
	public PatchField<string?> Status { get; set; } = PatchField<string?>.Absent();
}

public abstract record UpdateUserByIdResult {
	public sealed record Success(
		StaffUserData UserData
	) : UpdateUserByIdResult;
	public sealed record UserNotFound() : UpdateUserByIdResult;
	public sealed record UserAccountNotFound() : UpdateUserByIdResult;
	public sealed record UpdateFailed(
		string ErrorMessage
	) : UpdateUserByIdResult;
}

public abstract record FindTenantUsersResult {
	public sealed record Success(
		CursorPaginatedResult<TenantUserData> Data
	) : FindTenantUsersResult;

	public sealed record CursorNotFound(
		string Cursor
	) : FindTenantUsersResult;

	public sealed record InvalidSortId(
		string SortId
	) : FindTenantUsersResult;
}

public record FindTenantUsersAsStaffFilters(
	string? Search,
	IReadOnlySet<TenantUserStatus>? Status
);

public record FindTenantUsersAsStaffArgs(
	Guid Cursor,
	int? Limit,
	string? SortId,
	SortOrder? SortOrder,
	FindTenantUsersAsStaffFilters? Filters
);

public abstract record RemoveUserFromTenantResult {
	public sealed record Success() : RemoveUserFromTenantResult;
	public sealed record NotFound() : RemoveUserFromTenantResult;
	public sealed record CannotRemoveLastAdmin() : RemoveUserFromTenantResult;
}

public class TenantUserData {
	public required User User { get; set; }
	public required UserAccount Account { get; set; }
	public required AccountLevel AccountLevel { get; set; }
}

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

public sealed record StaffUserProfileSummary(
	Guid Id,
	string Name,
	string? Description
);

public sealed record StaffUserProfilesSummary(
	List<StaffUserProfileSummary> AssignedProfiles
);

public abstract record UpdateStaffUserProfilesServiceResult {
	public sealed record Success(
		List<StaffUserProfileSummary> AssignedProfiles
	) : UpdateStaffUserProfilesServiceResult;

	public sealed record UserNotFound() : UpdateStaffUserProfilesServiceResult;

	public sealed record ProfilesNotFound(
		List<Guid> ProfileIds
	) : UpdateStaffUserProfilesServiceResult;

	public sealed record ProfilesNotStaffScope(
		List<Guid> ProfileIds
	) : UpdateStaffUserProfilesServiceResult;
}

public abstract record SuspendStaffUserResult {
	public sealed record Success(StaffUserData UserData) : SuspendStaffUserResult;
	public sealed record NotFound() : SuspendStaffUserResult;
	public sealed record AlreadySuspended() : SuspendStaffUserResult;
}

public abstract record ReactivateStaffUserResult {
	public sealed record Success(StaffUserData UserData) : ReactivateStaffUserResult;
	public sealed record NotFound() : ReactivateStaffUserResult;
	public sealed record NotSuspended() : ReactivateStaffUserResult;
}

public abstract record DeleteStaffUserResult {
	public sealed record Success(
		StaffUserData UserData,
		Guid UserAccountId
	) : DeleteStaffUserResult;
	public sealed record NotFound() : DeleteStaffUserResult;
	public sealed record NotSuspended() : DeleteStaffUserResult;
}

public sealed record BulkStaffUserFailedItem(
	Guid UserId,
	string Error
);

public sealed record BulkStaffUserActionResult(
	int SucceededCount,
	int FailedCount,
	List<BulkStaffUserFailedItem> FailedItems
);

public abstract record UpdateStaffUserEmailResult {
	public sealed record Success(StaffUserData UserData) : UpdateStaffUserEmailResult;
	public sealed record NotFound() : UpdateStaffUserEmailResult;
	public sealed record EmailAlreadyInUse() : UpdateStaffUserEmailResult;
}

public interface IUserService {
	Task<CreateUserResult> CreateUserAsync(User user, CancellationToken cancellationToken = default);
	Task<User?> GetUserByEmailAsync(string email, CancellationToken cancellationToken = default);
	Task<User?> GetUserByEmailVerificationTokenAsync(string token, CancellationToken cancellationToken = default);
	Task<User?> GetUserByPasswordResetTokenAsync(string token, CancellationToken cancellationToken = default);
	Task<User?> UpdateUserAsync(User user, CancellationToken cancellationToken = default);
	Task<User?> GetUserByIdAsync(Guid? id, CancellationToken cancellationToken = default);
	Task<StaffUserData?> GetStaffUserUserByIdAsync(Guid userId, CancellationToken cancellationToken = default);
	Task<SuspendStaffUserResult> SuspendStaffUserAsync(Guid userId, CancellationToken cancellationToken = default);
	Task<ReactivateStaffUserResult> ReactivateStaffUserAsync(Guid userId, CancellationToken cancellationToken = default);
	Task<BulkStaffUserActionResult> BulkSuspendStaffUsersAsync(
		IReadOnlyCollection<Guid> userIds,
		CancellationToken cancellationToken = default
	);
	Task<BulkStaffUserActionResult> BulkReactivateStaffUsersAsync(
		IReadOnlyCollection<Guid> userIds,
		CancellationToken cancellationToken = default
	);
	Task<DeleteStaffUserResult> DeleteStaffUserAsync(Guid userId, CancellationToken cancellationToken = default);
	Task<UpdateStaffUserEmailResult> UpdateStaffUserEmailAsync(Guid userId, string email, CancellationToken cancellationToken = default);
	Task<int> CountStaffUsersAsync(CancellationToken cancellationToken = default);
	Task<FindStaffUsersResult> FindStaffUsersAsync(
		FindStaffUsersArgs args,
		CancellationToken cancellationToken = default
	);
	Task<UpdateUserByIdResult> UpdateStaffUserByIdAsync(Guid userId, UpdateUserDocument document, CancellationToken cancellationToken = default);
	Task<StaffUserProfilesSummary?> GetStaffUserProfilesAsync(
		Guid userId,
		CancellationToken cancellationToken = default
	);
	Task<UpdateStaffUserProfilesServiceResult> UpdateStaffUserProfilesAsync(
		Guid userId,
		List<Guid> profileIds,
		CancellationToken cancellationToken = default
	);
	Task<FindTenantUsersResult> FindTenantUsersAsync(
		Guid tenantId,
		FindTenantUsersAsStaffArgs args,
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
public class UserService : IUserService {
	private readonly MainApiDbContext _dbContext;
	private readonly ILogger<UserService> _logger;

	public UserService(MainApiDbContext dbContext, ILogger<UserService> logger) {
		_dbContext = dbContext;
		_logger = logger;
	}

	private static int GetTenantUserStatusRank(
		bool isUserGloballySuspended,
		bool isMembershipSuspended
	) {
		// Sort order mirrors the tenant-user effective status:
		// Active = 0, Suspended = 1, GloballySuspended = 2.
		if (isUserGloballySuspended) {
			return 2;
		}

		if (isMembershipSuspended) {
			return 1;
		}

		return 0;
	}

	public async Task<CreateUserResult> CreateUserAsync(User user, CancellationToken cancellationToken = default) {
		// check if user already exists
		var existingUser = await _dbContext.User
			.FirstOrDefaultAsync(u => u.Email == user.Email, cancellationToken);

		if (existingUser is not null) {
			return new CreateUserResult.UserAlreadyExists(existingUser);
		}

		var result = await _dbContext.User.AddAsync(user, cancellationToken);
		await _dbContext.SaveChangesAsync(cancellationToken);

		return new CreateUserResult.Success(result.Entity);
	}

	public async Task<User?> GetUserByEmailAsync(string email, CancellationToken cancellationToken = default) {
		var normalizedEmail = email.ToLowerInvariant();
		var query =
			from u in _dbContext.User
			where u.Email == normalizedEmail
			&& !u.IsDeleted
			// Check status and verification in the login handler so it can return tailored errors.
			select u;

		return await query.FirstOrDefaultAsync(cancellationToken);
	}

	public async Task<User?> UpdateUserAsync(User user, CancellationToken cancellationToken = default) {
		_dbContext.User.Update(user);
		await _dbContext.SaveChangesAsync(cancellationToken);
		return user;
	}

	public async Task<User?> GetUserByIdAsync(Guid? id, CancellationToken cancellationToken = default) {
		var query =
			from u in _dbContext.User
			where u.Id == id
			select u;
		return await query.FirstOrDefaultAsync(cancellationToken);
	}

	public async Task<User?> GetUserByEmailVerificationTokenAsync(string token, CancellationToken cancellationToken = default) {
		var query =
			from u in _dbContext.User
			where u.EmailVerifyToken == token
			select u;

		return await query.FirstOrDefaultAsync(cancellationToken);
	}

	public async Task<User?> GetUserByPasswordResetTokenAsync(string token, CancellationToken cancellationToken = default) {
		var query =
			from u in _dbContext.User
			where u.PasswordResetToken == token
			select u;

		return await query.FirstOrDefaultAsync(cancellationToken);
	}

	public async Task<StaffUserData?> GetStaffUserUserByIdAsync(
		Guid userId,
		CancellationToken cancellationToken = default
	) {
		// NOTE: We intentionally do NOT filter out suspended staff users here.
		// Staff must be able to view a suspended user to be able to reactivate them
		// (and to audit "who is suspended and why"). Soft-deleted records remain hidden.
		return await FindLiveStaffUserAsync(userId, cancellationToken);
	}

	public async Task<SuspendStaffUserResult> SuspendStaffUserAsync(
		Guid userId,
		CancellationToken cancellationToken = default
	) {
		// Suspension for staff users is a global identity suspension (User.Status).
		// This mirrors the tenant suspend/reactivate semantics: the staff UserAccount
		// is still present, but the user can no longer authenticate/use staff routes.
		var userData = await FindLiveStaffUserAsync(userId, cancellationToken);
		if (userData is null) {
			return new SuspendStaffUserResult.NotFound();
		}

		if (userData.User.IsSuspended()) {
			return new SuspendStaffUserResult.AlreadySuspended();
		}

		var now = DateTime.UtcNow;
		var updatedUserCount = await BuildLiveStaffUserMutationQuery(userId)
			.Where(x => x.Status != UserStatus.Suspended)
			.ExecuteUpdateAsync(
				setters => setters
					.SetProperty(x => x.Status, UserStatus.Suspended)
					.SetProperty(x => x.UpdatedAt, now),
				cancellationToken
			);

		if (updatedUserCount == 0) {
			return await ResolveSuspendStaffUserAfterNoRowsAsync(
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
		var userData = await FindLiveStaffUserAsync(userId, cancellationToken);
		if (userData is null) {
			return new ReactivateStaffUserResult.NotFound();
		}

		if (!userData.User.IsSuspended()) {
			return new ReactivateStaffUserResult.NotSuspended();
		}

		var now = DateTime.UtcNow;
		var updatedUserCount = await BuildLiveStaffUserMutationQuery(userId)
			.Where(x => x.Status == UserStatus.Suspended)
			.ExecuteUpdateAsync(
				setters => setters
					.SetProperty(x => x.Status, UserStatus.Active)
					.SetProperty(x => x.UpdatedAt, now),
				cancellationToken
			);

		if (updatedUserCount == 0) {
			return await ResolveReactivateStaffUserAfterNoRowsAsync(
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

		var liveUserStatuses = await FindLiveStaffUserStatusesAsync(
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
			var updatedUserCount = await BuildLiveStaffUserMutationQuery(userId)
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

			var resolvedResult = await ResolveSuspendStaffUserAfterNoRowsAsync(
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

		var liveUserStatuses = await FindLiveStaffUserStatusesAsync(
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
			var updatedUserCount = await BuildLiveStaffUserMutationQuery(userId)
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

			var resolvedResult = await ResolveReactivateStaffUserAfterNoRowsAsync(
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

	public async Task<DeleteStaffUserResult> DeleteStaffUserAsync(
		Guid userId,
		CancellationToken cancellationToken = default
	) {
		var target = await FindLiveStaffUserDeleteTargetAsync(
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
		await using var transaction = await _dbContext.Database.BeginTransactionAsync(
			cancellationToken
		);

		var deletedUserCount = await BuildLiveStaffUserMutationQuery(userId)
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
			return await ResolveDeleteStaffUserAfterNoRowsAsync(
				userId,
				cancellationToken
			);
		}

		var deletedUserAccountCount = await _dbContext.UserAccount
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

		await _dbContext.UserAccountProfile
			.Where(x => x.UserAccountId == target.UserAccountId && !x.IsDeleted)
			.ExecuteUpdateAsync(
				setters => setters
					.SetProperty(x => x.IsDeleted, true)
					.SetProperty(x => x.DeletedAt, now)
					.SetProperty(x => x.UpdatedAt, now),
				cancellationToken
			);

		await transaction.CommitAsync(cancellationToken);

		return new DeleteStaffUserResult.Success(
			target.UserData,
			target.UserAccountId
		);
	}

	private IQueryable<StaffUserData> BuildLiveStaffUserQuery(Guid userId) {
		return
			from ua in _dbContext.UserAccount.AsNoTracking()
			where ua.UserId == userId
				&& ua.Scope == AccountScope.Staff
				&& !ua.IsDeleted
				&& !ua.User.IsDeleted
			select new StaffUserData {
				User = ua.User,
				AccountLevel = ua.Level
			};
	}

	private IQueryable<User> BuildLiveStaffUserMutationQuery(Guid userId) {
		return _dbContext.User.Where(u =>
			u.Id == userId
			&& !u.IsDeleted
			&& _dbContext.UserAccount.Any(ua =>
				ua.UserId == u.Id
				&& ua.Scope == AccountScope.Staff
				&& !ua.IsDeleted
			)
		);
	}

	private async Task<StaffUserData?> FindLiveStaffUserAsync(
		Guid userId,
		CancellationToken cancellationToken
	) {
		return await BuildLiveStaffUserQuery(userId)
			.FirstOrDefaultAsync(cancellationToken);
	}

	private async Task<LiveStaffUserDeleteTarget?> FindLiveStaffUserDeleteTargetAsync(
		Guid userId,
		CancellationToken cancellationToken
	) {
		return await (
			from ua in _dbContext.UserAccount.AsNoTracking()
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

	private async Task<Dictionary<Guid, UserStatus>> FindLiveStaffUserStatusesAsync(
		IReadOnlyCollection<Guid> userIds,
		CancellationToken cancellationToken
	) {
		return await (
			from ua in _dbContext.UserAccount.AsNoTracking()
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

	private async Task<SuspendStaffUserResult> ResolveSuspendStaffUserAfterNoRowsAsync(
		Guid userId,
		CancellationToken cancellationToken
	) {
		var currentUserData = await FindLiveStaffUserAsync(userId, cancellationToken);
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

	private async Task<ReactivateStaffUserResult> ResolveReactivateStaffUserAfterNoRowsAsync(
		Guid userId,
		CancellationToken cancellationToken
	) {
		var currentUserData = await FindLiveStaffUserAsync(userId, cancellationToken);
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

	private async Task<DeleteStaffUserResult> ResolveDeleteStaffUserAfterNoRowsAsync(
		Guid userId,
		CancellationToken cancellationToken
	) {
		var currentUserData = await FindLiveStaffUserAsync(userId, cancellationToken);
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

	private async Task<UserAccount?> LockLiveStaffUserAccountForProfileUpdateAsync(
		Guid userId,
		Guid staffAccountId,
		CancellationToken cancellationToken
	) {
		// Hold the staff-account row lock until commit so a concurrent delete cannot
		// soft-delete the account while missing this transaction's uncommitted links.
		// If delete arrives after we hold this lock, it serializes behind us and cleans
		// up the committed links once the lock is released.
		return await _dbContext.UserAccount
			.FromSqlInterpolated($"""
				SELECT ua.*
				FROM user_accounts AS ua
				JOIN users AS u
					ON u.id = ua.user_id
				WHERE ua.id = {staffAccountId}
					AND ua.user_id = {userId}
					AND ua.scope = {(int)AccountScope.Staff}
					AND NOT ua.is_deleted
					AND NOT u.is_deleted
				FOR UPDATE OF ua
				""")
			.AsNoTracking()
			.SingleOrDefaultAsync(cancellationToken);
	}

	private sealed class LiveStaffUserDeleteTarget {
		public required Guid UserAccountId { get; init; }
		public required StaffUserData UserData { get; init; }
	}

	public async Task<UpdateStaffUserEmailResult> UpdateStaffUserEmailAsync(
		Guid userId,
		string email,
		CancellationToken cancellationToken = default
	) {
		// Email change is a high-risk identity operation (affects sign-in).
		// We keep it on a dedicated service method (and endpoint) so the API can enforce
		// stricter validation/permission and clients cannot "accidentally" update email via PATCH.
		var normalizedEmail = email.Trim().ToLowerInvariant();

		var query =
			from ua in _dbContext.UserAccount
			where ua.UserId == userId
				&& ua.Scope == AccountScope.Staff
				&& !ua.IsDeleted
				&& !ua.User.IsDeleted
			select new StaffUserData { User = ua.User, AccountLevel = ua.Level };

		var userData = await query.FirstOrDefaultAsync(cancellationToken);
		if (userData is null) {
			return new UpdateStaffUserEmailResult.NotFound();
		}

		if (!string.Equals(userData.User.Email, normalizedEmail, StringComparison.Ordinal)) {
			var existing = await GetUserByEmailAsync(normalizedEmail, cancellationToken);
			if (existing is not null && existing.GetRequiredId() != userId) {
				return new UpdateStaffUserEmailResult.EmailAlreadyInUse();
			}

			userData.User.Email = normalizedEmail;
			await _dbContext.SaveChangesAsync(cancellationToken);
		}

		return new UpdateStaffUserEmailResult.Success(userData);
	}

	public async Task<int> CountStaffUsersAsync(CancellationToken cancellationToken = default) {
		// For staff admin screens, we count all staff users (including suspended) so staff can
		// see who exists even if they are currently suspended. Soft-deleted records stay hidden.
		var query =
			from ua in _dbContext.UserAccount
			where ua.Scope == AccountScope.Staff
				&& !ua.IsDeleted
				&& !ua.User.IsDeleted
			select ua.User;
		return await query.CountAsync(cancellationToken);
	}

	public async Task<FindStaffUsersResult> FindStaffUsersAsync(
		FindStaffUsersArgs args,
		CancellationToken cancellationToken = default
	) {
		// Staff discovery intentionally includes suspended users so admins can
		// search, audit, and reactivate them from the same list.
		var effectiveLimit = args.Limit ?? AppEnvironment.Instance.PAGINATION_DEFAULT_LIMIT;
		var effectiveSortId = args.SortId ?? "created_at";
		var effectiveSortOrder = args.SortOrder ?? SortOrder.Desc;
		var isAsc = effectiveSortOrder == SortOrder.Asc;

		var sortFieldHandlers = new Dictionary<string, SortFieldHandler>(
			StringComparer.OrdinalIgnoreCase
		) {
			["created_at"] = new SortFieldHandler(
				getCursorValue: async guid => {
					var item =
						await (
							from ua in _dbContext.UserAccount
							where ua.UserId == guid
								&& ua.Scope == AccountScope.Staff
								&& !ua.IsDeleted
								&& !ua.User.IsDeleted
							select new {
								ua.User.CreatedAt,
								ua.UserId,
							}
						).FirstOrDefaultAsync(cancellationToken);
					return item is not null
						? (item.CreatedAt, item.UserId)
						: null;
				},
				applyFilter: (q, cursorValue, asc) => {
					if (cursorValue is null) {
						return q;
					}

					var (cursorCreatedAt, cursorId) = ((DateTime, Guid))cursorValue;
					return asc
						? from ua in q
							where ua.User.CreatedAt > cursorCreatedAt
								|| (ua.User.CreatedAt == cursorCreatedAt
									&& ua.UserId > cursorId)
							select ua
						: from ua in q
							where ua.User.CreatedAt < cursorCreatedAt
								|| (ua.User.CreatedAt == cursorCreatedAt
									&& ua.UserId < cursorId)
							select ua;
				},
				applyOrdering: (q, asc) => asc
					? from ua in q
						orderby ua.User.CreatedAt, ua.UserId
						select ua
					: from ua in q
						orderby ua.User.CreatedAt descending, ua.UserId descending
						select ua
			),
			["updated_at"] = new SortFieldHandler(
				getCursorValue: async guid => {
					var item =
						await (
							from ua in _dbContext.UserAccount
							where ua.UserId == guid
								&& ua.Scope == AccountScope.Staff
								&& !ua.IsDeleted
								&& !ua.User.IsDeleted
							select new {
								ua.User.UpdatedAt,
								ua.UserId,
							}
						).FirstOrDefaultAsync(cancellationToken);
					return item is not null
						? (item.UpdatedAt, item.UserId)
						: null;
				},
				applyFilter: (q, cursorValue, asc) => {
					if (cursorValue is null) {
						return q;
					}

					var (cursorUpdatedAt, cursorId) = ((DateTime, Guid))cursorValue;
					return asc
						? from ua in q
							where ua.User.UpdatedAt > cursorUpdatedAt
								|| (ua.User.UpdatedAt == cursorUpdatedAt
									&& ua.UserId > cursorId)
							select ua
						: from ua in q
							where ua.User.UpdatedAt < cursorUpdatedAt
								|| (ua.User.UpdatedAt == cursorUpdatedAt
									&& ua.UserId < cursorId)
							select ua;
				},
				applyOrdering: (q, asc) => asc
					? from ua in q
						orderby ua.User.UpdatedAt, ua.UserId
						select ua
					: from ua in q
						orderby ua.User.UpdatedAt descending, ua.UserId descending
						select ua
			),
			["email"] = new SortFieldHandler(
				getCursorValue: async guid => {
					var item =
						await (
							from ua in _dbContext.UserAccount
							where ua.UserId == guid
								&& ua.Scope == AccountScope.Staff
								&& !ua.IsDeleted
								&& !ua.User.IsDeleted
							select new {
								ua.User.Email,
								ua.UserId,
							}
						).FirstOrDefaultAsync(cancellationToken);
					return item is not null
						? (item.Email, item.UserId)
						: null;
				},
				applyFilter: (q, cursorValue, asc) => {
					if (cursorValue is null) {
						return q;
					}

					var (cursorEmail, cursorId) = ((string, Guid))cursorValue;
					return asc
						? from ua in q
							where ua.User.Email.CompareTo(cursorEmail) > 0
								|| (ua.User.Email == cursorEmail && ua.UserId > cursorId)
							select ua
						: from ua in q
							where ua.User.Email.CompareTo(cursorEmail) < 0
								|| (ua.User.Email == cursorEmail && ua.UserId < cursorId)
							select ua;
				},
				applyOrdering: (q, asc) => asc
					? from ua in q
						orderby ua.User.Email, ua.UserId
						select ua
					: from ua in q
						orderby ua.User.Email descending, ua.UserId descending
						select ua
			),
			["first_name"] = new SortFieldHandler(
				getCursorValue: async guid => {
					var item =
						await (
							from ua in _dbContext.UserAccount
							where ua.UserId == guid
								&& ua.Scope == AccountScope.Staff
								&& !ua.IsDeleted
								&& !ua.User.IsDeleted
							select new {
								FirstName = ua.User.FirstName ?? string.Empty,
								ua.UserId,
							}
						).FirstOrDefaultAsync(cancellationToken);
					return item is not null
						? (item.FirstName, item.UserId)
						: null;
				},
				applyFilter: (q, cursorValue, asc) => {
					if (cursorValue is null) {
						return q;
					}

					var (cursorFirstName, cursorId) = ((string, Guid))cursorValue;
					return asc
						? from ua in q
							let firstName = ua.User.FirstName ?? string.Empty
							where firstName.CompareTo(cursorFirstName) > 0
								|| (firstName == cursorFirstName && ua.UserId > cursorId)
							select ua
						: from ua in q
							let firstName = ua.User.FirstName ?? string.Empty
							where firstName.CompareTo(cursorFirstName) < 0
								|| (firstName == cursorFirstName && ua.UserId < cursorId)
							select ua;
				},
				applyOrdering: (q, asc) => asc
					? from ua in q
						let firstName = ua.User.FirstName ?? string.Empty
						orderby firstName, ua.UserId
						select ua
					: from ua in q
						let firstName = ua.User.FirstName ?? string.Empty
						orderby firstName descending, ua.UserId descending
						select ua
			),
			["last_name"] = new SortFieldHandler(
				getCursorValue: async guid => {
					var item =
						await (
							from ua in _dbContext.UserAccount
							where ua.UserId == guid
								&& ua.Scope == AccountScope.Staff
								&& !ua.IsDeleted
								&& !ua.User.IsDeleted
							select new {
								LastName = ua.User.LastName ?? string.Empty,
								ua.UserId,
							}
						).FirstOrDefaultAsync(cancellationToken);
					return item is not null
						? (item.LastName, item.UserId)
						: null;
				},
				applyFilter: (q, cursorValue, asc) => {
					if (cursorValue is null) {
						return q;
					}

					var (cursorLastName, cursorId) = ((string, Guid))cursorValue;
					return asc
						? from ua in q
							let lastName = ua.User.LastName ?? string.Empty
							where lastName.CompareTo(cursorLastName) > 0
								|| (lastName == cursorLastName && ua.UserId > cursorId)
							select ua
						: from ua in q
							let lastName = ua.User.LastName ?? string.Empty
							where lastName.CompareTo(cursorLastName) < 0
								|| (lastName == cursorLastName && ua.UserId < cursorId)
							select ua;
				},
				applyOrdering: (q, asc) => asc
					? from ua in q
						let lastName = ua.User.LastName ?? string.Empty
						orderby lastName, ua.UserId
						select ua
					: from ua in q
						let lastName = ua.User.LastName ?? string.Empty
						orderby lastName descending, ua.UserId descending
						select ua
			),
			["status"] = new SortFieldHandler(
				getCursorValue: async guid => {
					var item =
						await (
							from ua in _dbContext.UserAccount
							where ua.UserId == guid
								&& ua.Scope == AccountScope.Staff
								&& !ua.IsDeleted
								&& !ua.User.IsDeleted
							select new {
								ua.User.Status,
								ua.UserId,
							}
						).FirstOrDefaultAsync(cancellationToken);
					return item is not null
						? (item.Status, item.UserId)
						: null;
				},
				applyFilter: (q, cursorValue, asc) => {
					if (cursorValue is null) {
						return q;
					}

					var (cursorStatus, cursorId) = ((UserStatus, Guid))cursorValue;
					return asc
						? from ua in q
							where ua.User.Status > cursorStatus
								|| (ua.User.Status == cursorStatus && ua.UserId > cursorId)
							select ua
						: from ua in q
							where ua.User.Status < cursorStatus
								|| (ua.User.Status == cursorStatus && ua.UserId < cursorId)
							select ua;
				},
				applyOrdering: (q, asc) => asc
					? from ua in q
						orderby ua.User.Status, ua.UserId
						select ua
					: from ua in q
						orderby ua.User.Status descending, ua.UserId descending
						select ua
			),
			["level"] = new SortFieldHandler(
				getCursorValue: async guid => {
					var item =
						await (
							from ua in _dbContext.UserAccount
							where ua.UserId == guid
								&& ua.Scope == AccountScope.Staff
								&& !ua.IsDeleted
								&& !ua.User.IsDeleted
							select new {
								ua.Level,
								ua.UserId,
							}
						).FirstOrDefaultAsync(cancellationToken);
					return item is not null
						? (item.Level, item.UserId)
						: null;
				},
				applyFilter: (q, cursorValue, asc) => {
					if (cursorValue is null) {
						return q;
					}

					var (cursorLevel, cursorId) = ((AccountLevel, Guid))cursorValue;
					return asc
						? from ua in q
							where ua.Level > cursorLevel
								|| (ua.Level == cursorLevel && ua.UserId > cursorId)
							select ua
						: from ua in q
							where ua.Level < cursorLevel
								|| (ua.Level == cursorLevel && ua.UserId < cursorId)
							select ua;
				},
				applyOrdering: (q, asc) => asc
					? from ua in q
						orderby ua.Level, ua.UserId
						select ua
					: from ua in q
						orderby ua.Level descending, ua.UserId descending
						select ua
			),
		};

		if (
			!sortFieldHandlers.TryGetValue(
				effectiveSortId,
				out SortFieldHandler? handler
			)
		) {
			return new FindStaffUsersResult.InvalidSortId(
				effectiveSortId
			);
		}

		var baseQuery =
			from ua in _dbContext.UserAccount
			where ua.Scope == AccountScope.Staff
				&& !ua.IsDeleted
				&& !ua.User.IsDeleted
			select ua;

		IQueryable<UserAccount> query = baseQuery;

		if (args.Filters?.Search is { } search) {
			var trimmed = search.Trim();
			if (trimmed.Length > 0) {
				// Search is intentionally substring-based so staff can quickly find
				// records by partial email or name fragments.
				var pattern = $"%{trimmed}%";
				query =
					from ua in query
					where (ua.User.FirstName != null && EF.Functions.ILike(ua.User.FirstName, pattern))
						|| (ua.User.LastName != null && EF.Functions.ILike(ua.User.LastName, pattern))
						|| EF.Functions.ILike(ua.User.Email, pattern)
					select ua;
			}
		}

		if (args.Filters?.Status is { Count: > 0 } statuses) {
			query =
				from ua in query
				where statuses.Contains(ua.User.Status)
				select ua;
		}

		if (args.Cursor != Guid.Empty) {
			var cursorValue = await handler.GetCursorValue(args.Cursor);
			if (cursorValue is null) {
				return new FindStaffUsersResult.CursorNotFound(
					args.Cursor.ToString()
				);
			}

			query = handler.ApplyFilter(query, cursorValue, isAsc);
		}

		var orderedQuery = handler.ApplyOrdering(query, isAsc);
		var results = await (
			from ua in orderedQuery
			select new StaffUserData {
				User = ua.User,
				AccountLevel = ua.Level
			}
		)
			.Take(effectiveLimit + 1)
			.ToListAsync(cancellationToken);

		string? nextCursor = null;
		if (results.Count > effectiveLimit) {
			// Fetch one extra row so we can emit the next cursor without a separate count query.
			results.RemoveAt(results.Count - 1);
			nextCursor = results.Last().User.GetRequiredId().ToString();
		}

		return new FindStaffUsersResult.Success(
			new CursorPaginatedResult<StaffUserData> {
				Data = results,
				NextCursor = nextCursor,
			}
		);
	}

	public async Task<StaffUserProfilesSummary?> GetStaffUserProfilesAsync(
		Guid userId,
		CancellationToken cancellationToken = default
	) {
		// Resolve the staff UserAccount ID for the given User ID.
		// IMPORTANT:
		// This endpoint backs the staff-user details UI. We still want the page to render for
		// suspended users (view-only), so we DO NOT filter on suspension here. Suspension affects
		// authentication and action availability, not whether the record exists.
		var staffAccountId = await (
			from ua in _dbContext.UserAccount
			where ua.UserId == userId
				&& ua.Scope == AccountScope.Staff
				&& !ua.IsDeleted
				&& !ua.User.IsDeleted
			select ua.Id
		).FirstOrDefaultAsync(cancellationToken);

		// NOTE: ua.Id is nullable in the model (Guid?) so FirstOrDefault can yield null/empty.
		if (staffAccountId is null || staffAccountId.Value == Guid.Empty) {
			return null;
		}

		// Load currently assigned staff profiles (via the junction table).
		// We filter out deleted links and deleted profiles and enforce staff-scope profiles only.
		var assignedProfilesRaw = await (
			from uap in _dbContext.UserAccountProfile
			join p in _dbContext.Profile on uap.ProfileId equals p.Id
			where uap.UserAccountId == staffAccountId.Value
				&& !uap.IsDeleted
				&& !p.IsDeleted
				&& p.Scope == ProfileScope.Staff
			select new { p.Id, p.Name, p.Description }
		).ToListAsync(cancellationToken);

		var assignedProfiles = assignedProfilesRaw
			.Select(p => new StaffUserProfileSummary(
				p.Id ?? throw new InvalidOperationException("Profile id is null"),
				p.Name,
				p.Description
			))
			.ToList();

		// We intentionally do NOT return "available profiles" here.
		// Returning the full universe can grow unbounded and becomes a performance smell.
		// The UI should fetch candidates via `FindStaffProfiles` with `search=...`.
		return new StaffUserProfilesSummary(AssignedProfiles: assignedProfiles);
	}

	public async Task<UpdateStaffUserProfilesServiceResult> UpdateStaffUserProfilesAsync(
		Guid userId,
		List<Guid> profileIds,
		CancellationToken cancellationToken = default
	) {
		// Resolve the staff UserAccount ID for the given User ID.
		// NOTE:
		// We intentionally allow profile maintenance even if the target staff user is suspended.
		// Suspending a user should block login and disable UI actions for that user, but staff
		// administrators may still need to update profile assignment for cleanup or future reactivation.
		var staffAccountId = await (
			from ua in _dbContext.UserAccount
			where ua.UserId == userId
				&& ua.Scope == AccountScope.Staff
				&& !ua.IsDeleted
				&& !ua.User.IsDeleted
			select ua.Id
		).FirstOrDefaultAsync(cancellationToken);

		if (staffAccountId is null || staffAccountId.Value == Guid.Empty) {
			return new UpdateStaffUserProfilesServiceResult.UserNotFound();
		}

		// Profile.Id is nullable (Guid?) in the EF model, so we convert our requested IDs to
		// nullable IDs to keep the LINQ query fully translatable by EF.
		var profileIdsNullable = profileIds.Select(id => (Guid?)id).ToList();

		// Load all requested profiles in a single query.
		// We only select the fields we need to validate and to return the updated assignment.
		var requestedProfiles = await (
			from p in _dbContext.Profile
			where profileIdsNullable.Contains(p.Id)
				&& !p.IsDeleted
			select new {
				p.Id,
				p.Scope,
				p.Name,
				p.Description,
			}
		).ToListAsync(cancellationToken);

		// Validate: every requested ID must exist.
		var existingIds = new List<Guid>();
		foreach (var profile in requestedProfiles) {
			var id = profile.Id;
			if (id is not null) {
				existingIds.Add(id.Value);
			}
		}
		var missingIds = profileIds.Except(existingIds).ToList();
		if (missingIds.Count > 0) {
			return new UpdateStaffUserProfilesServiceResult.ProfilesNotFound(missingIds);
		}

		// Validate: all requested profiles must be staff-scope (we never attach tenant profiles to staff accounts).
		var nonStaffIds = new List<Guid>();
		foreach (var profile in requestedProfiles) {
			var id = profile.Id;
			if (id is not null && profile.Scope != ProfileScope.Staff) {
				nonStaffIds.Add(id.Value);
			}
		}
		if (nonStaffIds.Count > 0) {
			return new UpdateStaffUserProfilesServiceResult.ProfilesNotStaffScope(nonStaffIds);
		}

		await using var transaction = await _dbContext.Database.BeginTransactionAsync(
			cancellationToken
		);
		// This is intentional commit-order serialization: if profile update acquires the
		// live staff-account lock and commits first, it returns Success. A concurrent
		// delete blocks on the same account row and then sweeps these committed links.
		var lockedStaffAccount =
			await LockLiveStaffUserAccountForProfileUpdateAsync(
				userId,
				staffAccountId.Value,
				cancellationToken
			);

		if (lockedStaffAccount is null) {
			await transaction.RollbackAsync(cancellationToken);
			return new UpdateStaffUserProfilesServiceResult.UserNotFound();
		}

		var lockedStaffAccountId = lockedStaffAccount.GetRequiredId();

		// "Replace set" semantics for a junction table that uses soft-delete:
		// - remove links that are currently assigned but not in the new set
		// - add links that are in the new set but not currently assigned
		//
		// IMPORTANT:
		// `user_account_profiles` has a unique constraint on (UserAccountId, ProfileId).
		// If we soft-delete a link, inserting the same pair later will violate the constraint.
		// So we:
		// - hard-delete links we remove (ForceHardDeleteRange), and
		// - when re-adding a previously soft-deleted link, we "undelete" it instead of inserting.
		var existingLinks = await (
			from uap in _dbContext.UserAccountProfile
			where uap.UserAccountId == lockedStaffAccountId
			select uap
		).ToListAsync(cancellationToken);

		var existingLinksByProfileId = existingLinks
			.ToDictionary(x => x.ProfileId, x => x);

		var activeProfileIds = existingLinks
			.Where(x => !x.IsDeleted)
			.Select(x => x.ProfileId)
			.ToHashSet();

		var desiredProfileIds = profileIds.Distinct().ToList();

		var linksToRemove = existingLinks
			.Where(x => !x.IsDeleted && !desiredProfileIds.Contains(x.ProfileId))
			.ToList();

		if (linksToRemove.Count > 0) {
			// Force hard delete to avoid leaving rows that would block future re-adds due to the unique constraint.
			_dbContext.ForceHardDeleteRange(linksToRemove);
		}

		var toAddIds = desiredProfileIds
			.Where(id => !activeProfileIds.Contains(id))
			.ToList();

		var linksToInsert = new List<UserAccountProfile>();
		foreach (var profileId in toAddIds) {
			if (existingLinksByProfileId.TryGetValue(profileId, out var existingLink)) {
				if (existingLink.IsDeleted) {
					// "Undelete" to satisfy the uniqueness constraint on (UserAccountId, ProfileId).
					existingLink.IsDeleted = false;
					existingLink.DeletedAt = null;
				}
				continue;
			}

			linksToInsert.Add(new UserAccountProfile {
				UserAccountId = lockedStaffAccountId,
				ProfileId = profileId
			});
		}

		if (linksToInsert.Count > 0) {
			await _dbContext.UserAccountProfile.AddRangeAsync(linksToInsert, cancellationToken);
		}

		try {
			await _dbContext.SaveChangesAsync(cancellationToken);
			await transaction.CommitAsync(cancellationToken);
		} catch {
			await transaction.RollbackAsync(cancellationToken);
			throw;
		}

		// Build the result from requestedProfiles in-memory to avoid re-query-ing.
		// We also preserve the request order (profileIds) for a stable client experience.
		var assignedMap = new Dictionary<Guid, StaffUserProfileSummary>();
		foreach (var profile in requestedProfiles) {
			var id = profile.Id;
			if (id is null) {
				throw new InvalidOperationException(
					"Profile id is null after query filter"
				);
			}

			assignedMap[id.Value] = new StaffUserProfileSummary(
				id.Value,
				profile.Name,
				profile.Description
			);
		}

		var assigned = desiredProfileIds
			.Where(assignedMap.ContainsKey)
			.Select(id => assignedMap[id])
			.ToList();

		return new UpdateStaffUserProfilesServiceResult.Success(assigned);
	}

	public async Task<FindTenantUsersResult>
	FindTenantUsersAsync(
		Guid tenantId,
		FindTenantUsersAsStaffArgs args,
		CancellationToken cancellationToken = default
	) {
		var effectiveLimit = args.Limit
			?? AppEnvironment.Instance.PAGINATION_DEFAULT_LIMIT;
		var effectiveSortOrder = args.SortOrder ?? SortOrder.Desc;
		var effectiveSortId = args.SortId ?? "id";

		var sortFieldHandlers =
			new Dictionary<string, SortFieldHandler>(
				StringComparer.OrdinalIgnoreCase
			) {
				["id"] = new SortFieldHandler(
					getCursorValue: async (guid) => {
						var ua = await (
							from x in _dbContext.UserAccount
							where x.UserId == guid
								&& x.TenantId == tenantId
								&& x.Scope
									== AccountScope.Tenant
							select (Guid?)x.UserId
						).FirstOrDefaultAsync(
							cancellationToken
						);
						return ua;
					},
					applyFilter: (q, val, isAsc) => {
						var id = (Guid?)val;
						if (id is null) {
							return q;
						}
						return isAsc
							? q.Where(x => x.UserId > id)
							: q.Where(x => x.UserId < id);
					},
					applyOrdering: (q, isAsc) => isAsc
						? q.OrderBy(x => x.UserId)
						: q.OrderByDescending(
							x => x.UserId
						)
				),

				["email"] = new SortFieldHandler(
					getCursorValue: async (guid) => {
						var item = await (
							from x in _dbContext.UserAccount
							where x.UserId == guid
								&& x.TenantId == tenantId
								&& x.Scope
									== AccountScope.Tenant
							select new {
								x.User.Email,
								x.UserId,
							}
						).FirstOrDefaultAsync(
							cancellationToken
						);
						return item is not null
							? (item.Email, item.UserId)
							: null;
					},
					applyFilter: (q, val, isAsc) => {
						if (val is null) {
							return q;
						}
						var (email, id) =
							((string, Guid))val;
						return isAsc
							? q.Where(x =>
								x.User.Email
									.CompareTo(
										email
									) > 0
								|| (x.User.Email == email
									&& x.UserId > id))
							: q.Where(x =>
								x.User.Email
									.CompareTo(
										email
									) < 0
								|| (x.User.Email == email
									&& x.UserId < id));
					},
					applyOrdering: (q, isAsc) => isAsc
						? q.OrderBy(x => x.User.Email)
							.ThenBy(x => x.UserId)
						: q.OrderByDescending(
							x => x.User.Email
						).ThenByDescending(
							x => x.UserId
						)
				),

				["status"] = new SortFieldHandler(
					getCursorValue: async (guid) => {
						var item = await (
							from x in _dbContext.UserAccount
							where x.UserId == guid
								&& x.TenantId == tenantId
								&& x.Scope
									== AccountScope.Tenant
							select new {
								IsUserGloballySuspended = x.User.Status == UserStatus.Suspended,
								IsMembershipSuspended = x.Status == AccountStatus.Suspended,
								x.UserId,
							}
						).FirstOrDefaultAsync(
							cancellationToken
						);
						return item is not null
							? (
								GetTenantUserStatusRank(
									item.IsUserGloballySuspended,
									item.IsMembershipSuspended
								),
								item.UserId
							)
							: null;
					},
					applyFilter: (q, val, isAsc) => {
						if (val is null) {
							return q;
						}
						var (statusRank, id) =
							((int, Guid))val;
						// Keep this expression EF-translatable; do not call GetTenantStatus() here.
						return isAsc
							? q.Where(x =>
								(x.User.Status == UserStatus.Suspended
									? 2
									: x.Status == AccountStatus.Suspended
										? 1
										: 0) > statusRank
								|| (((x.User.Status == UserStatus.Suspended
										? 2
										: x.Status == AccountStatus.Suspended
											? 1
											: 0)
										== statusRank)
									&& x.UserId > id))
							: q.Where(x =>
								(x.User.Status == UserStatus.Suspended
									? 2
									: x.Status == AccountStatus.Suspended
										? 1
										: 0) < statusRank
								|| (((x.User.Status == UserStatus.Suspended
										? 2
										: x.Status == AccountStatus.Suspended
											? 1
											: 0)
										== statusRank)
									&& x.UserId < id));
					},
					// Same EF-translatable rank expression as applyFilter for stable keyset pagination.
					applyOrdering: (q, isAsc) => isAsc
						? q.OrderBy(
							x => x.User.Status == UserStatus.Suspended
								? 2
								: x.Status == AccountStatus.Suspended
									? 1
									: 0
						).ThenBy(x => x.UserId)
						: q.OrderByDescending(
							x => x.User.Status == UserStatus.Suspended
								? 2
								: x.Status == AccountStatus.Suspended
									? 1
									: 0
						).ThenByDescending(
							x => x.UserId
						)
				),

				["level"] = new SortFieldHandler(
					getCursorValue: async (guid) => {
						var item = await (
							from x in _dbContext.UserAccount
							where x.UserId == guid
								&& x.TenantId == tenantId
								&& x.Scope
									== AccountScope.Tenant
							select new {
								x.Level,
								x.UserId,
							}
						).FirstOrDefaultAsync(
							cancellationToken
						);
						return item is not null
							? (item.Level, item.UserId)
							: null;
					},
					applyFilter: (q, val, isAsc) => {
						if (val is null) {
							return q;
						}
						var (level, id) =
							((AccountLevel, Guid))val;
						return isAsc
							? q.Where(x =>
								x.Level > level
								|| (x.Level == level
									&& x.UserId > id))
							: q.Where(x =>
								x.Level < level
								|| (x.Level == level
									&& x.UserId < id));
					},
					applyOrdering: (q, isAsc) => isAsc
						? q.OrderBy(
							x => x.Level
						).ThenBy(x => x.UserId)
						: q.OrderByDescending(
							x => x.Level
						).ThenByDescending(
							x => x.UserId
						)
				),

				["created_at"] = new SortFieldHandler(
					getCursorValue: async (guid) => {
						var item = await (
							from x in _dbContext.UserAccount
							where x.UserId == guid
								&& x.TenantId == tenantId
								&& x.Scope
									== AccountScope.Tenant
							select new {
								x.User.CreatedAt,
								x.UserId,
							}
						).FirstOrDefaultAsync(
							cancellationToken
						);
						return item is not null
							? (item.CreatedAt, item.UserId)
							: null;
					},
					applyFilter: (q, val, isAsc) => {
						if (val is null) {
							return q;
						}
						var (createdAt, id) =
							((DateTime, Guid))val;
						return isAsc
							? q.Where(x =>
								x.User.CreatedAt
									> createdAt
								|| (x.User.CreatedAt
										== createdAt
									&& x.UserId > id))
							: q.Where(x =>
								x.User.CreatedAt
									< createdAt
								|| (x.User.CreatedAt
										== createdAt
									&& x.UserId < id));
					},
					applyOrdering: (q, isAsc) => isAsc
						? q.OrderBy(
							x => x.User.CreatedAt
						).ThenBy(x => x.UserId)
						: q.OrderByDescending(
							x => x.User.CreatedAt
						).ThenByDescending(
							x => x.UserId
						)
				),
			};

		if (
			!sortFieldHandlers.TryGetValue(
				effectiveSortId,
				out SortFieldHandler? handler
			)
		) {
			return new FindTenantUsersResult.InvalidSortId(
				effectiveSortId
			);
		}

		var baseQuery =
			from ua in _dbContext.UserAccount
			where ua.TenantId == tenantId
				&& ua.Scope == AccountScope.Tenant
				&& !ua.IsDeleted
				&& !ua.User.IsDeleted
			select ua;

		IQueryable<UserAccount> query = baseQuery;

		// Apply search filter (by name or email)
		// Search semantics: substring match (ILIKE %q%) for case-insensitive search
		if (args.Filters?.Search is { } search) {
			var effectiveQ = search.Trim();
			var pattern = $"%{effectiveQ}%";
			query = query.Where(ua =>
				(ua.User.FirstName != null && EF.Functions.ILike(ua.User.FirstName, pattern)) ||
				(ua.User.LastName != null && EF.Functions.ILike(ua.User.LastName, pattern)) ||
				EF.Functions.ILike(ua.User.Email, pattern)
			);
		}

		// Apply status filter
		if (args.Filters?.Status is { } statuses && statuses.Count > 0) {
			var includesActive = statuses.Contains(TenantUserStatus.Active);
			var includesSuspended = statuses.Contains(TenantUserStatus.Suspended);
			var includesGloballySuspended = statuses.Contains(
				TenantUserStatus.GloballySuspended
			);

			query = query.Where(ua =>
				// These are effective tenant-user statuses, not only persisted account statuses.
				(includesGloballySuspended
					&& ua.User.Status == UserStatus.Suspended)
				|| (includesSuspended
					&& ua.User.Status != UserStatus.Suspended
					&& ua.Status == AccountStatus.Suspended)
				|| (includesActive
					&& ua.User.Status != UserStatus.Suspended
					&& ua.Status != AccountStatus.Suspended)
			);
		}

		if (args.Cursor != Guid.Empty) {
			var cursorValue =
				await handler.GetCursorValue(args.Cursor);

			if (cursorValue is null) {
				return new FindTenantUsersResult
					.CursorNotFound(args.Cursor.ToString());
			}

			query = handler.ApplyFilter(
				query,
				cursorValue,
				effectiveSortOrder == SortOrder.Asc
			);
		}

		var orderedQuery = handler.ApplyOrdering(
			query,
			effectiveSortOrder == SortOrder.Asc
		);

		var results = await orderedQuery
			.Select(ua => new TenantUserData {
				User = ua.User,
				Account = ua,
				AccountLevel = ua.Level,
			})
			.Take(effectiveLimit + 1)
			.ToListAsync(cancellationToken);

		string? nextCursor = null;
		if (results.Count > effectiveLimit) {
			results.RemoveAt(results.Count - 1);
			nextCursor = results.Last()
				.User.GetRequiredId().ToString();
		}

		return new FindTenantUsersResult.Success(
			new CursorPaginatedResult<TenantUserData> {
				Data = results,
				NextCursor = nextCursor,
			}
		);
	}

	public async Task<UpdateUserByIdResult> UpdateStaffUserByIdAsync(
		Guid userId,
		UpdateUserDocument document,
		CancellationToken cancellationToken = default
	) {
		await using var transaction = await _dbContext.Database.BeginTransactionAsync(cancellationToken);

		try {
			UserStatus? parsedStatus = null;
			if (document.Status.IsPresent && document.Status.Value is not null) {
				parsedStatus = User.ParseStatus(document.Status.Value);
			}

			var updatedCount = await _dbContext.User
				.Where(u => u.Id == userId)
				.ExecuteUpdateAsync(setters => setters
					.SetProperty(u => u.Email, u => document.Email ?? u.Email)
					.SetProperty(u => u.LastName, u => document.LastName.IsPresent ? document.LastName.Value : u.LastName)
					.SetProperty(u => u.FirstName, u => document.FirstName.IsPresent ? document.FirstName.Value : u.FirstName)
					.SetProperty(u => u.AvatarUrl, u => document.AvatarUrl.IsPresent ? document.AvatarUrl.Value : u.AvatarUrl)
					.SetProperty(u => u.Status,
						u => parsedStatus.HasValue
							? parsedStatus.Value
							: u.Status
					)
					.SetProperty(u => u.UpdatedAt, DateTime.UtcNow), cancellationToken);

			if (updatedCount == 0) {
				await transaction.RollbackAsync(cancellationToken);
				return new UpdateUserByIdResult.UserNotFound();
			}

			if (document.AccountLevel is not null) {
				var accountLevel = UserAccount.ParseLevel(document.AccountLevel);

				if (accountLevel is null) {
					await transaction.RollbackAsync(cancellationToken);
					throw new ArgumentException($"Invalid account level: '{document.AccountLevel}'");
				}

				var staffAccountCount = await _dbContext.UserAccount
					.CountAsync(ua => ua.UserId == userId && ua.Scope == AccountScope.Staff, cancellationToken);

				if (staffAccountCount == 0) {
					await transaction.RollbackAsync(cancellationToken);
					return new UpdateUserByIdResult.UserAccountNotFound();
				}

				if (staffAccountCount > 1) {
					await transaction.RollbackAsync(cancellationToken);
					throw new InvalidOperationException(
						$"Data integrity violation: User {userId} has {staffAccountCount} staff accounts"
					);
				}

				await _dbContext.UserAccount
					.Where(ua => ua.UserId == userId && ua.Scope == AccountScope.Staff)
					.ExecuteUpdateAsync(setters => setters
						.SetProperty(ua => ua.Level, accountLevel)
						.SetProperty(ua => ua.UpdatedAt, DateTime.UtcNow), cancellationToken);
			}

			await transaction.CommitAsync(cancellationToken);

			// Re-fetch updated user data to return
			var updatedUser = await (
				from ua in _dbContext.UserAccount
					.AsNoTracking()
				where ua.UserId == userId
					&& ua.Scope == AccountScope.Staff
					&& !ua.IsDeleted
				select new StaffUserData {
					User = ua.User,
					AccountLevel = ua.Level
				}
			).FirstOrDefaultAsync(cancellationToken);

			if (updatedUser is null) {
				throw new InvalidOperationException(
					"User not found after successful "
					+ "update. This indicates a data "
					+ "integrity issue."
				);
			}

			return new UpdateUserByIdResult.Success(
				updatedUser
			);
		} catch (Exception exception) {
			await transaction.RollbackAsync(cancellationToken);
			if (_logger.IsEnabled(LogLevel.Error)) {
				_logger.LogError(exception, "Failed to update staff member {UserId}", userId);
			}
			return new UpdateUserByIdResult.UpdateFailed(
				exception.Message
			);
		}
	}

	private class SortFieldHandler(
		Func<Guid, Task<object?>> getCursorValue,
		Func<
			IQueryable<UserAccount>,
			object?,
			bool,
			IQueryable<UserAccount>
		> applyFilter,
		Func<
			IQueryable<UserAccount>,
			bool,
			IQueryable<UserAccount>
		> applyOrdering
	) {
		public Func<Guid, Task<object?>>
			GetCursorValue { get; } = getCursorValue;

		public Func<
			IQueryable<UserAccount>,
			object?,
			bool,
			IQueryable<UserAccount>
		> ApplyFilter { get; } = applyFilter;

		public Func<
			IQueryable<UserAccount>,
			bool,
			IQueryable<UserAccount>
		> ApplyOrdering { get; } = applyOrdering;
	}

	private sealed record LiveStaffUserStatus {
		public required Guid UserId { get; init; }
		public required UserStatus Status { get; init; }
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
				var adminCount = await (
					from ua in _dbContext.UserAccount
					where ua.TenantId == tenantId
						&& ua.Scope == AccountScope.Tenant
						&& ua.Level == AccountLevel.Admin
						&& ua.Status != AccountStatus.Suspended
						&& !ua.IsDeleted
					select ua
				).CountAsync(cancellationToken);

				if (adminCount <= 1) {
					return new RemoveUserFromTenantResult.CannotRemoveLastAdmin();
				}
			}

			// Soft delete the user account
			userAccount.IsDeleted = true;
			userAccount.DeletedAt = DateTime.UtcNow;
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
				var adminCount = await (
					from ua in _dbContext.UserAccount
					where ua.TenantId == tenantId
						&& ua.Scope == AccountScope.Tenant
						&& ua.Level == AccountLevel.Admin
						&& ua.UserId != userId
						&& ua.Status != AccountStatus.Suspended
						&& !ua.IsDeleted
					select ua
				).CountAsync(cancellationToken);

				if (adminCount == 0) {
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
			var activeAdminCount = await (
				from ua in _dbContext.UserAccount
				where ua.TenantId == tenantId
					&& ua.Scope == AccountScope.Tenant
					&& ua.Level == AccountLevel.Admin
					&& !ua.IsDeleted
					&& ua.Status != AccountStatus.Suspended
				select ua
			).CountAsync(cancellationToken);

			if (activeAdminCount <= 1) {
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
