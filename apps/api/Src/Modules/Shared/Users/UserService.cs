using MainApi.Src.Data.DbContext;

using Microsoft.EntityFrameworkCore;

namespace MainApi.Src.Modules.Shared.Users;

public abstract record CreateUserResult {
	public sealed record Success(User User) : CreateUserResult;
	public sealed record UserAlreadyExists(User User) : CreateUserResult;
}

public interface IUserService {
	Task<CreateUserResult> CreateUserAsync(User user, CancellationToken cancellationToken = default);
	Task<User?> GetUserByEmailAsync(string email, CancellationToken cancellationToken = default);
	Task<User?> GetUserByEmailVerificationTokenAsync(string token, CancellationToken cancellationToken = default);
	Task<User?> GetUserByPasswordResetTokenAsync(string token, CancellationToken cancellationToken = default);
	/// <summary>
	/// Updates a user entity (PUT-style full replacement).
	/// NOTE: This marks ALL properties as modified, even unchanged ones.
	/// For PATCH operations, fetch the entity first, modify specific fields, then call this.
	/// For more efficient partial updates without fetching, consider using UpdateUserByIdAsync.
	/// </summary>
	/// <param name="user">The user entity with updated values</param>
	/// <param name="cancellationToken">Cancellation token</param>
	/// <returns>The updated user entity</returns>
	Task<User?> UpdateUserAsync(User user, CancellationToken cancellationToken = default);
	Task<User?> GetUserByIdAsync(Guid? id, CancellationToken cancellationToken = default);
}

public class UserService : IUserService {
	private readonly MainApiDbContext _dbContext;

	public UserService(MainApiDbContext dbContext) {
		_dbContext = dbContext;
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
		var query =
			from u in _dbContext.User
			where u.Email == email
			&& !u.IsDeleted
			// * check these fields directly in the login handler
			// * for customized error responses
			// && !u.IsSuspended
			// && u.IsVerified
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
			&& u.EmailVerifyToken == token
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
}
