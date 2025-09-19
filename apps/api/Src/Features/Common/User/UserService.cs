namespace MainApi.Src.Features.Common.User;

using MainApi.Src.Data.DbContext;
using Microsoft.EntityFrameworkCore;
using MainApi.Src.Features.Common.Auth;
using MainApi.Src.Lib;
using MainApi.Localization;

public abstract record CreateUserResult {
	public sealed record Success(User User) : CreateUserResult;
	public sealed record Failure(string Message, TranslationKey Key) : CreateUserResult;
}

public interface IUserService {
	Task<CreateUserResult> CreateUserAsync(User user, CancellationToken cancellationToken = default);
	Task<User?> GetUserToLoginAsync(string email, CancellationToken cancellationToken = default);
	Task<User?> GetUserByEmailAsync(string email, CancellationToken cancellationToken = default);
	Task<User?> UpdateUserAsync(User user, CancellationToken cancellationToken = default);
	Task<User?> GetUserByIdAsync(Guid? id, CancellationToken cancellationToken = default);
}

public class UserService : IUserService {
	private readonly MainApiDbContext _dbContext;
	private readonly IPasswordService _passwordService;
	private readonly ILogger<UserService> _logger;

	public UserService(MainApiDbContext dbContext, IPasswordService passwordService, ILogger<UserService> logger) {
		_dbContext = dbContext;
		_passwordService = passwordService;
		_logger = logger;
	}

	public async Task<CreateUserResult> CreateUserAsync(User user, CancellationToken cancellationToken = default) {
		// check if user already exists
		var existingUser = await _dbContext.User
			.FirstOrDefaultAsync(u => u.Email == user.Email, cancellationToken)
			.ConfigureAwait(false);
		if (existingUser != null) {
			return new CreateUserResult.Failure("User already exists", ResponseKeys.UserAlreadyExists);
		}

		// Hash the password before storing
		user.Password = _passwordService.HashPassword(user.Password);

		var result = await _dbContext.User.AddAsync(user, cancellationToken).ConfigureAwait(false);
		await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

		return new CreateUserResult.Success(result.Entity);
	}

	public async Task<User?> GetUserToLoginAsync(string email, CancellationToken cancellationToken = default) {
		return await GetUserByEmailAsync(email, cancellationToken).ConfigureAwait(false);
	}

	public async Task<User?> GetUserByEmailAsync(string email, CancellationToken cancellationToken = default) {
		return await _dbContext.User.FirstOrDefaultAsync(
			u => u.Email == email
			// check these fields directly in the login handler, for customized error responses
			&& !u.IsDeleted, // only isDeleted is relevant to check here
											 // && !u.IsSuspended
											 // && u.IsVerified
			cancellationToken
		).ConfigureAwait(false);
	}

	public async Task<User?> UpdateUserAsync(User user, CancellationToken cancellationToken = default) {
		_dbContext.User.Update(user);
		await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
		return user;
	}

	public async Task<User?> GetUserByIdAsync(Guid? id, CancellationToken cancellationToken = default) {
		return await _dbContext.User
			.FindAsync([id, cancellationToken], cancellationToken: cancellationToken)
			.ConfigureAwait(false);
	}
}
