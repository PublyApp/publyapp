using System.Diagnostics;

using FluentAssertions;

using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Jobs;
using PublyApp.Api.Infrastructure.Messaging.Email;
using PublyApp.Api.Lib.Diagnostics;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Auth.Jobs;
using PublyApp.Api.Modules.Invitations.Jobs;
using PublyApp.Api.Modules.Jobs.Jobs;
using PublyApp.Api.Modules.Messaging.Jobs;

using Xunit;

namespace PublyApp.Api.Lib.Architecture;

// Architecture guard for APP_ROLE composition (design §3.2, audit F17), the composition
// analogue of ServiceArgsRecordConvention.Spec: it composes hosts through the SAME public
// builder methods Program.Main uses (CreateWebHostBuilder / CreateWorkerHostBuilder /
// ConfigureHttpPipeline) and asserts the facts by reflection, without mutating the
// process-wide APP_ROLE — so a regression (an endpoint or HTTP server leaking into the
// worker, a job hosted-service leaking into the api) fails the build.
//
// Uses ApiFixture only to guarantee AppEnvironment is initialized; each test builds its
// own host per role and never starts it, so nothing binds or runs during the assertions.
public sealed class AppRoleCompositionSpec : IClassFixture<ApiFixture> {
	// The worker-only job hosted services the worker/all roles must register — and that
	// must never appear in the api role. InvitationEmailOutboxDispatcher is on this list
	// even though it lives outside Infrastructure.Jobs: it is a BackgroundService that
	// claims outbox rows, which is what makes it a job hosted service (design §3.2, C5).
	private static readonly Type[] JobHostedServiceTypes = [
		typeof(WorkerMigrationStartupGate),
		typeof(JobQueueProcessor),
		typeof(SchedulerLeaderService),
		typeof(JobQueueListener),
		typeof(JobQueueMonitorService),
		typeof(WorkerHeartbeatService),
		typeof(InvitationEmailOutboxDispatcher),
	];

	// The ONLY hosted services permitted in the Api-role graph. Every entry needs a
	// reason it performs no background/queue work. Identified by full type name because
	// the framework types here are internal and cannot be referenced with typeof.
	private static readonly string[] ApiRoleAllowedHostedServices = [
		// Registered by AddHealthChecks() in AddInfraServices. It only pushes health
		// results to registered IHealthCheckPublisher implementations — we register
		// none, so it is inert. It claims no work and touches no queue.
		"Microsoft.Extensions.Diagnostics.HealthChecks.HealthCheckPublisherHostedService",

		// Registered by AddDataProtection() (SocialAccounts master-key encryption). It
		// activates the key ring once at startup (load/refresh/purge policy); it claims
		// no queue work and runs no loop, so it is api-safe (design §3.2).
		"Microsoft.AspNetCore.DataProtection.Internal.DataProtectionHostedService",

		// The WebApplication's own HTTP server host: it starts/stops Kestrel, which is
		// exactly the api role's purpose (design §3.2 — the api serves HTTP). It runs no
		// queue/background job work. It surfaces here (and not in the old descriptor-only
		// guard) because the guard now inspects the RESOLVED IEnumerable<IHostedService>
		// that Host.StartAsync actually starts, where the web host service is added during
		// Build(). Absent in the Worker Generic Host (no Kestrel), so it never masks a leak.
		"Microsoft.AspNetCore.Hosting.GenericWebHostService",

		// Registered by AddPublyLogging in EVERY role (#1708). StartAsync is a no-op; the
		// whole point is StopAsync, which calls Serilog's CloseAndFlush so the last lines
		// written during shutdown reach the sink instead of dying in the buffer. It owns no
		// loop, no timer and no queue: it does nothing at all until the host stops.
		"PublyApp.Api.Lib.Logging.SerilogFlushOnShutdown",
	];

	public AppRoleCompositionSpec(ApiFixture fixture) {
		// Referencing the fixture forces its initialization (Testcontainers env +
		// AppEnvironment.Initialize) before any host is composed below.
		_ = fixture;
	}

