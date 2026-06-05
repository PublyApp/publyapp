using System.Data;

using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Modules.Users.Services;

public abstract record CreateUserResult {
	public sealed record Success(User User) : CreateUserResult;
	public sealed record UserAlreadyExists(User User) : CreateUserResult;
}






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





public class UpdateTenantUserIdentityDocument {
	public PatchField<string?> FirstName { get; set; } = PatchField<string?>.Absent();
	public PatchField<string?> LastName { get; set; } = PatchField<string?>.Absent();
	public PatchField<string?> AvatarUrl { get; set; } = PatchField<string?>.Absent();
}


public abstract record UpdateTenantUserIdentityResult {
	public sealed record Success(
		TenantUserDetailsData UserData
	) : UpdateTenantUserIdentityResult;
	public sealed record NotFound() : UpdateTenantUserIdentityResult;
}

public abstract record UpdateTenantUserEmailResult {
	public sealed record Success(
		TenantUserDetailsData UserData
	) : UpdateTenantUserEmailResult;
	public sealed record NotFound() : UpdateTenantUserEmailResult;
	public sealed record EmailAlreadyInUse() : UpdateTenantUserEmailResult;
}

public abstract record SuspendTenantUserIdentityResult {
	public sealed record Success(
		TenantUserDetailsData UserData
	) : SuspendTenantUserIdentityResult;
	public sealed record NotFound() : SuspendTenantUserIdentityResult;
	public sealed record AlreadySuspended() : SuspendTenantUserIdentityResult;
	public sealed record CannotSuspendLastAdmin() : SuspendTenantUserIdentityResult;
}

public abstract record ReactivateTenantUserIdentityResult {
	public sealed record Success(
		TenantUserDetailsData UserData
	) : ReactivateTenantUserIdentityResult;
	public sealed record NotFound() : ReactivateTenantUserIdentityResult;
	public sealed record NotSuspended() : ReactivateTenantUserIdentityResult;
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
	Task<UpdateStaffUserEmailResult> UpdateStaffUserEmailAsync(Guid userId, string email, CancellationToken cancellationToken = default);
	Task<UpdateUserByIdResult> UpdateStaffUserByIdAsync(Guid userId, UpdateUserDocument document, CancellationToken cancellationToken = default);
	Task<UpdateTenantUserIdentityResult> UpdateTenantUserIdentityForStaffAsync(
		Guid userId,
		UpdateTenantUserIdentityDocument document,
		CancellationToken cancellationToken = default
	);
	Task<UpdateTenantUserEmailResult> UpdateTenantUserEmailForStaffAsync(
		Guid userId,
		string email,
		CancellationToken cancellationToken = default
	);
	Task<SuspendTenantUserIdentityResult> SuspendTenantUserIdentityForStaffAsync(
		Guid userId,
		CancellationToken cancellationToken = default
	);
	Task<ReactivateTenantUserIdentityResult> ReactivateTenantUserIdentityForStaffAsync(
		Guid userId,
		CancellationToken cancellationToken = default
	);
}

[Service(ServiceLifetime.Scoped)]
public class UserService : IUserService {

	private readonly AppDbContext _dbContext;
	private readonly ILogger<UserService> _logger;

