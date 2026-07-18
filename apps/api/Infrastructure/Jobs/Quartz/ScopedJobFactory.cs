using Quartz;
using Quartz.Spi;

namespace PublyApp.Api.Infrastructure.Jobs.Quartz;

/// <summary>
/// Resolves Quartz jobs from a fresh DI scope per fire (design §5.3 — jobs use scoped
/// AppDbContext), since this design drives Quartz with a manual lifecycle and RAM store
/// rather than the Quartz.Extensions.Hosting DI integration. The scope is created when a
/// trigger fires and disposed when Quartz returns the job.
/// </summary>
public sealed class ScopedJobFactory : IJobFactory {
	private readonly IServiceScopeFactory _scopeFactory;

	public ScopedJobFactory(IServiceScopeFactory scopeFactory) {
		_scopeFactory = scopeFactory;
	}

	public IJob NewJob(TriggerFiredBundle bundle, IScheduler scheduler) {
		var scope = _scopeFactory.CreateScope();
		try {
			var job = (IJob)scope.ServiceProvider.GetRequiredService(bundle.JobDetail.JobType);
			return new ScopedJob(scope, job);
		} catch {
			scope.Dispose();
			throw;
		}
	}

	public void ReturnJob(IJob job) {
		if (job is ScopedJob scopedJob) {
			scopedJob.Dispose();
		}
	}

	// Wraps the resolved job with its DI scope so the scope outlives execution and is
	// disposed in ReturnJob.
	private sealed class ScopedJob : IJob, IDisposable {
		private readonly IServiceScope _scope;
		private readonly IJob _inner;

		public ScopedJob(IServiceScope scope, IJob inner) {
			_scope = scope;
			_inner = inner;
		}

		public Task Execute(IJobExecutionContext context) {
			return _inner.Execute(context);
		}

		public void Dispose() {
			_scope.Dispose();
		}
	}
}
