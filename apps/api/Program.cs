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

		// TODO: once we have a tenant endpoint, we can remove this
		tenantGroup.MapGet("/test", () => "Hello, World!");

		app.MapHealthChecks("/health");
		app.MapNotFoundRoute();

		app.Run();
	}
}