	// --- api role: full HTTP surface, ZERO job hosted services ------------------

	[Fact]
	public void ItShouldMapEndpointsAndRegisterZeroJobHostedServicesForTheApiRole() {
		var builder = Program.CreateWebHostBuilder([], AppRole.Api);
		AssertNoDirectHostedServiceCollectionRegistration(builder.Services);
		AssertAllHostedServiceDescriptorsAreSingleton(builder.Services);

		using var app = builder.Build();
		Program.ConfigureHttpPipeline(app);

		AssertResolvedHostedServicesAreAllowlisted(app.Services);

		CountMappedEndpoints(app).Should().BeGreaterThan(0, "the api role maps the HTTP surface");
		app.Services.GetService<IServer>()
			.Should().NotBeNull("the api role hosts a real HTTP server");

		AssertJobProducerResolves(app.Services, "api");
	}

	// --- worker role: Generic Host — NO HTTP server exists, full graph resolves --

	[Fact]
	public void ItShouldHostNoHttpServerButStillResolveItsFullGraphForTheWorkerRole() {
		var builder = Program.CreateWorkerHostBuilder([]);

		// The worker runs the job engine ...
		AssertHasJobHostedServices(builder.Services);

		using var host = builder.Build();

		// ... and is a genuine Generic Host (F17): no server type is registered AT ALL —
		// not Kestrel, not any IServer — so nothing can listen on any port and
		// ASPNETCORE_URLS is inert. This is stronger than "zero mapped endpoints".
		host.Services.GetService<IServer>()
			.Should().BeNull("the worker Generic Host must not contain an HTTP server");
		host.Services.GetService<EndpointDataSource>()
			.Should().BeNull("the worker Generic Host has no endpoint routing at all");

		// ... yet still resolves its full service graph without web registrations:
		// AddDbContext's tenant resolution depends on IHttpContextAccessor, which now
		// lives in shared infra registration (F17) and yields a null HttpContext here.
		host.Services.GetService<IHttpContextAccessor>()
			.Should().NotBeNull("DbContext tenant resolution depends on IHttpContextAccessor");
		using var scope = host.Services.CreateScope();
		scope.ServiceProvider.GetRequiredService<AppDbContext>()
			.Should().NotBeNull("the worker must resolve AppDbContext to run jobs");

		AssertJobProducerResolves(host.Services, "worker");
		AssertEmailJobHandlersResolve(host.Services);
	}

	// --- all role: both surfaces -------------------------------------------------

	[Fact]
	public void ItShouldRegisterBothSurfacesForTheAllRole() {
		var builder = Program.CreateWebHostBuilder([], AppRole.All);
		AssertHasJobHostedServices(builder.Services);

		using var app = builder.Build();
		Program.ConfigureHttpPipeline(app);

		CountMappedEndpoints(app).Should().BeGreaterThan(0, "the all role maps the HTTP surface");
		app.Services.GetService<IServer>()
			.Should().NotBeNull("the all role hosts a real HTTP server");

		AssertJobProducerResolves(app.Services, "all");
		AssertEmailJobHandlersResolve(app.Services);
	}

	// --- red controls: the guard must FAIL on a hosted-service leak -----------------

	// Non-vacuity: re-adding a job hosted service to the api graph as an ordinary
	// IHostedService descriptor must make the resolved-collection allowlist FAIL. Without
	// this control, an allowlist that silently matched everything would pass the positive
	// api test above.
	[Fact]
	public void ItShouldFailTheAllowlistWhenAJobHostedServiceIsReAddedToTheApiRole() {
		var builder = Program.CreateWebHostBuilder([], AppRole.Api);
		builder.Services.AddSingleton<IHostedService, InvitationEmailOutboxDispatcher>();

		using var app = builder.Build();

		var act = () => AssertResolvedHostedServicesAreAllowlisted(app.Services);

		act.Should().Throw<Exception>("a re-added job hosted service must be caught by the allowlist")
			.Which.Message.Should().Contain(nameof(InvitationEmailOutboxDispatcher));
	}

