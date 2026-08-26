using Microsoft.Extensions.DependencyInjection.Extensions;

using PublyApp.Api.Infrastructure.Jobs.Quartz;
using PublyApp.Api.Infrastructure.Messaging.Email;
using PublyApp.Api.Lib;
using PublyApp.Api.Modules.Auth.Jobs;
using PublyApp.Api.Modules.Invitations.Jobs;
using PublyApp.Api.Modules.Jobs.Jobs;
using PublyApp.Api.Modules.Messaging.Jobs;
using PublyApp.Api.Modules.Profiles.Jobs;
using PublyApp.Api.Modules.Publishing.Jobs;
using PublyApp.Api.Modules.SocialAccounts.Services;
using PublyApp.Api.Modules.Uploads.Jobs;

namespace PublyApp.Api.Infrastructure.Jobs;

/// <summary>
/// Composition seam for the job engine. Kept in its own extension file (not inline in
/// ServiceRegistration.AddInfraServices) so the engine phases don't contend on the
/// files Phase 2B owns (Program.cs / ServiceRegistration.cs / AppEnvironment.cs).
/// Targets IHostApplicationBuilder (design §3.2, F17) so the worker Generic Host and
/// the web builder share one registration surface. Phase 2B wires the call sites in
/// Program.Main's role branching: <see cref="AddWorkerServices"/> only for Worker/All
/// (the Api role registers ZERO of it — asserted by AppRoleComposition.Spec) and
/// <see cref="AddJobProducerServices"/> in EVERY role.
/// </summary>
public static class JobsServiceRegistration {
	/// <summary>
	/// Worker-only consumers (design §3.2 matrix): the queue processor, the scheduler
	/// leader (Quartz), the liveness heartbeat, and the transitional legacy invitation
	/// email drainer, plus their dependencies. Invoked ONLY for the Worker (Generic
	/// Host) and All (web host) compositions.
	/// </summary>
	public static IHostApplicationBuilder AddWorkerServices(this IHostApplicationBuilder builder) {
		var env = AppEnvironment.Instance;

		// Bounded cooperative shutdown so SchedulerLeaderService can drain Quartz and
		// release its advisory lock on SIGTERM (design §3.6).
		builder.Services.Configure<HostOptions>(options => {
			options.ShutdownTimeout = TimeSpan.FromSeconds(30);
		});

		// Env-surfaced processor tuning (design §3.1): the record's own defaults match
		// the pre-2B code constants, so specs constructing the processor without
		// options and this env-derived instance can never drift apart silently.
		builder.Services.AddSingleton(new JobQueueProcessorOptions {
			BatchSize = env.JOB_QUEUE_BATCH_SIZE,
			LeaseSeconds = env.JOB_LEASE_SECONDS,
			PollSeconds = env.JOB_QUEUE_POLL_SECONDS,
			DrainBudgetSeconds = env.JOB_QUEUE_DRAIN_BUDGET_SECONDS,
		});
		builder.Services.AddSingleton(new WorkerMigrationStartupGateOptions {
			FailFastWhenMigrationsPending = AppEnvironment.IsDevelopment,
		});

		// The scheduler leader takes a dedicated, non-pooled connection to the same
		// database the DbContext uses (design §5.2).
		builder.Services.AddSingleton(new SchedulerLeaderOptions {
			ConnectionString = env.POSTGRES_CONNECTION_STRING,
		});

		// Singletons: the registry's fail-fast duplicate check runs once at startup
		// over the JobHandlerRegistration descriptors (it holds types + factories,
		// never handler instances); the metrics wrapper owns process-wide Meter
		// instruments; the worker instance id is generated exactly once per replica
		// and shared, because §7.1 requires the metrics `instance` tag and
		// job_queue.locked_by to be the SAME value — a second registration of a
		// second generator is the one way to break that silently.
		builder.Services.AddSingleton<JobWorkerInstance>();
		builder.Services.AddSingleton<JobsMetrics>();
		builder.Services.AddSingleton<JobHandlerRegistry>();
		builder.Services.AddSingleton<IJobQueueSignal, JobQueueSignal>();
		builder.Services.AddSingleton<SchedulerSyncState>();

		// Quartz jobs are resolved per-fire from a DI scope by ScopedJobFactory, so they
		// register as transient (each carries a scoped AppDbContext dependency).
		builder.Services.AddTransient<SyncSystemJobsJob>();
		builder.Services.AddTransient<RecoverStaleJobsJob>();
		builder.Services.AddTransient<EnqueueSystemJobJob>();

		// Hosted services start sequentially in registration order. Keep the migration gate
		// first so no processor, listener, scheduler, monitor, or heartbeat starts early.
		builder.Services.AddHostedService<WorkerMigrationStartupGate>();

		// Every worker runs the generic queue processor; only the leader runs Quartz.
		builder.Services.AddHostedService<JobQueueProcessor>();
		builder.Services.AddHostedService<JobQueueListener>();
		builder.Services.AddHostedService<SchedulerLeaderService>();
		builder.Services.AddHostedService<JobQueueMonitorService>();
		builder.Services.AddHostedService<WorkerHeartbeatService>();

		// Transitional legacy drainer (design §3.2 C5/R2-6, §4.6). The shipped
		// InvitationEmailOutboxDispatcher is a BackgroundService — a job hosted service —
		// so it obeys the same rule as the engine above: worker-only composition, never
		// shared infra. It lives outside Infrastructure.Jobs, which is precisely why the
		// composition guard enumerates EVERY IHostedService rather than one namespace.
		// 2C-R1 retains it as-is; R2 deletes it.
		builder.Services.AddHostedService<InvitationEmailOutboxDispatcher>();
		// Publishing (Epic D/D1, lane wt-644) converges with Epic C (lane wt-641),
		// which owns the REAL ISocialSessionProvider implementation. Until the lanes
		// rebase onto each other this branch legitimately carries none, so register a
		// fail-fast placeholder ONLY when the interface is still unregistered: the
		// LAST registration wins in Microsoft.Extensions.DependencyInjection, so once
		// wt-641's AddAppServices registers BlueskySessionProvider AFTER this block,
		// its real implementation silently replaces the placeholder — no code change
		// needed at the convergence rebase. The placeholder must stay RESOLVABLE:
		// JobHandlerRegistry.ValidateRegistrationConsistency composes every handler
		// once at startup, so throwing from resolution would brick the whole worker.
		// Instead it throws on first USE — a publish job that actually runs without
		// a real seam dies loudly instead of publishing with a fake session.
		builder.Services.TryAddScoped<ISocialSessionProvider>(_ => {
			return new UnimplementedSocialSessionProvider();
		});

		AddEmailJobHandlers(builder);
		AddPublishingJobHandlers(builder);

		return builder;
	}

