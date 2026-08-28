using System.Reflection;

using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.Extensions.FileProviders;

using PublyApp.Api.Infrastructure.Jobs;
using PublyApp.Api.Infrastructure.Storage;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Diagnostics;
using PublyApp.Api.Lib.Extensions;
using PublyApp.Api.Lib.Filters;
using PublyApp.Api.Lib.RateLimiting;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Seeding;
using PublyApp.Api.Modules.Account.Endpoints;
using PublyApp.Api.Modules.AuditLogs.Endpoints;
using PublyApp.Api.Modules.Auth.Endpoints;
using PublyApp.Api.Modules.Invitations.Endpoints;
using PublyApp.Api.Modules.Jobs.Endpoints;
using PublyApp.Api.Modules.Permissions.Endpoints;
using PublyApp.Api.Modules.Posts.Endpoints;
using PublyApp.Api.Modules.Profiles.Endpoints;
using PublyApp.Api.Modules.Projects.Endpoints;
using PublyApp.Api.Modules.Publishing.Endpoints;
using PublyApp.Api.Modules.Settings.Endpoints;
using PublyApp.Api.Modules.SocialAccounts.Endpoints;
using PublyApp.Api.Modules.SystemNotices.Endpoints;
using PublyApp.Api.Modules.Tenants.Endpoints;
using PublyApp.Api.Modules.Uploads.Endpoints;
using PublyApp.Api.Modules.Users.Endpoints;

namespace PublyApp.Api;

public class Program {
	/// <summary>
	/// True when the current process is the OpenAPI document generator
	/// (Microsoft.Extensions.ApiDescription.Server's dotnet-getdocument tool), which loads
	/// this assembly and RUNS Main during `dotnet build`/`just build-api`. That process has
	/// no database, so the witness must skip its canary round-trip there (store: null).
	/// The entry assembly is dotnet-getdocument in that process; it is PublyApp.Api (or a
	/// test host) otherwise.
	/// </summary>
	public static bool IsOpenApiGenerationProcess {
		get {
			return Assembly.GetEntryAssembly()?.GetName().Name
				is not "PublyApp.Api" and not null;
		}
	}

