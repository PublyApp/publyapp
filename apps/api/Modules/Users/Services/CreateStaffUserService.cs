using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Jobs;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Lib;
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
	private readonly AppDbContext _dbContext;
	private readonly IUserService _userService;
	private readonly IAccountService _accountService;
	private readonly IJobEnqueuer _jobEnqueuer;

	public CreateStaffUserService(
		AppDbContext dbContext,
		IUserService userService,
		IAccountService accountService,
		IJobEnqueuer jobEnqueuer
	) {
		_dbContext = dbContext;
		_userService = userService;
		_accountService = accountService;
		_jobEnqueuer = jobEnqueuer;
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

		await using var transaction = await _dbContext.Database.BeginTransactionAsync(cancellationToken);

		User userResultEntity;
		bool isNewUser;

		var userResult = await _userService.CreateUserAsync(user, cancellationToken);
		switch (userResult) {
			case CreateUserResult.Success success:
				userResultEntity = success.User;
				isNewUser = true;
				break;

			case CreateUserResult.UserAlreadyExists alreadyExists:
				userResultEntity = alreadyExists.User;
				isNewUser = false;
				break;

			default:
				await transaction.RollbackAsync(cancellationToken);
				return new CreateStaffUserServiceResult.UserHasTenantOrProjectAccounts();
		}

		var accountResult = await _accountService.CreateStaffAccountAsync(
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

			await _jobEnqueuer.EnqueueAsync(
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
}
