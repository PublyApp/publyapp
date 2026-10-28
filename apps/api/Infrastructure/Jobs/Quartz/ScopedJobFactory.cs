using Quartz;
using Quartz.Extensibility;

namespace PublyApp.Api.Infrastructure.Jobs.Quartz;

/// <summary>
/// Resolves Quartz jobs from a fresh DI scope per fire (design §5.3 — jobs use scoped
/// AppDbContext), since this design drives Quartz with a manual lifecycle and RAM store
/// rather than the Quartz DI integration (AddQuartz). The scope is created when a
/// trigger fires and disposed when Quartz returns the job.
/// </summary>
public sealed class ScopedJobFactory : IJobFactory {
	private readonly IServiceScopeFactory _ScopeFactory;

	public ScopedJobFactory(IServiceScopeFactory scopeFactory) {
		this._ScopeFactory = scopeFactory;
	}

	public ValueTask<JobScope> CreateJob(
		TriggerFiredBundle bundle,
		IScheduler scheduler,
		CancellationToken cancellationToken
	) {
		var scope = this._ScopeFactory.CreateScope();
		try {
			var job = (IJob)scope.ServiceProvider.GetRequiredService(bundle.JobDetail.JobType.Type);
			return ValueTask.FromResult(new JobScope(job, scope));
		} catch {
			scope.Dispose();
			throw;
		}
	}

	// The DI scope rides in JobScope.State from CreateJob to here, so the job stays the
	// resolved job and the scope is disposed once Quartz returns it.
	public ValueTask ReturnJob(JobScope scope, CancellationToken cancellationToken) {
		if (scope.State is IDisposable disposable) {
			disposable.Dispose();
		}

		return ValueTask.CompletedTask;
	}
}
