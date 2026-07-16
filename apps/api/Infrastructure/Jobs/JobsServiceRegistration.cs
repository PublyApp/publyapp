namespace PublyApp.Api.Infrastructure.Jobs;

/// <summary>
/// Composition seam for the worker-only background-job hosted services. Kept in its
/// own extension file (not inline in ServiceRegistration.AddInfraServices) so Phase 2A
/// can register the engine without contending on the files Phase 2B owns
/// (Program.cs / ServiceRegistration.cs / AppEnvironment.cs) — 2B later wraps this
/// call in APP_ROLE gating (design §3.2, §9).
///
/// NOTE (Phase 2A wiring gap, handed to 2B): nothing invokes AddWorkerServices yet —
/// deliberately, to respect this phase's file boundaries. Until 2B calls it from the
/// role-gated composition root, the JobQueueProcessor hosted service is inert at
/// runtime. Phase 2A correctness is proven by driving the processor's public methods
/// directly in specs, so this does not block 2A's gate.
/// </summary>
public static class JobsServiceRegistration {
	/// <summary>
	/// Registers every worker-only hosted service and its dependencies. Registered
	/// unconditionally for now; 2B adds the role gate around the call site.
	/// </summary>
	public static WebApplicationBuilder AddWorkerServices(this WebApplicationBuilder builder) {
		// Built from the DI-registered IJobHandler set (none in Phase 2A). Singleton:
		// the map is immutable after construction and its fail-fast duplicate check
		// should run once at startup.
		builder.Services.AddSingleton<JobHandlerRegistry>();
		builder.Services.AddHostedService<JobQueueProcessor>();

		return builder;
	}
}