	public static void Main(string[] args) {
		// #1309/#1319 boot-log probe (test-only): lets the integration suite observe the
		// canary pass line a REAL boot emits. Arg-gated AND hard-gated (#1319): the arg
		// without PUBLYAPP_TEST_BOOT_PROBE=1|true exits 78 with a plain-words cause
		// BEFORE anything else runs — a refused boot must not depend on any other
		// configuration being present, and a deployed container misconfigured with the
		// arg must die loudly instead of getting the clean-looking exit-0 no-host outage.
		CanaryBootLogProbe.ActivateIfRequested(args);

		// Must precede everything except the #1319 probe gate above: the probe refusal
		// must not depend on any other configuration being present.
		AppEnvironment.Initialize();

		// CLI commands (e.g., seed-bulk, seed-bulk-reset)
		if (BulkSeedCli.TryRun(args)) {
			return;
		}

		// Worker liveness probe (design §3.5): exits 0/1 off the heartbeat file, no host
		// build, no HTTP. Must run before any host builder like the seed CLI.
		if (WorkerHealthCli.TryRun(args)) {
			return;
		}

		// APP_ROLE decides composition (design §3.2). It defaults to All ONLY when the host
		// environment is Development/Testing (§3.1). Under any other host environment —
		// including an UNSET one, which resolves to Production — APP_ROLE is required and a
		// missing value fails fast (AppEnvironment.GetOptionalAppRole); loading
		// .env.development does NOT change that classification. So bare `dotnet build`
		// (OpenAPI generation runs the app) requires APP_ROLE=api: repo builds must use the
		// pinned `just` recipes (build-api, generate-client), which export it.
		var role = AppEnvironment.Instance.Role;

		// Out-of-process composition probe (design §3.2, finding F2): dumps the
		// hosted-service collection the configured role would start, then exits without
		// running the host. It lets AppRoleComposition.Spec assert the api-role graph under
		// a REAL Production process where AppEnvironment and IHostEnvironment both resolve to
		// Production, exactly as deployment does.
		if (HostedServiceManifestCli.TryRun(args, role)) {
			return;
		}

		// Production seed gate probe. This is used by the production-seeding spec to prove
		// demo fixtures are excluded under Production while essential seeders still run.
		if (SeederGateProbeCli.TryRun(args)) {
			return;
		}

		// The Worker role runs a genuine Generic Host (design §3.2, F17): no Kestrel is
		// ever registered, ASPNETCORE_URLS is inert, nothing listens on any port —
		// "zero mapped endpoints" on a web host would still start an HTTP server.
		if (role is AppRole.Worker) {
			using var workerHost = CreateWorkerHostBuilder(args).Build();
			workerHost.LogDiManifestIfPresent();
			// C1-bis: refuse to boot if SOCIAL_ACCOUNTS_MASTER_KEY is missing, wrong-size,
			// or wrong-VALUE. The canary (review r3) decrypts a sentinel persisted beside
			// the key ring, so a divergent api/worker key fails here instead of silently
			// breaking credential decryption later.
			Modules.SocialAccounts.Infrastructure.SocialAccountsMasterKeyWitness
				.EnsureMasterKeyUsable(
					AppEnvironment.Instance.SocialAccountsMasterKey,
					Program.IsOpenApiGenerationProcess
						? null // doc-gen process: no DB, key checks only
						: new Modules.SocialAccounts.Infrastructure.PostgresKeyRingCanaryStore(
							workerHost.Services.GetRequiredService<IServiceScopeFactory>()
						),
					// #1284: one structured Information line when the canary round-trip PASSES,
					// so operators can tell verified boots from doc-gen runs (which skip it).
					workerHost.Services.GetRequiredService<ILoggerFactory>().CreateLogger(
						nameof(Modules.SocialAccounts.Infrastructure.SocialAccountsMasterKeyWitness)
					)
				);
			if (CanaryBootLogProbe.TryExitAfterBootGate()) {
				return; // probe run: boot gates verified, do not start the job engine
			}

			workerHost.Run();
			return;
		}

		var builder = CreateWebHostBuilder(args, role);
		var app = builder.Build();

		// C1-bis: refuse to boot if SOCIAL_ACCOUNTS_MASTER_KEY is missing, wrong-size, or
		// wrong-VALUE (Epic C §4). The canary (review r3) decrypts a sentinel persisted
		// beside the Data Protection key ring at first boot, so any key value other than
		// the one credentials were encrypted under refuses to start with a plain-words
		// cause, before any request is served.
		Modules.SocialAccounts.Infrastructure.SocialAccountsMasterKeyWitness
			.EnsureMasterKeyUsable(
				AppEnvironment.Instance.SocialAccountsMasterKey,
				Program.IsOpenApiGenerationProcess
					? null // doc-gen process: no DB, key checks only
					: new Modules.SocialAccounts.Infrastructure.PostgresKeyRingCanaryStore(
						app.Services.GetRequiredService<IServiceScopeFactory>()
					),
				// #1284: one structured Information line when the canary round-trip PASSES,
				// so operators can tell verified boots from doc-gen runs (which skip it).
				app.Services.GetRequiredService<ILoggerFactory>().CreateLogger(
					nameof(Modules.SocialAccounts.Infrastructure.SocialAccountsMasterKeyWitness)
				)
			);

		if (CanaryBootLogProbe.TryExitAfterBootGate()) {
			return; // probe run: boot gate verified, do not bind a socket or serve requests
		}

		app.LogDiManifestIfPresent();

		ConfigureHttpPipeline(app);

		app.Run();
	}

	/// <summary>
	/// Composes the worker role's Generic Host (design §3.2, F17): shared infra + app
	/// services + the worker-only job hosted-services, and NO web registrations — no
	/// server exists in this graph at all. Public so AppRoleComposition.Spec asserts
	/// against the exact composition Program runs.
	/// </summary>
	public static HostApplicationBuilder CreateWorkerHostBuilder(string[] args) {
		var builder = Host.CreateApplicationBuilder(args);

		builder.ConfigureLogger();
		builder.ConfigureOpenTelemetry();
		builder.AddInfraServices();
		builder.AddAppServices();
		// Producers run in EVERY role (design §3.2 matrix, last row) — worker jobs may
		// re-enqueue through the same trusted boundary api handlers use.
		builder.AddJobProducerServices();
		builder.AddWorkerServices();

		return builder;
	}