	// Non-vacuity for the direct-collection hole (finding F2): registering
	// IEnumerable<IHostedService> DIRECTLY makes DI resolve THAT collection verbatim (a
	// TryCreateExact match wins over the synthesized enumerable), so Host.StartAsync would
	// start the dispatcher in the api process — yet no individual IHostedService descriptor
	// exists, so a per-descriptor filter would pass. The shape guard must reject it at
	// construction time.
	[Fact]
	public void ItShouldRejectADirectHostedServiceCollectionRegistrationInTheApiRole() {
		var builder = Program.CreateWebHostBuilder([], AppRole.Api);
		builder.Services.AddSingleton<IEnumerable<IHostedService>>(serviceProvider => [
			ActivatorUtilities.CreateInstance<InvitationEmailOutboxDispatcher>(serviceProvider),
		]);

		using var app = builder.Build();

		// The hole is real: the collection Host.StartAsync resolves IS the direct
		// registration — it runs a job hosted service — and a per-descriptor filter over
		// IHostedService descriptors never sees it because none exists.
		app.Services.GetServices<IHostedService>()
			.Should().ContainSingle()
			.Which.Should().BeOfType<InvitationEmailOutboxDispatcher>(
				"DI resolves the direct IEnumerable<IHostedService> registration verbatim");

		// The shape guard rejects it at construction time.
		var act = () => AssertNoDirectHostedServiceCollectionRegistration(builder.Services);

		act.Should().Throw<Exception>("a direct hosted-service collection must be rejected")
			.Which.Message.Should().Contain("IEnumerable<IHostedService>");
	}

	// Non-vacuity for the split-resolution hole (finding F2): Host.StartAsync caches its OWN
	// GetRequiredService<IEnumerable<IHostedService>>() resolution, so a TRANSIENT/stateful
	// factory can hand the guard's external GetServices<IHostedService>() one (allowlisted)
	// type and the host's later resolution a different (job) type. A per-instance allowlist
	// snapshot cannot see that; the descriptor-lifetime guard rejects any non-singleton
	// IHostedService at construction time, before either resolution can diverge.
	[Fact]
	public void ItShouldRejectANonSingletonHostedServiceDescriptorInTheApiRole() {
		var builder = Program.CreateWebHostBuilder([], AppRole.Api);

		// A stateful factory: allowlisted-looking on the FIRST resolution, a job hosted
		// service on every later one — the exact shape that fools an external snapshot.
		var resolutions = 0;
		builder.Services.AddTransient<IHostedService>(serviceProvider => {
			resolutions++;

			return resolutions == 1
				? new InertProbeHostedService()
				: ActivatorUtilities.CreateInstance<InvitationEmailOutboxDispatcher>(serviceProvider);
		});

		using var app = builder.Build();

		// The vector is real: two independent resolutions of the SAME descriptor yield
		// different concrete types, so a guard that inspects one cannot vouch for the other.
		var firstResolution = app.Services.GetServices<IHostedService>()
			.Select(hostedService => hostedService.GetType()).ToList();
		var secondResolution = app.Services.GetServices<IHostedService>()
			.Select(hostedService => hostedService.GetType()).ToList();
		firstResolution.Should().NotBeEquivalentTo(secondResolution,
			"a transient stateful factory returns different types on successive resolutions");

		// The fix closes it by construction, before any resolution happens. The rejection
		// keys on the descriptor LIFETIME — the split-resolution vector — not on what the
		// factory returns (a factory's concrete type is unknowable before resolution, which
		// is precisely why a resolved snapshot cannot be trusted for a non-singleton).
		var act = () => AssertAllHostedServiceDescriptorsAreSingleton(builder.Services);

		act.Should().Throw<Exception>("a non-singleton hosted service must be rejected by shape")
			.Which.Message.Should().Contain(nameof(ServiceLifetime.Transient));
	}

