using Microsoft.Extensions.FileProviders;

using PublyApp.Api.Infrastructure.Storage;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Extensions;
using PublyApp.Api.Lib.Filters;
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

		var builder = WebApplication.CreateBuilder(args);

		builder.ConfigureLogger();
		builder.AddWebServices();
		builder.AddInfraServices();
		builder.AddAppServices();

		var app = builder.Build();

		app.LogDiManifestIfPresent();

		// ! order matters !
		app.UseResponseCompression();
		app.UseSecurityHeaders();
		app.UseCustomExceptionHandler();
		// Use host environment here (not AppEnvironment) because
		// WebApplicationFactory/UseEnvironment can override it per host instance.
		if (!app.Environment.IsEnvironment(EnvironmentNames.Testing)) {
			app.UseHttpsRedirection();
		}
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
			.WithCheckSessionHeader()         // 1. Check session header
			.WithSessionAuthentication()      // 2. Authenticate session
			.WithStaffAuthorization();        // 3. Verify staff account

		var tenantGroup = app.MapGroup(Routes.Tenant.Root)
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

		app.MapHealthChecks("/health");
		app.MapNotFoundRoute();

		app.Run();
	}

	// Test-only scaffold proving TenantPermissionFilter's AccountLevel.Admin bypass
	// end to end (see TenantPermissionFilter.Spec.cs). Remove once a real tenant
	// endpoint adopts WithTenantPermission(...). Only ever mapped under the Testing
	// environment (see call site above) — must not ship into production artifacts.
	private static void MapTenantTestingScaffoldEndpoints(RouteGroupBuilder tenantGroup) {
		tenantGroup.MapGet("/test-permission", () => "Hello, Permission!")
			.WithTenantPermission([AppPermissions.Tenant.Modules.ACCESS_DASHBOARD]);
	}
}
