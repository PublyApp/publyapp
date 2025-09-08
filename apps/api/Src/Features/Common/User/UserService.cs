namespace MainApi.Src.Features.Common.User;

using MainApi.Src.Data.DbContext;
using Microsoft.EntityFrameworkCore;
using MainApi.Src.Features.Common.Auth;
using MainApi.Src.Lib;
using MainApi.Localization;

public abstract record CreateUserResult
{
	public sealed record Success(User User) : CreateUserResult;
	public sealed record Failure(string Message, TranslationKey Key) : CreateUserResult;
}

public interface IUserService
{
	Task<CreateUserResult> CreateUserAsync(User user, CancellationToken cancellationToken = default);
	Task<User?> GetUserToLoginAsync(string email, CancellationToken cancellationToken = default);
	Task<User?> GetUserByEmailAsync(string email, CancellationToken cancellationToken = default);
	Task<User?> UpdateUserAsync(User user, CancellationToken cancellationToken = default);
}

public class UserService : IUserService
{
	private readonly MainApiDbContext _dbContext;
	private readonly IPasswordService _passwordService;
	private readonly ILogger<UserService> _logger;

	public UserService(MainApiDbContext dbContext, IPasswordService passwordService, ILogger<UserService> logger)
	{
		_dbContext = dbContext;
		_passwordService = passwordService;
		_logger = logger;
	}

	public async Task<CreateUserResult> CreateUserAsync(User user, CancellationToken cancellationToken = default)
	{
		try
		{
			// check if user already exists
			var existingUser = await _dbContext.User
				.FirstOrDefaultAsync(u => u.Email == user.Email, cancellationToken)
				.ConfigureAwait(false);
			if (existingUser != null)
			{
				return new CreateUserResult.Failure("User already exists", ResponseKeys.UserAlreadyExists);
			}

			// Hash the password before storing
			user.Password = _passwordService.HashPassword(user.Password ?? throw new ArgumentException("Password cannot be null", nameof(user.Password)));

			var result = await _dbContext.User.AddAsync(user, cancellationToken).ConfigureAwait(false);
			await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

			return new CreateUserResult.Success(result.Entity);
		}
		catch (OperationCanceledException)
		{
			_logger.LogInformation("User creation cancelled for email {Email}", user.Email);
			throw;
		}
		catch (Exception ex)
		{
			_logger.LogError(ex, "Failed to create user with email {Email}", user.Email);
			throw;
		}
	}

	public async Task<User?> GetUserToLoginAsync(string email, CancellationToken cancellationToken = default)
	{
		return await GetUserByEmailAsync(email, cancellationToken).ConfigureAwait(false);
	}

	public async Task<User?> GetUserByEmailAsync(string email, CancellationToken cancellationToken = default)
	{
		return await _dbContext.User.FirstOrDefaultAsync(
			u => u.Email == email
		// check these fields directly in the login handler, for customized error responses
		&& u.IsDeleted != true, // only isDeleted is relevant to check here
														// && u.IsSuspended != true
														// && u.IsVerified == true
		cancellationToken).ConfigureAwait(false);
	}

	public async Task<User?> UpdateUserAsync(User user, CancellationToken cancellationToken = default)
	{
		try
		{
			_dbContext.User.Update(user);
			await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
			return user;
		}
		catch (OperationCanceledException)
		{
			_logger.LogInformation("User update cancelled for ID {UserId}", user.Id);
			throw;
		}
		catch (Exception ex)
		{
			_logger.LogError(ex, "Failed to update user {UserId}", user.Id);
			throw;
		}
	}
}
