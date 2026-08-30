using Microsoft.EntityFrameworkCore;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Jobs;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.DI;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Auth.Jobs;

namespace PublyApp.Api.Modules.Auth.Services;

public abstract record VerifyEmailRequestServiceResult {
	public sealed record Success : VerifyEmailRequestServiceResult;
	public sealed record NotFound : VerifyEmailRequestServiceResult;
	public sealed record EmailAlreadyVerified : VerifyEmailRequestServiceResult;
}

public interface IVerifyEmailRequestService {
	Task<VerifyEmailRequestServiceResult> RequestAsync(
		string email,
		CancellationToken cancellationToken = default
	);
}

[Service(ServiceLifetime.Scoped)]
public sealed class VerifyEmailRequestService : IVerifyEmailRequestService {
	private readonly AppDbContext _dbContext;
	private readonly IJobEnqueuer _jobEnqueuer;

	public VerifyEmailRequestService(
		AppDbContext dbContext,
		IJobEnqueuer jobEnqueuer
	) {
		_dbContext = dbContext;
		_jobEnqueuer = jobEnqueuer;
	}

	public async Task<VerifyEmailRequestServiceResult> RequestAsync(
		string email,
		CancellationToken cancellationToken = default
	) {
		await using var transaction = await _dbContext.Database.BeginTransactionAsync(cancellationToken);

		var normalizedEmail = email.Trim().ToLowerInvariant();

		var user = await (
			from candidate in _dbContext.User
			where candidate.Email == normalizedEmail && !candidate.IsDeleted
			select candidate
		).FirstOrDefaultAsync(cancellationToken);

		if (user is null) {
			await transaction.RollbackAsync(cancellationToken);
			return new VerifyEmailRequestServiceResult.NotFound();
		}

		if (user.IsVerified) {
			await transaction.RollbackAsync(cancellationToken);
			return new VerifyEmailRequestServiceResult.EmailAlreadyVerified();
		}

		var now = DateTime.UtcNow;
		var env = AppEnvironment.Instance;

		var hasLiveToken = !string.IsNullOrEmpty(user.EmailVerifyToken)
			&& user.EmailVerifyTokenExpiresAt is not null
			&& user.EmailVerifyTokenExpiresAt > now;

		if (!hasLiveToken) {
			user.EmailVerifyToken = CryptoUtils.RandomString(env.EMAIL_VERIFY_TOKEN_LENGTH);
			user.EmailVerifyTokenExpiresAt = now.AddDays(env.EMAIL_VERIFY_TOKEN_VALIDITY_DURATION);
			await _dbContext.SaveChangesAsync(cancellationToken);
		}

		await _jobEnqueuer.EnqueueAsync(
			AuthEmailJobs.VerifyEmailV1,
			new VerifyEmailPayload {
				UserId = user.GetRequiredId(),
				IsWelcomeEmail = false
			},
			cancellationToken: cancellationToken
		);

		await transaction.CommitAsync(cancellationToken);
		return new VerifyEmailRequestServiceResult.Success();
	}
}
