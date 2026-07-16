namespace PublyApp.Api.Infrastructure.Jobs;

/// <summary>
/// Composition seam for the job engine. Kept in its own extension file (not inline in
/// ServiceRegistration.AddInfraServices) so the engine phases don't contend on the
/// files Phase 2B owns (Program.cs / ServiceRegistration.cs / AppEnvironment.cs).
/// Targets IHostApplicationBuilder (design §3.2, F17) so 2B's worker Generic Host and
/// the web builder share one registration surface.
///
/// NOTE (wiring gap, handed to 2B): nothing invokes these yet — deliberately, to
/// respect the phase file boundaries. Until 2B calls AddWorkerServices from the
/// role-gated composition root (Worker/All) and AddJobProducerServices everywhere,
/// the engine is inert at runtime. Engine correctness is proven by driving the
/// processor's public methods directly in specs.
/// </summary>
public static class JobsServiceRegistration {
	/// <summary>
	/// Worker-only consumers: the processor hosted service + its registry/metrics.
	/// 2B gates the call site on APP_ROLE (Worker/All).
	/// </summary>
	public static IHostApplicationBuilder AddWorkerServices(this IHostApplicationBuilder builder) {
		// Singletons: the registry's fail-fast duplicate check runs once at startup;
		// the metrics wrapper owns process-wide Meter instruments.
		builder.Services.AddSingleton<JobsMetrics>();
		builder.Services.AddSingleton<JobHandlerRegistry>();
		builder.Services.AddHostedService<JobQueueProcessor>();

		return builder;
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
}
