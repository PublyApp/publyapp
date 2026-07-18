using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Jobs;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Modules.Users.Services;

public class UpdateUserDocument {
	public PatchField<string?> LastName { get; set; } = PatchField<string?>.Absent();
	public PatchField<string?> FirstName { get; set; } = PatchField<string?>.Absent();
	public PatchField<string?> AvatarUrl { get; set; } = PatchField<string?>.Absent();
	public string? AccountLevel { get; set; }
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

public abstract record UpdateStaffUserEmailResult {
	public sealed record Success(StaffUserData UserData) : UpdateStaffUserEmailResult;
	public sealed record NotFound() : UpdateStaffUserEmailResult;
	public sealed record EmailAlreadyInUse() : UpdateStaffUserEmailResult;
}

public interface IStaffUserCoreService {
	Task<UpdateStaffUserEmailResult> UpdateStaffUserEmailAsync(Guid userId, string email, CancellationToken cancellationToken = default);
	Task<UpdateUserByIdResult> UpdateStaffUserByIdAsync(Guid userId, UpdateUserDocument document, CancellationToken cancellationToken = default);
}

[Service(ServiceLifetime.Scoped)]
public class StaffUserCoreService : IStaffUserCoreService {
	private readonly AppDbContext _dbContext;
	private readonly ILogger<StaffUserCoreService> _logger;

	public StaffUserCoreService(AppDbContext dbContext, ILogger<StaffUserCoreService> logger) {
		_dbContext = dbContext;
		_logger = logger;
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
			var existing = await _dbContext.User
				.FirstOrDefaultAsync(u =>
					u.Email == normalizedEmail
					&& !u.IsDeleted,
					cancellationToken);
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
			var staffAccountCount = await _dbContext.UserAccount
				.CountAsync(ua =>
					ua.UserId == userId
					&& ua.Scope == AccountScope.Staff
					&& !ua.IsDeleted
					&& !ua.User.IsDeleted,
					cancellationToken);

			if (staffAccountCount == 0) {
				await transaction.RollbackAsync(cancellationToken);
				return new UpdateUserByIdResult.UserNotFound();
			}

			if (staffAccountCount > 1) {
				await transaction.RollbackAsync(cancellationToken);
				throw new InvalidOperationException(
					$"Data integrity violation: User {userId} has {staffAccountCount} staff accounts"
				);
			}

			var updatedCount = await _dbContext.User
				.Where(u => u.Id == userId && !u.IsDeleted)
				.ExecuteUpdateAsync(setters => setters
					.SetProperty(u => u.LastName, u => document.LastName.IsPresent ? document.LastName.Value : u.LastName)
					.SetProperty(u => u.FirstName, u => document.FirstName.IsPresent ? document.FirstName.Value : u.FirstName)
					.SetProperty(u => u.AvatarUrl, u => document.AvatarUrl.IsPresent ? document.AvatarUrl.Value : u.AvatarUrl)
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

				await _dbContext.UserAccount
					.Where(ua => ua.UserId == userId && ua.Scope == AccountScope.Staff && !ua.IsDeleted)
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
					&& !ua.User.IsDeleted
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
			// Never carry the raw exception message off this boundary (finding F3): the
			// handler logs ErrorMessage as a template property with NO LogEvent.Exception,
			// which the sanitizing sink cannot recognize as exception-derived. Describe
			// yields the safe type + redacted, length-bounded message instead.
			return new UpdateUserByIdResult.UpdateFailed(
				JobErrorSanitizer.Describe(exception)
			);
		}
	}
}
