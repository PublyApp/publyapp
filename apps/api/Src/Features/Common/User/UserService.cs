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
	Task<CreateUserResult> CreateUser(User user);
	Task<User?> GetUserToLogin(string email);
	Task<User?> GetUserByEmail(string email);
	Task<User?> UpdateUser(User user);
}

public class UserService : IUserService
{
	private readonly MainApiDbContext _dbContext;
	private readonly IPasswordService _passwordService;

	public UserService(MainApiDbContext dbContext, IPasswordService passwordService)
	{
		_dbContext = dbContext;
		_passwordService = passwordService;
	}

	public async Task<CreateUserResult> CreateUser(User user)
	{
		// check if user already exists
		var existingUser = await _dbContext.User.FirstOrDefaultAsync(u => u.Email == user.Email);
		if (existingUser != null)
		{
			return new CreateUserResult.Failure("User already exists", ResponseKeys.UserAlreadyExists);
		}

		// Hash the password before storing
		user.Password = _passwordService.HashPassword(user.Password ?? throw new Exception("Password is null"));

		var result = await _dbContext.User.AddAsync(user);
		await _dbContext.SaveChangesAsync();

		return new CreateUserResult.Success(result.Entity);
	}

	public async Task<User?> GetUserToLogin(string email)
	{
		return await GetUserByEmail(email);
	}

	public async Task<User?> GetUserByEmail(string email)
	{
		return await _dbContext.User.FirstOrDefaultAsync(
			u => u.Email == email
		// check these fields directly in the login handler, for customized error responses
		&& u.IsDeleted != true // only isDeleted is relevant to check here
													 // && u.IsSuspended != true
													 // && u.IsVerified == true
		);
	}

	public async Task<User?> UpdateUser(User user)
	{
		_dbContext.User.Update(user);
		await _dbContext.SaveChangesAsync();
		return user;
	}
}