	// Publishing job handlers (Epic D §3/D1): the worker-side delivery of one
	// publication. Same scoped-handler contract as the email handlers above; the
	// provider seam and the transition service resolve from the same per-job scope.
	private static void AddPublishingJobHandlers(IHostApplicationBuilder builder) {
		builder.AddJobHandler<PublishPublicationJobHandler>(
			PublishingJobs.PublishPublicationV1.JobType
		);
	}

	// Email job handlers (design §5.4). Built to the finalized engine contract: SCOPED,
	// constructor-injected AppDbContext, resolved from a fresh per-job DI scope; a
	// handler's context shares the terminal (DLQ) transaction so OnTerminalFailureAsync's
	// email_log(PermanentlyFailed) write commits atomically with the dead-letter.
	private static void AddEmailJobHandlers(IHostApplicationBuilder builder) {
		builder.AddJobHandler<TenantInvitationEmailJobHandler>(
			InvitationEmailJobs.TenantInvitationV1.JobType
		);
		builder.AddJobHandler<PasswordResetEmailJobHandler>(
			AuthEmailJobs.PasswordResetV1.JobType
		);
		builder.AddJobHandler<EmailVerificationEmailJobHandler>(
			AuthEmailJobs.VerifyEmailV1.JobType
		);

		builder.AddJobHandler<StaffInvitationEmailJobHandler>(
			InvitationEmailJobs.StaffInvitationV1.JobType
		);

		// #291: the existing-user "you have been added as a staff member"
		// notification, enqueued by StaffProfileAsStaffService.CreateStaffProfileAsync
		// inside its domain transaction.
		builder.AddJobHandler<StaffJoinedNotificationEmailJobHandler>(
			StaffProfileEmailJobs.StaffJoinedNotificationV1.JobType
		);

		// System job handlers (design §5.3/§7.3): system jobs are seeded into system_job_definitions
		// and dispatched via EnqueueSystemJobJob -> JobQueueProcessor.
		builder.AddJobHandler<CleanupExpiredSessionsHandler>(
			CleanupExpiredSessionsHandler.JobKey
		);
		builder.AddJobHandler<EmailLogRetentionHandler>(
			EmailLogRetentionHandler.JobKey
		);
		builder.AddJobHandler<DeadLetterRetentionHandler>(
			DeadLetterRetentionHandler.JobKey
		);
		builder.AddJobHandler<SystemJobOccurrenceRetentionHandler>(
			SystemJobOccurrenceRetentionHandler.JobKey
		);
		builder.AddJobHandler<EmailPreparedSendsRetentionHandler>(
			EmailPreparedSendsRetentionHandler.JobKey
		);
		// Upload lifecycle sweeper (#807 F6): the only deleter that removes
		// orphaned blobs and releases their bytes from the durable budgets.
		builder.AddJobHandler<UploadOrphanReclaimerHandler>(
			UploadOrphanReclaimerHandler.JobKey
		);
	}

