using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

using Npgsql;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Jobs.Entities;

using Xunit;

namespace PublyApp.Api.Infrastructure.Jobs;

// Cross-process wake recovery specs (design §5.5, O2). The listener holds a dedicated
// LISTEN connection and wakes the processor through IJobQueueSignal. These prove the two
// resilience properties the reviewer flagged as unproven: (1) a dropped connection is
// re-established and fires a catch-up wake so a job enqueued while down is still picked
// up; (2) the poll path remains the correctness fallback when no wake is delivered.
public sealed class JobQueueListenerSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public JobQueueListenerSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	[Fact]
	public async Task ItShouldReconnectAndFireCatchUpWakeAfterTheListenerConnectionDrops() {
		var signal = new RecordingSignal();
		var appName = $"jobs-listener-spec-{Guid.NewGuid():N}";
		var options = new SchedulerLeaderOptions {
			ConnectionString = ConnectionStringWithAppName(appName)
		};
		var listener = new JobQueueListener(
			signal, Metrics(), options, NullLogger<JobQueueListener>.Instance
		);

		await listener.StartAsync(CancellationToken.None);
		try {
			// On connect the listener LISTENs and fires one immediate catch-up wake.
			await WaitUntilAsync(() => signal.Notifications >= 1, TimeSpan.FromSeconds(20));
			var afterConnect = signal.Notifications;

			// Kill the listener's dedicated backend connection from another session.
			await TerminateListenerBackendAsync(appName);

			// On reconnect it re-LISTENs and fires ANOTHER catch-up wake (§5.5 (b)): any
			// job committed while the socket was down is covered by this one wake.
			await WaitUntilAsync(
				() => signal.Notifications > afterConnect, TimeSpan.FromSeconds(30)
			);
		} finally {
			await listener.StopAsync(CancellationToken.None);
		}

		signal.Notifications.Should().BeGreaterThan(1);
	}

	[Fact]
	public async Task ItShouldClaimViaPollFallbackWhenNoListenerReceivesTheNotify() {
		// §5.5 (a): start the real hosted loop with a signal that never notifies. Seed only
		// after its initial empty drain reaches WaitAsync, so processing can happen solely
		// when that wait times out and drives the next poll.
		var jobType = $"poll-fallback-{Guid.NewGuid():N}";
		var handler = new RecordingHandler(jobType);
		var signal = new SilentTimeoutSignal();
		var instance = new JobWorkerInstance();
		var processor = new JobQueueProcessor(
			_fixture.Factory.Services.GetRequiredService<IServiceScopeFactory>(),
			new JobHandlerRegistry([
				new JobHandlerRegistration(jobType, _ => handler)
			]),
			Metrics(),
			instance,
			NullLogger<JobQueueProcessor>.Instance,
			signal,
			new JobQueueProcessorOptions {
				BatchSize = 1,
				LeaseSeconds = 60,
				PollSeconds = 1,
				DrainBudgetSeconds = 10
			}
		);

		await processor.StartAsync(CancellationToken.None);
		Guid jobId;
		try {
			await signal.WaitStarted.Task.WaitAsync(TimeSpan.FromSeconds(10));

			await using (var seed = CreateDbContext()) {
				var item = new JobQueueItem {
					JobType = jobType,
					Payload = "{}",
					Priority = 100,
					MaxAttempts = 10
				};
				seed.JobQueue.Add(item);
				await seed.SaveChangesAsync();

				if (item.Id is null) {
					throw new InvalidOperationException(
						"job_queue insert did not populate the id."
					);
				}

				jobId = item.Id.Value;
			}

			await handler.Processed.Task.WaitAsync(TimeSpan.FromSeconds(10));
			await WaitUntilAsync(async () => {
				await using var check = CreateDbContext();
				return !await check.JobQueue.AsNoTracking().AnyAsync(j => j.Id == jobId);
			}, TimeSpan.FromSeconds(10));
		} finally {
			await processor.StopAsync(CancellationToken.None);
		}

		signal.Notifications.Should().Be(0);
		await using var assertDb = CreateDbContext();
		(await assertDb.JobQueue.AsNoTracking().AnyAsync(j => j.Id == jobId))
			.Should().BeFalse();
	}

	private async Task TerminateListenerBackendAsync(string appName) {
		await using var db = CreateDbContext();
		await db.Database.ExecuteSqlAsync(
			$"""
			SELECT pg_terminate_backend(pid)
			FROM pg_stat_activity
			WHERE application_name = {appName} AND pid <> pg_backend_pid()
			"""
		);
	}

	private static async Task WaitUntilAsync(Func<bool> predicate, TimeSpan timeout) {
		var deadline = DateTime.UtcNow + timeout;
		while (DateTime.UtcNow < deadline) {
			if (predicate()) {
				return;
			}

			await Task.Delay(TimeSpan.FromMilliseconds(50));
		}

		throw new TimeoutException("The awaited listener condition was not met in time.");
	}

	private static async Task WaitUntilAsync(
		Func<Task<bool>> predicate,
		TimeSpan timeout
	) {
		var deadline = DateTime.UtcNow + timeout;
		while (DateTime.UtcNow < deadline) {
			if (await predicate()) {
				return;
			}

			await Task.Delay(TimeSpan.FromMilliseconds(50));
		}

		throw new TimeoutException("The awaited processor condition was not met in time.");
	}

	private static JobsMetrics Metrics() {
		return new JobsMetrics(new JobWorkerInstance(), NullLogger<JobsMetrics>.Instance);
	}

	private string ConnectionStringWithAppName(string appName) {
		var builder = new NpgsqlConnectionStringBuilder(BaseConnectionString()) {
			ApplicationName = appName
		};
		return builder.ConnectionString;
	}

	private string BaseConnectionString() {
		using var scope = _fixture.Factory.Services.CreateScope();
		var connectionString = scope.ServiceProvider
			.GetRequiredService<AppDbContext>()
			.Database.GetConnectionString();

		if (connectionString is null) {
			throw new InvalidOperationException("Test database connection string was null.");
		}

		return connectionString;
	}

	private AppDbContext CreateDbContext() {
		return new AppDbContext(
			new DbContextOptionsBuilder<AppDbContext>()
				.UseNpgsql(BaseConnectionString())
				.Options
		);
	}

	// A deterministic IJobQueueSignal that just counts wakes.
	private sealed class RecordingSignal : IJobQueueSignal {
		private int _notifications;

		public int Notifications {
			get { return Volatile.Read(ref _notifications); }
		}

		public void Notify() {
			Interlocked.Increment(ref _notifications);
		}

		public Task WaitAsync(TimeSpan timeout, CancellationToken cancellationToken) {
			return Task.CompletedTask;
		}
	}

	private sealed class SilentTimeoutSignal : IJobQueueSignal {
		public TaskCompletionSource WaitStarted { get; } =
			new(TaskCreationOptions.RunContinuationsAsynchronously);

		public int Notifications { get; private set; }

		public void Notify() {
			Notifications++;
		}

		public async Task WaitAsync(TimeSpan timeout, CancellationToken cancellationToken) {
			WaitStarted.TrySetResult();
			await Task.Delay(timeout, cancellationToken);
		}
	}

	private sealed class RecordingHandler : IJobHandler {
		public RecordingHandler(string jobType) {
			JobType = jobType;
		}

		public string JobType { get; }
		public TaskCompletionSource Processed { get; } =
			new(TaskCreationOptions.RunContinuationsAsynchronously);

		public Task<JobOutcome> HandleAsync(
			JobContext context,
			CancellationToken cancellationToken
		) {
			Processed.TrySetResult();
			return Task.FromResult<JobOutcome>(JobOutcome.Succeeded);
		}
	}
}
