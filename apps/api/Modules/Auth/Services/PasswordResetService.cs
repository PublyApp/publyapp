using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Jobs;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Auth.Jobs;

namespace PublyApp.Api.Modules.Auth.Services;

/// <summary>
/// Owns the #809 password-reset request as ONE <see cref="AppDbContext"/> transaction
/// (design §5.4/F6). The shipped handler committed token issuance via
/// <c>UserService.UpdateUserAsync</c> and then fire-and-forgot the email — a lost email
/// left a valid-but-unusable token. Here the token reuse/issue AND the
/// <c>email.password-reset.v1</c> enqueue share one transaction: both commit together or
/// neither does (rollback in both directions, §9). The enqueuer's insert joins this
/// context and its transactional NOTIFY fires at commit. Response semantics are
/// unchanged — the handler still returns a constant shape, so there is no
/// user-enumeration signal (a missing/unverified user is a committed no-op here).
/// </summary>
public interface IPasswordResetService {
	Task RequestAsync(string email, CancellationToken cancellationToken = default);
}

[Service(ServiceLifetime.Scoped)]
public sealed class PasswordResetService : IPasswordResetService {
	private readonly AppDbContext _dbContext;
	private readonly IJobEnqueuer _jobEnqueuer;

	public PasswordResetService(AppDbContext dbContext, IJobEnqueuer jobEnqueuer) {
		_dbContext = dbContext;
		_jobEnqueuer = jobEnqueuer;
	}

	public async Task RequestAsync(string email, CancellationToken cancellationToken = default) {
		var canonicalEmail = email.Trim().ToLowerInvariant();

		await using var transaction =
			await _dbContext.Database.BeginTransactionAsync(cancellationToken);

		// Serialize the read/decide/write sequence on the identity row. Without this lock,
		// concurrent requests can both observe no live token and enqueue different links.
		await _dbContext.Database.ExecuteSqlAsync(
			$"""
			SELECT 1
			FROM users
			WHERE email = {canonicalEmail} AND NOT is_deleted
			FOR UPDATE
			""",
			cancellationToken
		);

		var userQuery =
			from candidate in _dbContext.User
			where candidate.Email == canonicalEmail && !candidate.IsDeleted
			select candidate;
		var user = await userQuery.FirstOrDefaultAsync(cancellationToken);

		// Constant-shape no-op for a missing or unverified user (no enumeration signal).
		if (user is null || !user.IsVerified) {
			await transaction.CommitAsync(cancellationToken);
			return;
		}

		// r6-F5 parity: a still-live token is reused rather than rotated; otherwise a
		// fresh token is issued. BOTH branches now persist (via the enqueuer's SaveChanges
		// on this same context), replacing the shipped reuse-branch-persists-nothing gap.
		bool hasLiveToken = user.PasswordResetToken is not null
			&& user.PasswordResetTokenExpiresAt is { } existingExpiresAt
			&& existingExpiresAt > DateTime.UtcNow;

		if (!hasLiveToken) {
			var env = AppEnvironment.Instance;
			user.PasswordResetToken = CryptoUtils.RandomString(env.PASSWORD_RESET_TOKEN_LENGTH);
			user.PasswordResetTokenExpiresAt =
				DateTime.UtcNow.AddDays(env.PASSWORD_RESET_TOKEN_VALIDITY_DURATION);
		}

		await _jobEnqueuer.EnqueueAsync(
			AuthEmailJobs.PasswordResetV1,
			new PasswordResetEmailPayload { UserId = user.GetRequiredId() },
			cancellationToken: cancellationToken
		);

		await transaction.CommitAsync(cancellationToken);
	}
}