	// Non-vacuity for the Testing-vs-Production hole (finding F2): the integration fixture
	// pins ASPNETCORE_ENVIRONMENT=Testing process-wide, so a same-process guard composed
	// with the default builder cannot see a registration gated on
	// builder.Environment.IsProduction(). Composing the api builder UNDER Production
	// (--environment Production) makes that branch live, and the resolved-collection
	// allowlist then catches the Production-only leak it would otherwise miss.
	[Fact]
	public void ItShouldCatchAProductionOnlyHostedServiceWhenComposedUnderProduction() {
		var builder = CreateApiBuilderUnderProduction();

		builder.Environment.IsProduction().Should().BeTrue(
			"the guard must compose the api graph under Production so a Production-only "
			+ "hosted registration is visible (finding F2); otherwise this control is vacuous");

		if (builder.Environment.IsProduction()) {
			builder.Services.AddSingleton<IHostedService, InvitationEmailOutboxDispatcher>();
		}

		using var app = builder.Build();

		var act = () => AssertResolvedHostedServicesAreAllowlisted(app.Services);

		act.Should().Throw<Exception>("a Production-only job hosted service must be caught")
			.Which.Message.Should().Contain(nameof(InvitationEmailOutboxDispatcher));
	}

	// The api positive test also holds under Production composition: the allowlist is the
	// same in every environment, so the only hosted services the Production-composed api
	// graph starts are the allowlisted web-host + health-publisher services.
	[Fact]
	public void ItShouldRegisterZeroJobHostedServicesForTheApiRoleUnderProduction() {
		var builder = CreateApiBuilderUnderProduction();
		AssertNoDirectHostedServiceCollectionRegistration(builder.Services);
		AssertAllHostedServiceDescriptorsAreSingleton(builder.Services);

		using var app = builder.Build();

		AssertResolvedHostedServicesAreAllowlisted(app.Services);
	}

	// The strongest fidelity control (finding F2): resolve the api-role hosted-service graph
	// in a REAL isolated Production process — ASPNETCORE_ENVIRONMENT=Production, APP_ROLE=api
	// — via the shipped --print-hosted-services probe, so BOTH AppEnvironment and the host's
	// IHostEnvironment resolve to Production exactly as deployment does. The in-process guard
	// (pinned to Testing by the fixture) cannot reproduce that; this asserts every hosted
	// service the deployed api process would START is on the allowlist.
	[Fact]
	public void ItShouldStartOnlyAllowlistedHostedServicesForTheApiRoleInAProductionProcess() {
		var resolved = RunHostedServiceManifestInProductionProcess(appRole: "api");

		resolved.Should().NotBeEmpty(
			"the api role starts at least the web host service, so a clean probe is non-empty");

		List<string> unexpected = resolved
			.Where(name => !ApiRoleAllowedHostedServices.Contains(name, StringComparer.Ordinal))
			.ToList();

		unexpected.Should().BeEmpty(
			"a REAL Production api process must START ZERO job/worker hosted services "
			+ "(design §3.2, D1); unexpected: " + string.Join(", ", unexpected));
	}

	// --- helpers ------------------------------------------------------------------

	// Composes the api-role builder with the host environment pinned to Production via the
	// standard --environment switch, without mutating the process-wide ASPNETCORE_ENVIRONMENT
	// the integration fixture set to Testing. This flips builder.Environment (the
	// IHostEnvironment source composition gates hosted registrations on) to Production.
	private static WebApplicationBuilder CreateApiBuilderUnderProduction() {
		return Program.CreateWebHostBuilder(
			["--environment", EnvironmentNames.Production], AppRole.Api);
	}