	/// <summary>
	/// Composes the HTTP-serving host for the Api and All roles: the full web surface,
	/// plus the job engine only for All (design §3.2 — Api registers ZERO job
	/// hosted-services). Public so AppRoleComposition.Spec asserts against the exact
	/// composition Program runs.
	/// </summary>
	public static WebApplicationBuilder CreateWebHostBuilder(string[] args, AppRole role) {
		var builder = WebApplication.CreateBuilder(args);

		builder.ConfigureLogger();
		builder.ConfigureOpenTelemetry();
		builder.AddWebServices();
		builder.AddInfraServices();
		builder.AddAppServices();
		// Producers run in EVERY role (design §3.2 matrix, last row); only the
		// consumers (AddWorkerServices) are role-gated.
		builder.AddJobProducerServices();

		if (role is AppRole.All) {
			builder.AddWorkerServices();
		}

		return builder;
	}

	/// <summary>
	/// Builds the HTTP request surface — middleware pipeline + endpoint maps — for the
	/// Api and All roles. The Worker role never reaches this: it runs a Generic Host
	/// with no HTTP server (design §3.2/§3.5, F17). Public so AppRoleComposition.Spec
	/// can assert endpoint counts against the exact pipeline Program uses.
	/// </summary>
	public static void ConfigureHttpPipeline(WebApplication app) {
		// ! order matters !
		app.UseResponseCompression();
		app.UseSecurityHeaders();
		app.UseCustomExceptionHandler();
		// Must precede HTTPS redirection and rate limiting so both
		// scheme and client IP reflect the single trusted Traefik hop.
		// Trust is restricted to AppEnvironment.TRUSTED_PROXY_CIDRS.
		app.UseForwardedHeaders();
		// Use host environment here (not AppEnvironment) because
		// WebApplicationFactory/UseEnvironment can override it per host instance.
		if (!app.Environment.IsEnvironment(EnvironmentNames.Testing)) {
			app.UseHttpsRedirection();
		}
		// Apply the configured CORS response headers without short-circuiting.
		// Early 429/413 responses stay browser-readable, while accepted
		// preflight requests still reach the global floor before UseCors serves
		// them below.
		app.UseCorsResponseHeaders();
		// Enforce the IP safety floor before any database-backed
		// session resolution so forged tokens cannot amplify DB work.
		app.UseGlobalRateLimit();
		// Authenticated policies must never partition on an unvalidated
		// session header. Resolve the persisted session identity first;
		// invalid or missing tokens remain in the client-IP partition.
		app.UseValidatedSessionRateLimitPartitioning();
		// Email extraction buffers and rewinds only endpoints carrying
		// EmailRateLimitMetadata. The limiter then combines that stable
		// key with the already-resolved real client IP.
		app.UseEmailRateLimitPartitioning();
		app.UseRateLimiter();
		// The framework CORS middleware serves accepted preflight requests.
		// Keep it behind the global floor so OPTIONS traffic remains bounded.
		app.UseCors();
		app.UseOpenApi();

		// Anonymous, read-only static file serving for staff-uploaded assets
		// (e.g. tenant logos). PhysicalFileProvider + StaticFileMiddleware
		// canonicalizes request paths and rejects ".." traversal by design.
		// Security headers (incl. X-Content-Type-Options: nosniff) are applied
		// to every response by app.UseSecurityHeaders() above, static files
		// included, since that middleware hooks HttpResponse.OnStarting.
		// The root is owned by the resolved IFileStorage (it already created the
		// directory in its constructor), not recomputed here.
		// Scope the anonymous mount to the `uploads/` sub-tree (issue #1602),
		// NOT the storage root as a whole. ASP.NET Core strips the RequestPath
		// prefix BEFORE resolving against the FileProvider, so a file at
		// `<root>/uploads/X` is still reached via `/files/uploads/X` and the URLs
		// CreateStaffUpload already returns (`/files/{path}`, `{path}` starting at
		// `uploads/`) keep working. A file written elsewhere under the root stays
		// unreachable through `/files/...` — which is exactly what #286's
		// user-data exports must rely on.
		var fileStorage = app.Services.GetRequiredService<IFileStorage>();
		// The storage root exists (LocalDiskFileStorage creates it), but the
		// `uploads/` sub-tree is only materialized on the first save. The static
		// mount needs the directory present, so create it deterministically.
		var uploadsRoot = Path.Combine(fileStorage.RootPath, "uploads");
		Directory.CreateDirectory(uploadsRoot);
		// Wrap PhysicalFileProvider to reject symbolic links / reparse points
		// (issue #1654): a symlink inside uploads/ pointing outside the served
		// tree would otherwise be followed and its target served anonymously.
		var loggerFactory = app.Services.GetRequiredService<ILoggerFactory>();
		app.UseStaticFiles(new StaticFileOptions {
			FileProvider = new ReparsePointExclusionFileProvider(
				new PhysicalFileProvider(uploadsRoot),
				loggerFactory.CreateLogger<ReparsePointExclusionFileProvider>()
			),
			RequestPath = "/files/uploads",
			ServeUnknownFileTypes = false,
			// Safe precisely because paths are server-generated UUID v7 file names
			// (see LocalDiskFileStorage.SaveAsync): a replaced logo gets a new UUID,
			// never a new body at the same URL, so the client can cache forever
			// instead of round-tripping an If-None-Match revalidation per paint.
			OnPrepareResponse = ctx => {
				ctx.Context.Response.Headers.CacheControl = "public, max-age=31536000, immutable";
			},
		});

		app.MapAuthEndpoints();
		app.MapInvitationEndpointsAnonymous();
		app.MapSystemNoticeEndpointsAnonymous();

		// Apply filters to route groups (in order of execution)
		var staffGroup = app.MapGroup(Routes.Staff.Root)
			.RequireRateLimiting(
				ApiRateLimitPolicies.AuthenticatedDefault
			)
			.ProducesAppProblem(
				StatusCodes.Status429TooManyRequests
			)
			.WithCheckSessionHeader()         // 1. Check session header
			.WithSessionAuthentication()      // 2. Authenticate session
			.WithStaffAuthorization();        // 3. Verify staff account

		var tenantGroup = app.MapGroup(Routes.Tenant.Root)
			.RequireRateLimiting(
				ApiRateLimitPolicies.AuthenticatedDefault
			)
			.ProducesAppProblem(
				StatusCodes.Status429TooManyRequests
			)
			.WithCheckSessionHeader()         // 1. Check session header
			.WithCheckTenantHeader()          // 2. Check tenant header
			.WithSessionAuthentication()      // 3. Authenticate session
			.WithTenantAuthorization();       // 4. Verify tenant access (placeholder)

		// Staff endpoints
		staffGroup.MapUserEndpointsForStaff();
		staffGroup.MapUserEndpointsForTenantAsStaff();
		staffGroup.MapUserEndpointsForTenantUsersAsStaff();
		staffGroup.MapInvitationEndpointsForStaff();
		staffGroup.MapInvitationEndpointsForTenantAsStaff();
		staffGroup.MapPermissionEndpointsForStaff();
		staffGroup.MapProfileEndpointsForStaff();
		staffGroup.MapTenantEndpointsForStaff();
		staffGroup.MapSystemNoticeEndpointsForStaff();
		staffGroup.MapAuditLogEndpointsForStaff();
		staffGroup.MapUploadEndpointsForStaff();
		staffGroup.MapJobDeadLetterEndpointsForStaff();

		// First real tenant-scoped surface (root `/`): the signed-in user's
		// own account profile. Posts shipped as the first real permission-gated
		// tenant CRUD surface (B1 #637) and replaces the former Testing-only
		// /test-permission scaffold as the permission-filter probe.
		tenantGroup.MapAccountEndpointsForTenant();
		tenantGroup.MapSettingsEndpointsForTenant();
		tenantGroup.MapPostEndpointsForTenant();
		tenantGroup.MapProjectEndpointsForTenant();
		tenantGroup.MapSocialAccountEndpointsForTenant();
		tenantGroup.MapPublishingEndpointsForTenant();

		var readinessOptions = new HealthCheckOptions {
			Predicate = registration => registration.Tags.Contains("ready"),
		};
		app.MapHealthChecks("/health/live", new HealthCheckOptions {
			Predicate = _ => false,
		}).WithRateLimitOptOut(
			"Liveness probes must remain available during request bursts"
		);
		app.MapHealthChecks("/health/ready", readinessOptions)
			.WithRateLimitOptOut(
				"Readiness probes must remain available during request bursts"
			);
		app.MapHealthChecks("/health", readinessOptions)
			.WithRateLimitOptOut(
				"Health probes must remain available during request bursts"
			);
		app.MapNotFoundRoute();
		app.ValidateEndpointRateLimitCoverage();
	}
}