	/// <summary>
	/// Producer surface (design §3.2 matrix, last row): the trusted enqueue boundary
	/// runs in EVERY role — api handlers enqueue, worker jobs may re-enqueue. Scoped:
	/// the enqueuer joins the caller's AppDbContext transaction (F15).
	/// </summary>
	public static IHostApplicationBuilder AddJobProducerServices(
		this IHostApplicationBuilder builder
	) {
		builder.Services.AddScoped<IJobEnqueuer, JobEnqueuer>();

		return builder;
	}

	/// <summary>
	/// Registers one domain job handler: SCOPED (so it can inject AppDbContext and
	/// share the engine's per-job scope — its injected context IS the context the
	/// terminal-failure transaction runs on), plus its registry descriptor.
	/// <paramref name="jobType"/> should come from the handler's JobDefinition
	/// catalog; the engine verifies it matches the resolved handler's own JobType at
	/// dispatch and fails the job loudly on drift.
	/// </summary>
	public static IHostApplicationBuilder AddJobHandler<THandler>(
		this IHostApplicationBuilder builder,
		string jobType
	) where THandler : class, IJobHandler {
		builder.Services.AddScoped<THandler>();
		builder.Services.AddSingleton(
			new JobHandlerRegistration(jobType, sp => sp.GetRequiredService<THandler>())
		);

		return builder;
	}
}

/// <summary>
/// Transitional placeholder for <see cref="ISocialSessionProvider"/> while Epic C
/// (lane wt-641) has not landed its real Bluesky implementation. RESOLVABLE but
/// never usable: every call throws loudly, so a publish job can never run against
/// a fake session. Deleted naturally at the convergence rebase, where wt-641's
/// last-wins registration replaces this placeholder entirely.
/// </summary>
public sealed class UnimplementedSocialSessionProvider : ISocialSessionProvider {
	public Task<SocialSessionResult> OpenSessionAsync(
		Guid socialAccountId,
		CancellationToken cancellationToken
	) {
		throw new InvalidOperationException(
			"ISocialSessionProvider has no implementation registered. "
				+ "Epic C (lane wt-641) owns the Bluesky implementation; D1 only "
				+ "consumes the seam."
		);
	}
}