	public UserService(AppDbContext dbContext, ILogger<UserService> logger) {
		_dbContext = dbContext;
		_logger = logger;
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


	public async Task<UpdateTenantUserIdentityResult> UpdateTenantUserIdentityForStaffAsync(
		Guid userId,
		UpdateTenantUserIdentityDocument document,
		CancellationToken cancellationToken = default
	) {
		var tenantUserQuery =
			from u in _dbContext.User
			where u.Id == userId
				&& !u.IsDeleted
			where (
				from ua in _dbContext.UserAccount
				where ua.UserId == userId
					&& ua.Scope == AccountScope.Tenant
				select ua
			).Any()
			select u;

		var user = await tenantUserQuery
			.FirstOrDefaultAsync(cancellationToken);

		if (user is null) {
			return new UpdateTenantUserIdentityResult.NotFound();
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

		user.UpdatedAt = DateTime.UtcNow;
		await _dbContext.SaveChangesAsync(cancellationToken);

		var userData = await GetTenantUserDetailsForStaffForMutationAsync(
			userId,
			cancellationToken
		);

		if (userData is null) {
			throw new InvalidOperationException(
				"Tenant user not found after successful identity update. "
				+ "This indicates a data integrity issue."
			);
		}

		return new UpdateTenantUserIdentityResult.Success(userData);
	}

	public async Task<UpdateTenantUserEmailResult> UpdateTenantUserEmailForStaffAsync(
		Guid userId,
		string email,
		CancellationToken cancellationToken = default
	) {
		var normalizedEmail = email.Trim().ToLowerInvariant();

		var user = await BuildLiveTenantUserIdentityMutationQuery(userId)
			.FirstOrDefaultAsync(cancellationToken);

		if (user is null) {
			return new UpdateTenantUserEmailResult.NotFound();
		}

		if (!string.Equals(user.Email, normalizedEmail, StringComparison.Ordinal)) {
			var existing = await GetUserByEmailAsync(
				normalizedEmail,
				cancellationToken
			);
			if (existing is not null && existing.GetRequiredId() != userId) {
				return new UpdateTenantUserEmailResult.EmailAlreadyInUse();
			}

			user.Email = normalizedEmail;
			user.UpdatedAt = DateTime.UtcNow;
			await _dbContext.SaveChangesAsync(cancellationToken);
		}

		var userData = await GetTenantUserDetailsForStaffForMutationAsync(
			userId,
			cancellationToken
		);

		if (userData is null) {
			throw new InvalidOperationException(
				"Tenant user not found after successful email update. "
				+ "This indicates a data integrity issue."
			);
		}

		return new UpdateTenantUserEmailResult.Success(userData);
	}

	public async Task<SuspendTenantUserIdentityResult>
	SuspendTenantUserIdentityForStaffAsync(
		Guid userId,
		CancellationToken cancellationToken = default
	) {
		var userData = await GetTenantUserDetailsForStaffForMutationAsync(
			userId,
			cancellationToken
		);

		if (userData is null) {
			return new SuspendTenantUserIdentityResult.NotFound();
		}

		if (userData.User.IsSuspended()) {
			return new SuspendTenantUserIdentityResult.AlreadySuspended();
		}

		await using var transaction =
			await _dbContext.Database.BeginTransactionAsync(
				IsolationLevel.Serializable,
				cancellationToken
			);

		try {
			// Global suspension disables this user in every tenant. The last-admin
			// guard must therefore scan all active admin memberships atomically.
			var hasTenantWithoutAnotherActiveAdmin = await (
				from ua in _dbContext.UserAccount
				join u in _dbContext.User on ua.UserId equals u.Id
				where ua.UserId == userId
					&& ua.Scope == AccountScope.Tenant
					&& ua.TenantId != null
					&& ua.Level == AccountLevel.Admin
					&& ua.Status != AccountStatus.Suspended
					&& !ua.IsDeleted
					&& !u.IsDeleted
					&& u.Status != UserStatus.Suspended
				where !(
					from otherUa in _dbContext.UserAccount
					join otherUser in _dbContext.User
						on otherUa.UserId equals otherUser.Id
					where otherUa.TenantId == ua.TenantId
						&& otherUa.UserId != userId
						&& otherUa.Scope == AccountScope.Tenant
						&& otherUa.Level == AccountLevel.Admin
						&& otherUa.Status != AccountStatus.Suspended
						&& !otherUa.IsDeleted
						&& !otherUser.IsDeleted
						&& otherUser.Status != UserStatus.Suspended
					select otherUa
				).Any()
				select ua
			).AnyAsync(cancellationToken);

			if (hasTenantWithoutAnotherActiveAdmin) {
				await transaction.RollbackAsync(cancellationToken);
				return new SuspendTenantUserIdentityResult
					.CannotSuspendLastAdmin();
			}

			var now = DateTime.UtcNow;
			var updatedUserCount = await BuildLiveTenantUserIdentityMutationQuery(
				userId
			)
				.Where(x => x.Status != UserStatus.Suspended)
				.ExecuteUpdateAsync(
					setters => setters
						.SetProperty(x => x.Status, UserStatus.Suspended)
						.SetProperty(x => x.UpdatedAt, now),
					cancellationToken
				);

			if (updatedUserCount == 0) {
				await transaction.RollbackAsync(cancellationToken);
				return await ResolveSuspendTenantUserIdentityAfterNoRowsAsync(
					userId,
					cancellationToken
				);
			}

			await transaction.CommitAsync(cancellationToken);
		} catch {
			await transaction.RollbackAsync(cancellationToken);
			throw;
		}

		var updatedUserData = await GetTenantUserDetailsForStaffForMutationAsync(
			userId,
			cancellationToken
		);

		if (updatedUserData is null) {
			throw new InvalidOperationException(
				"Tenant user not found after successful global suspend. "
				+ "This indicates a data integrity issue."
			);
		}

		return new SuspendTenantUserIdentityResult.Success(updatedUserData);
	}

	public async Task<ReactivateTenantUserIdentityResult>
	ReactivateTenantUserIdentityForStaffAsync(
		Guid userId,
		CancellationToken cancellationToken = default
	) {
		var userData = await GetTenantUserDetailsForStaffForMutationAsync(
			userId,
			cancellationToken
		);

		if (userData is null) {
			return new ReactivateTenantUserIdentityResult.NotFound();
		}

		if (!userData.User.IsSuspended()) {
			return new ReactivateTenantUserIdentityResult.NotSuspended();
		}

		var now = DateTime.UtcNow;
		var updatedUserCount = await BuildLiveTenantUserIdentityMutationQuery(userId)
			.Where(x => x.Status == UserStatus.Suspended)
			.ExecuteUpdateAsync(
				setters => setters
					.SetProperty(x => x.Status, UserStatus.Active)
					.SetProperty(x => x.UpdatedAt, now),
				cancellationToken
			);

		if (updatedUserCount == 0) {
			return await ResolveReactivateTenantUserIdentityAfterNoRowsAsync(
				userId,
				cancellationToken
			);
		}

		var updatedUserData = await GetTenantUserDetailsForStaffForMutationAsync(
			userId,
			cancellationToken
		);

		if (updatedUserData is null) {
			throw new InvalidOperationException(
				"Tenant user not found after successful global reactivation. "
				+ "This indicates a data integrity issue."
			);
		}

		return new ReactivateTenantUserIdentityResult.Success(updatedUserData);
	}

	private async Task<TenantUserDetailsData?> GetTenantUserDetailsForStaffForMutationAsync(
		Guid userId,
		CancellationToken cancellationToken = default
	) {
		// Treat tenant user details as a shared identity page. Live company
		// memberships are counted separately so unlinking the last company does
		// not imply the User record was deleted.
		var user = await (
			from u in _dbContext.User.AsNoTracking()
			where u.Id == userId
				&& !u.IsDeleted
				&& (
					from ua in _dbContext.UserAccount.AsNoTracking()
					where ua.UserId == u.Id
						&& ua.Scope == AccountScope.Tenant
					select ua
				).Any()
			select u
		).FirstOrDefaultAsync(cancellationToken);

		if (user is null) {
			return null;
		}

		var companyCount = await (
			from ua in _dbContext.UserAccount.AsNoTracking()
			join tenant in _dbContext.Tenant.AsNoTracking()
				on ua.TenantId equals tenant.Id
			where ua.UserId == userId
				&& ua.Scope == AccountScope.Tenant
				&& !ua.IsDeleted
				&& !tenant.IsDeleted
			select ua
		).CountAsync(cancellationToken);

		return new TenantUserDetailsData {
			User = user,
			CompanyCount = companyCount,
		};
	}

	private IQueryable<User> BuildLiveTenantUserIdentityMutationQuery(Guid userId) {
		return _dbContext.User.Where(u =>
			u.Id == userId
			&& !u.IsDeleted
			&& _dbContext.UserAccount.Any(ua =>
				ua.UserId == u.Id
				&& ua.Scope == AccountScope.Tenant
			)
		);
	}


	private async Task<SuspendTenantUserIdentityResult>
	ResolveSuspendTenantUserIdentityAfterNoRowsAsync(
		Guid userId,
		CancellationToken cancellationToken
	) {
		var currentUserData = await GetTenantUserDetailsForStaffForMutationAsync(
			userId,
			cancellationToken
		);
		if (currentUserData is null) {
			return new SuspendTenantUserIdentityResult.NotFound();
		}

		if (currentUserData.User.IsSuspended()) {
			return new SuspendTenantUserIdentityResult.AlreadySuspended();
		}

		throw new InvalidOperationException(
			"Tenant user still matched global suspend preconditions after a 0-row update."
		);
	}

	private async Task<ReactivateTenantUserIdentityResult>
	ResolveReactivateTenantUserIdentityAfterNoRowsAsync(
		Guid userId,
		CancellationToken cancellationToken
	) {
		var currentUserData = await GetTenantUserDetailsForStaffForMutationAsync(
			userId,
			cancellationToken
		);
		if (currentUserData is null) {
			return new ReactivateTenantUserIdentityResult.NotFound();
		}

		if (!currentUserData.User.IsSuspended()) {
			return new ReactivateTenantUserIdentityResult.NotSuspended();
		}

		throw new InvalidOperationException(
			"Tenant user still matched global reactivate preconditions after a 0-row update."
		);
	}

}
