using PublyApp.Api.Data.DbContext;

using Quartz;

namespace PublyApp.Api.Infrastructure.Jobs.Quartz;

/// <summary>
/// Belt-and-braces reclaim (design §5.3, cadence 5 min): resets <c>job_queue</c> rows
/// stuck <c>Processing</c> past their <c>locked_until</c> lease back to <c>Pending</c>.
/// Delegates to the engine's canonical
/// <see cref="JobQueueProcessor.ResetExpiredLeasesAsync"/> — the SAME statement the
/// processor runs before each claim — so recovery semantics (including clearing
/// <c>lock_token</c>, without which an expired owner could still satisfy the
/// fencing-conditioned Try*Async transitions and delete/requeue a row it no longer
/// owns) can never drift from the engine's. The processor already reclaims inline;
/// this covers a fully-crashed fleet where no processor is polling. Runs ONLY on the
/// leader (scheduled by <see cref="SchedulerLeaderService"/>).
///
/// (Historical note: the pre-fold design also swept stale email-outbox leases here;
/// the owner's fold of emails into job_queue removed that lane, so this job's scope
/// is job_queue only.)
/// </summary>
public sealed class RecoverStaleJobsJob : IJob {
	private readonly AppDbContext _dbContext;
	private readonly ILogger<RecoverStaleJobsJob> _logger;

	public RecoverStaleJobsJob(AppDbContext dbContext, ILogger<RecoverStaleJobsJob> logger) {
		_dbContext = dbContext;
		_logger = logger;
	}

	public async Task Execute(IJobExecutionContext context) {
		await RecoverAsync(context.CancellationToken);
	}

	// Public: lets specs drive one recovery pass deterministically (the repo's
	// public-methods-for-determinism discipline) without faking IJobExecutionContext.
	public async Task<int> RecoverAsync(CancellationToken cancellationToken) {
		var reclaimed = await JobQueueProcessor.ResetExpiredLeasesAsync(
			_dbContext, cancellationToken
		);

		if (reclaimed > 0 && _logger.IsEnabled(LogLevel.Information)) {
			_logger.LogInformation("Recovered {Count} stale job_queue row(s) to Pending", reclaimed);
		}

		return reclaimed;
	}
}
