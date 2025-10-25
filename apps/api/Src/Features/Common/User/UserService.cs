using MainApi.Src.Data.DbContext;
using Microsoft.EntityFrameworkCore;

namespace MainApi.Src.Features.Common.User;

public abstract record CreateUserResult {
	public sealed record Success(User User) : CreateUserResult;
	public sealed record UserAlreadyExists(User User) : CreateUserResult;
}

public interface IUserService {
	Task<CreateUserResult> CreateUserAsync(User user, CancellationToken cancellationToken = default);
	Task<User?> GetUserByEmailAsync(string email, CancellationToken cancellationToken = default);
	Task<User?> GetUserByEmailAndEmailVerifyTokenAsync(string email, string token, CancellationToken cancellationToken = default);
	Task<User?> GetUserByEmailAndPasswordResetTokenAsync(string email, string token, CancellationToken cancellationToken = default);
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
			.FirstOrDefaultAsync(u => u.Email == user.Email, cancellationToken)
			.ConfigureAwait(false);

		if (existingUser is not null) {
			return new CreateUserResult.UserAlreadyExists(existingUser);
		}

		var result = await _dbContext.User.AddAsync(user, cancellationToken).ConfigureAwait(false);
		await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

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

		return await query.FirstOrDefaultAsync(cancellationToken).ConfigureAwait(false);
	}

	public async Task<User?> UpdateUserAsync(User user, CancellationToken cancellationToken = default) {
		_dbContext.User.Update(user);
		await _dbContext.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
		return user;
	}

	public async Task<User?> GetUserByIdAsync(Guid? id, CancellationToken cancellationToken = default) {
		var query =
			from u in _dbContext.User
			where u.Id == id
			select u;
		return await query.FirstOrDefaultAsync(cancellationToken).ConfigureAwait(false);
	}

	public async Task<User?> GetUserByEmailAndEmailVerifyTokenAsync(string email, string token, CancellationToken cancellationToken = default) {
		var query =
			from u in _dbContext.User
			where u.Email == email
			&& u.EmailVerifyToken == token
			select u;

		return await query.FirstOrDefaultAsync(cancellationToken).ConfigureAwait(false);
	}

	public async Task<User?> GetUserByEmailAndPasswordResetTokenAsync(string email, string token, CancellationToken cancellationToken = default) {
		var query =
			from u in _dbContext.User
			where u.Email == email
			&& u.PasswordResetToken == token
			select u;

		return await query.FirstOrDefaultAsync(cancellationToken).ConfigureAwait(false);
	}
}