	// Spawns the shipped api assembly as an isolated child process configured exactly like a
	// production api deployment and parses the --print-hosted-services manifest it emits.
	private static List<string> RunHostedServiceManifestInProductionProcess(string appRole) {
		var assemblyPath = typeof(Program).Assembly.Location;

		var startInfo = new ProcessStartInfo {
			FileName = Environment.ProcessPath ?? "dotnet",
			RedirectStandardOutput = true,
			RedirectStandardError = true,
			UseShellExecute = false,
			WorkingDirectory = Path.GetDirectoryName(assemblyPath),
		};
		startInfo.ArgumentList.Add("exec");
		startInfo.ArgumentList.Add(assemblyPath);
		startInfo.ArgumentList.Add(HostedServiceManifestCli.PrintArg);

		// The child inherits the parent's environment (all AppEnvironment config values plus
		// the Testcontainer connection string are present as real process env vars), then
		// overrides host environment to Production and pins APP_ROLE=api — the deployed api
		// shape. DOTNET_ENVIRONMENT is cleared so it cannot shadow ASPNETCORE_ENVIRONMENT.
		startInfo.Environment["ASPNETCORE_ENVIRONMENT"] = EnvironmentNames.Production;
		startInfo.Environment.Remove("DOTNET_ENVIRONMENT");
		startInfo.Environment["APP_ROLE"] = appRole;

		var process = Process.Start(startInfo);
		if (process is null) {
			throw new InvalidOperationException(
				"Failed to launch the api assembly for the composition probe.");
		}

		using var _ = process;

		var stdout = process.StandardOutput.ReadToEnd();
		var stderr = process.StandardError.ReadToEnd();
		process.WaitForExit(milliseconds: 120_000).Should().BeTrue(
			"the composition probe must finish promptly; stderr: " + stderr);

		process.ExitCode.Should().Be(
			HostedServiceManifestCli.SuccessExitCode,
			"the probe composes and exits cleanly; stdout: " + stdout + " stderr: " + stderr);

		stdout.Should().Contain(HostedServiceManifestCli.EndMarker,
			"a complete enumeration ends with the marker; a crash mid-compose would omit it. "
			+ "stdout: " + stdout + " stderr: " + stderr);

		return stdout
			.Split('\n', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
			.Where(line => line.StartsWith(HostedServiceManifestCli.LinePrefix, StringComparison.Ordinal))
			.Select(line => line[HostedServiceManifestCli.LinePrefix.Length..])
			.ToList();
	}

	// An inert IHostedService used only as the innocuous first return of a stateful transient
	// factory red control — it does no work and is never actually started.
	private sealed class InertProbeHostedService : IHostedService {
		public Task StartAsync(CancellationToken cancellationToken) {
			return Task.CompletedTask;
		}

		public Task StopAsync(CancellationToken cancellationToken) {
			return Task.CompletedTask;
		}
	}

	private static int CountMappedEndpoints(WebApplication app) {
		return ((IEndpointRouteBuilder)app).DataSources.Sum(dataSource => dataSource.Endpoints.Count);
	}

	// STRUCTURAL negative guard, allowlist-based (design §3.2, C5): resolve the EXACT
	// IEnumerable<IHostedService> that Host.StartAsync starts and assert each concrete type
	// in it is on the allowlist above. Deliberately NOT keyed on the Infrastructure.Jobs
	// namespace.
	//
	// The namespace filter this replaced was structurally blind to the exact defect it
	// existed to catch: InvitationEmailOutboxDispatcher is a BackgroundService — a job
	// hosted service by behaviour — but it lives in Infrastructure.Messaging.Email, so a
	// namespace-keyed guard skipped it while it was registered in shared AddInfraServices
	// and both deployed containers double-claimed invitation_email_outbox. "New worker
	// services can't leak" only held for services someone remembered to put in the right
	// namespace; the leak came from one that was not.
	//
	// An allowlist inverts the burden of proof: a hosted service is a background worker
	// unless it is named here with a reason, so ANY new registration in the api graph —
	// any namespace, any assembly, framework or ours — fails this spec until a human
	// justifies it. That is the property D1 needs ("api registers no job hosted-services"),
	// and it does not depend on where a file happens to live.
	//
	// Resolving the collection (rather than filtering individual descriptors) is what
	// closes the direct-IEnumerable<IHostedService> hole (finding F2): DI returns the same
	// instances the host would start — whatever registration shape produced them, an
	// individual descriptor, a factory, or a direct collection registration — so their real
	// concrete types are always inspected, never assumed.
	private static void AssertResolvedHostedServicesAreAllowlisted(IServiceProvider services) {
		List<string> unexpected = services
			.GetServices<IHostedService>()
			.Select(hostedService =>
				hostedService.GetType().FullName ?? hostedService.GetType().Name)
			.Where(name => !ApiRoleAllowedHostedServices.Contains(name, StringComparer.Ordinal))
			.ToList();

		unexpected.Should().BeEmpty(
			"the api role must START ZERO job/worker hosted services (design §3.2, D1); "
			+ "unexpected: " + string.Join(", ", unexpected)
			+ " — if one of these is genuinely api-safe, add it to "
			+ nameof(ApiRoleAllowedHostedServices)
			+ " with the reason it runs no background work"
		);
	}

	// A direct IEnumerable<IHostedService> registration (factory or instance) is resolved by
	// DI *instead of* the collection synthesized from individual IHostedService descriptors
	// (TryCreateExact wins over TryCreateEnumerable), so Host.StartAsync would start whatever
	// it yields. There is no api-safe reason to register the hosted-service collection
	// directly, so the SHAPE is rejected at construction time: it keeps "fail by
	// construction" intact for a registration whose future contents a resolved snapshot
	// cannot vouch will stay allowlisted.
	private static void AssertNoDirectHostedServiceCollectionRegistration(
		IServiceCollection services
	) {
		List<string> direct = services
			.Where(descriptor => descriptor.ServiceType == typeof(IEnumerable<IHostedService>))
			.Select(DescribeHostedServiceCollection)
			.ToList();

		direct.Should().BeEmpty(
			"nothing may register IEnumerable<IHostedService> directly in the api graph: DI "
			+ "resolves such a registration instead of synthesizing the collection from "
			+ "individual IHostedService descriptors, so Host.StartAsync would start whatever "
			+ "it yields with no per-descriptor entry for "
			+ nameof(ApiRoleAllowedHostedServices) + " to inspect (design §3.2, D1)"
		);
	}

	// Non-singleton IHostedService descriptors are the split-resolution vector (finding F2):
	// Host.StartAsync resolves and CACHES its own IEnumerable<IHostedService>, distinct from
	// the guard's external GetServices<IHostedService>() call. A singleton resolves to the
	// same instance in both, so the resolved-collection allowlist is authoritative; a
	// transient/scoped one need not, so a stateful factory could show the guard an allowlisted
	// type and the host a job service. There is no api-safe reason to register a non-singleton
	// hosted service, so the LIFETIME is rejected at construction time — keeping the allowlist
	// snapshot trustworthy by construction.
	private static void AssertAllHostedServiceDescriptorsAreSingleton(IServiceCollection services) {
		List<string> nonSingleton = services
			.Where(descriptor =>
				descriptor.ServiceType == typeof(IHostedService)
				&& descriptor.Lifetime != ServiceLifetime.Singleton)
			.Select(descriptor =>
				$"{DescribeHostedServiceImplementation(descriptor)} ({descriptor.Lifetime})")
			.ToList();

		nonSingleton.Should().BeEmpty(
			"every IHostedService in the api graph must be a Singleton: Host.StartAsync caches "
			+ "its OWN GetRequiredService<IEnumerable<IHostedService>>() resolution, so a "
			+ "transient/scoped hosted service can hand the external allowlist guard one type "
			+ "and the host another (finding F2); a singleton resolves identically in both, "
			+ "making the resolved-collection allowlist authoritative");
	}

	// Best-effort concrete type name for an IHostedService descriptor, whatever registration
	// shape it took (implementation type, instance, or factory).
	private static string DescribeHostedServiceImplementation(ServiceDescriptor descriptor) {
		if (descriptor.ImplementationType is not null) {
			return descriptor.ImplementationType.FullName ?? descriptor.ImplementationType.Name;
		}

		if (descriptor.ImplementationInstance is not null) {
			var instanceType = descriptor.ImplementationInstance.GetType();

			return instanceType.FullName ?? instanceType.Name;
		}

		// A factory registration: its concrete type is unknowable before resolution, which
		// is exactly why a non-singleton one cannot be vouched for by a resolved snapshot.
		return "(IHostedService factory registration)";
	}

	private static string DescribeHostedServiceCollection(ServiceDescriptor descriptor) {
		if (descriptor.ImplementationType is not null) {
			return descriptor.ImplementationType.FullName ?? descriptor.ImplementationType.Name;
		}

		if (descriptor.ImplementationInstance is not null) {
			var instanceType = descriptor.ImplementationInstance.GetType();

			return instanceType.FullName ?? instanceType.Name;
		}

		return "(IEnumerable<IHostedService> factory registration)";
	}

	// The trusted enqueue boundary (IJobEnqueuer) is the producer surface and must
	// resolve in EVERY role (design §3.2 matrix, last row). Scoped, so resolve inside
	// a scope; resolving also proves its dependency graph (AppDbContext) is intact.
	private static void AssertJobProducerResolves(IServiceProvider services, string roleName) {
		using var scope = services.CreateScope();
		scope.ServiceProvider.GetService<IJobEnqueuer>()
			.Should().NotBeNull($"the {roleName} role must resolve the IJobEnqueuer producer boundary");
	}

	private static void AssertEmailJobHandlersResolve(IServiceProvider services) {
		var registry = services.GetRequiredService<JobHandlerRegistry>();
		registry.RegisteredJobTypes.Should().BeEquivalentTo([
			InvitationEmailJobs.TenantInvitationV1.JobType,
			InvitationEmailJobs.StaffInvitationV1.JobType,
			PublyApp.Api.Modules.Profiles.Jobs.StaffProfileEmailJobs.StaffJoinedNotificationV1.JobType,
			AuthEmailJobs.PasswordResetV1.JobType,
			AuthEmailJobs.VerifyEmailV1.JobType,
			CleanupExpiredSessionsHandler.JobKey,
			EmailLogRetentionHandler.JobKey,
			DeadLetterRetentionHandler.JobKey,
			SystemJobOccurrenceRetentionHandler.JobKey,
			EmailPreparedSendsRetentionHandler.JobKey,
			PublyApp.Api.Modules.Uploads.Jobs.UploadOrphanReclaimerHandler.JobKey,
			PublyApp.Api.Modules.Publishing.Jobs.PublishingJobs.PublishPublicationV1.JobType,
			PublyApp.Api.Modules.Publishing.Jobs.DispatchDuePostsJob.JobKey,
		]);
	}

	private static void AssertHasJobHostedServices(IServiceCollection services) {
		var jobHostedServiceOrder = services
			.Where(descriptor =>
				descriptor.ServiceType == typeof(IHostedService)
				&& descriptor.ImplementationType is not null
				&& JobHostedServiceTypes.Contains(descriptor.ImplementationType))
			.Select(descriptor => descriptor.ImplementationType)
			.ToList();

		jobHostedServiceOrder.Should().NotBeEmpty();
		jobHostedServiceOrder[0].Should().Be(
			typeof(WorkerMigrationStartupGate),
			"the migration gate must start before every job-processing hosted service"
		);

		foreach (var hostedServiceType in JobHostedServiceTypes) {
			HasHostedService(services, hostedServiceType)
				.Should().BeTrue($"the worker/all role must register {hostedServiceType.Name}");
		}
	}

	private static bool HasHostedService(IServiceCollection services, Type implementationType) {
		return services.Any(descriptor =>
			descriptor.ServiceType == typeof(IHostedService)
			&& descriptor.ImplementationType == implementationType);
	}
}
