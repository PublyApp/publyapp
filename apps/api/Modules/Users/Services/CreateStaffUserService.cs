using Microsoft.EntityFrameworkCore;

using Npgsql;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Jobs;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Auth.Jobs;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Modules.Users.Services;

public sealed record CreateStaffUserArgs(
	string Email,
	string LastName,
	string? FirstName,
	string? AvatarUrl,
	string Password,
	bool SendNotification,
	AccountLevel? AccountLevel = null
);

public abstract record CreateStaffUserServiceResult {
	public sealed record Success(User User, UserAccount Account, bool IsNewUser)
		: CreateStaffUserServiceResult;

	public sealed record UserAlreadyStaffUser() : CreateStaffUserServiceResult;
	public sealed record UserHasTenantOrProjectAccounts() : CreateStaffUserServiceResult;
}

public interface ICreateStaffUserService {
	Task<CreateStaffUserServiceResult> CreateStaffUserAsync(
		CreateStaffUserArgs args,
		CancellationToken cancellationToken = default
	);
}

[Service(ServiceLifetime.Scoped)]
public sealed class CreateStaffUserService : ICreateStaffUserService {
	private readonly AppDbContext _DbContext;
	private readonly IJobEnqueuer _JobEnqueuer;

	public CreateStaffUserService(
		AppDbContext dbContext,
		IJobEnqueuer jobEnqueuer
	) {
		_DbContext = dbContext;
		_JobEnqueuer = jobEnqueuer;
	}

	// NOTE: This service intentionally accepts the full user input and owns its own
	// transaction so user+account writes and the verification-job enqueue commit
	// atomically (or not at all), avoiding the orphan-user gap.
	public async Task<CreateStaffUserServiceResult> CreateStaffUserAsync(
		CreateStaffUserArgs args,
		CancellationToken cancellationToken = default
	) {
		var env = AppEnvironment.Instance;

		var user = new User {
			Email = args.Email,
			Password = args.Password,
			LastName = args.LastName,
			FirstName = args.FirstName,
			AvatarUrl = args.AvatarUrl,
			Status = UserStatus.Suspended,
			IsVerified = false,
		};

		if (args.SendNotification) {
			user.EmailVerifyToken = CryptoUtils.RandomString(env.EMAIL_VERIFY_TOKEN_LENGTH);
			user.EmailVerifyTokenExpiresAt = DateTime.UtcNow.AddDays(
				env.EMAIL_VERIFY_TOKEN_VALIDITY_DURATION
			);
		}

		await using var transaction = await _DbContext.Database.BeginTransactionAsync(cancellationToken);

		var (isNewUser, userResultEntity) = await _GetOrCreateUserAsync(user, cancellationToken);

		var accountResult = await _CreateStaffAccountAsync(
			userResultEntity.GetRequiredId(),
			args.AccountLevel,
			cancellationToken
		);

		if (accountResult is not CreateStaffAccountResult.Success accountSuccess) {
			await transaction.RollbackAsync(cancellationToken);
			return accountResult switch {
				CreateStaffAccountResult.UserAlreadyStaffUser => new CreateStaffUserServiceResult.UserAlreadyStaffUser(),
				CreateStaffAccountResult.UserHasTenantOrProjectAccounts => new CreateStaffUserServiceResult.UserHasTenantOrProjectAccounts(),
				_ => new CreateStaffUserServiceResult.UserHasTenantOrProjectAccounts()
			};
		}

		if (args.SendNotification && isNewUser) {
			if (string.IsNullOrEmpty(userResultEntity.EmailVerifyToken)) {
				await transaction.RollbackAsync(cancellationToken);
				throw new InvalidOperationException("Email verify token should not be null or empty.");
			}

			await _JobEnqueuer.EnqueueAsync(
				AuthEmailJobs.VerifyEmailV1,
				new VerifyEmailPayload {
					UserId = userResultEntity.GetRequiredId(),
					IsWelcomeEmail = true
				},
				cancellationToken: cancellationToken
			);
		}

		await transaction.CommitAsync(cancellationToken);
		return new CreateStaffUserServiceResult.Success(
			userResultEntity,
			accountSuccess.Account,
			isNewUser
		);
	}

	private async Task<(bool IsNewUser, User User)> _GetOrCreateUserAsync(
		User user,
		CancellationToken cancellationToken
	) {
		var existingUser = await (
			from existing in _DbContext.User
			where existing.Email == user.Email
			select existing
		).FirstOrDefaultAsync(cancellationToken);

		if (existingUser is not null) {
			return (false, existingUser);
		}

		var addedUser = await _DbContext.User.AddAsync(user, cancellationToken);
		await _DbContext.SaveChangesAsync(cancellationToken);
		return (true, addedUser.Entity);
	}

	private async Task<CreateStaffAccountResult> _CreateStaffAccountAsync(
		Guid userId,
		AccountLevel? accountLevel,
		CancellationToken cancellationToken
	) {
		var hasStaffAccount = await _HasStaffAccountAsync(userId, cancellationToken);
		if (hasStaffAccount) {
			return new CreateStaffAccountResult.UserAlreadyStaffUser();
		}

		var hasTenantOrProjectAccounts = await _HasTenantOrProjectAccountsAsync(userId, cancellationToken);
		if (hasTenantOrProjectAccounts) {
			return new CreateStaffAccountResult.UserHasTenantOrProjectAccounts();
		}

		var account = UserAccount.CreateStaffAccount(userId, accountLevel);
		var addedAccount = await _DbContext.UserAccount.AddAsync(account, cancellationToken);

		try {
			await _DbContext.SaveChangesAsync(cancellationToken);
		} catch (DbUpdateException ex) when (_IsUniqueConstraintViolation(ex)) {
			_DbContext.Entry(addedAccount.Entity).State = EntityState.Detached;
			return new CreateStaffAccountResult.UserAlreadyStaffUser();
		}

		return new CreateStaffAccountResult.Success(addedAccount.Entity);
	}

	private async Task<bool> _HasStaffAccountAsync(
		Guid userId,
		CancellationToken cancellationToken
	) {
		return await (
			from ua in _DbContext.UserAccount
			where ua.UserId == userId
				&& ua.Scope == AccountScope.Staff
				&& !ua.IsDeleted
			select ua
		).AnyAsync(cancellationToken);
	}

	private async Task<bool> _HasTenantOrProjectAccountsAsync(
		Guid userId,
		CancellationToken cancellationToken
	) {
		return await (
			from ua in _DbContext.UserAccount
			where ua.UserId == userId
				&& (ua.Scope == AccountScope.Tenant || ua.Scope == AccountScope.Project)
				&& !ua.IsDeleted
			select ua
		).AnyAsync(cancellationToken);
	}

	private static bool _IsUniqueConstraintViolation(DbUpdateException ex) {
		if (ex.InnerException is PostgresException pgEx) {
			return pgEx.SqlState == "23505"
				&& pgEx.TableName is not null
				&& pgEx.TableName.Equals("user_accounts", StringComparison.OrdinalIgnoreCase);
		}

		return false;
	}
}
