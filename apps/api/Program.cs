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
using PublyApp.Api.Modules.AuditLogs.Endpoints;
using PublyApp.Api.Modules.Auth.Endpoints;
using PublyApp.Api.Modules.Invitations.Endpoints;
using PublyApp.Api.Modules.Permissions.Endpoints;
using PublyApp.Api.Modules.Profiles.Endpoints;
using PublyApp.Api.Modules.SystemNotices.Endpoints;
using PublyApp.Api.Modules.Tenants.Endpoints;
using PublyApp.Api.Modules.Uploads.Endpoints;
using PublyApp.Api.Modules.Users.Endpoints;

namespace PublyApp.Api;

public class Program {
	public static void Main(string[] args) {
		AppEnvironment.Initialize(); // ! must be called before anything else

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
			workerHost.Run();
			return;
		}

		var builder = CreateWebHostBuilder(args, role);
		var app = builder.Build();

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
		app.UseCors();
		// Authenticated policies must never partition on an unvalidated
		// session header. Resolve the persisted session identity first;
		// invalid or missing tokens remain in the client-IP partition.
		app.UseValidatedSessionRateLimitPartitioning();
		// Email extraction buffers and rewinds only endpoints carrying
		// EmailRateLimitMetadata. The limiter then combines that stable
		// key with the already-resolved real client IP.
		app.UseEmailRateLimitPartitioning();
		app.UseRateLimiter();
		app.UseOpenApi();

		// Anonymous, read-only static file serving for staff-uploaded assets
		// (e.g. tenant logos). PhysicalFileProvider + StaticFileMiddleware
		// canonicalizes request paths and rejects ".." traversal by design.
		// Security headers (incl. X-Content-Type-Options: nosniff) are applied
		// to every response by app.UseSecurityHeaders() above, static files
		// included, since that middleware hooks HttpResponse.OnStarting.
		// The root is owned by the resolved IFileStorage (it already created the
		// directory in its constructor), not recomputed here.
		var fileStorage = app.Services.GetRequiredService<IFileStorage>();
		app.UseStaticFiles(new StaticFileOptions {
			FileProvider = new PhysicalFileProvider(fileStorage.RootPath),
			RequestPath = "/files",
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

		// TODO: once we have a tenant endpoint, we can remove this
		tenantGroup.MapGet("/test", () => "Hello, World!");

		// Testing-only scaffold: never registered outside the Testing environment,
		// so it never reaches openapi.json / the production Kiota client. Use host
		// environment here (not AppEnvironment) for the same reason as the
		// HTTPS-redirection check above.
		if (app.Environment.IsEnvironment(EnvironmentNames.Testing)) {
			MapTenantTestingScaffoldEndpoints(tenantGroup);
		}

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
	}

	// Test-only scaffold proving TenantPermissionFilter's AccountLevel.Admin bypass
	// end to end (see TenantPermissionFilter.Spec.cs). Remove once a real tenant
	// endpoint adopts WithTenantPermission(...). Only ever mapped under the Testing
	// environment (see call site above) — must not ship into production artifacts.
	private static void MapTenantTestingScaffoldEndpoints(RouteGroupBuilder tenantGroup) {
		tenantGroup.MapGet("/test-permission", () => "Hello, Permission!")
			.RequireRateLimiting(
				ApiRateLimitPolicies.AuthenticatedDefault
			)
			.WithTenantPermission([AppPermissions.Tenant.Modules.ACCESS_DASHBOARD]);
	}
}
