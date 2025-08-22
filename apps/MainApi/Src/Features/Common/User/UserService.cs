namespace MainApi.Src.Features.Common.User;

using MainApi.Src.Data.DbContext;
using Microsoft.EntityFrameworkCore;
using MainApi.Src.Features.Common.Auth;

public abstract record CreateUserResult
{
	public sealed record Success(User User) : CreateUserResult;
	public sealed record Failure(string Message, string Key) : CreateUserResult;
}

public interface IUserService
{
	Task<CreateUserResult> CreateUser(User user);
	Task<User?> GetUserByEmail(string email);
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
			return new CreateUserResult.Failure("User already exists", "user-already-exists");
		}

		// Hash the password before storing
		user.Password = _passwordService.HashPassword(user.Password);

		var result = await _dbContext.User.AddAsync(user);
		await _dbContext.SaveChangesAsync();

		return new CreateUserResult.Success(result.Entity);
	}

	public async Task<User?> GetUserByEmail(string email)
	{
		var user = await _dbContext.User.FirstOrDefaultAsync(u => u.Email == email);
		if (user == null)
		{
			return null;
		}

		return user;
	}
}
