using MainApi.Src.Lib;
using MainApi.Src.Lib.Extensions;
using MainApi.Src.Lib.Filters;
using MainApi.Src.Lib.Routes;
using MainApi.Src.Lib.Seeding;
using MainApi.Src.Modules.AuditLogs.Endpoints;
using MainApi.Src.Modules.Auth.Endpoints;
using MainApi.Src.Modules.Invitations.Endpoints;
using MainApi.Src.Modules.Permissions.Endpoints;
using MainApi.Src.Modules.Profiles.Endpoints;
using MainApi.Src.Modules.SystemNotices.Endpoints;
using MainApi.Src.Modules.Tenants.Endpoints;
using MainApi.Src.Modules.Users.Endpoints;

AppEnvironment.Initialize(); // ! must be called before anything else

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
app.UseHttpsRedirection();
app.UseCors();
app.UseOpenApi();

app.MapAuthEndpoints();
app.MapInvitationEndpointsAnonymous();

// Apply filters to route groups (in order of execution)
var staffGroup = app.MapGroup(Routes.Staff.Root)
	.WithCheckSessionHeader()         // 1. Check session header
	.WithSessionAuthentication()      // 2. Authenticate session
	.WithStaffAuthorization();        // 3. Verify staff account

		app.MapAuthEndpoints();
		app.MapInvitationEndpointsAnonymous();
		app.MapSystemNoticeEndpointsAnonymous();

		var staffGroup = app.MapGroup(RoutePath.Staff.Root)
			.WithCheckSessionHeader()         // 1. Check session header
			.WithSessionAuthentication()      // 2. Authenticate session
			.WithStaffAuthorization();        // 3. Verify staff account

// Staff endpoints
staffGroup.MapUserEndpointsForStaff();
staffGroup.MapInvitationEndpointsForStaff();
staffGroup.MapPermissionEndpointsForStaff();
staffGroup.MapProfileEndpointsForStaff();
staffGroup.MapTenantEndpointsForStaff();

// TODO: once we have a tenant endpoint, we can remove this
tenantGroup.MapGet("/test", () => "Hello, World!");

app.MapHealthChecks("/health");
app.MapNotFoundRoute();

		// Staff endpoints
		staffGroup.MapUserEndpointsForStaff();
		staffGroup.MapUserEndpointsForTenantAsStaff();
		staffGroup.MapInvitationEndpointsForStaff();
		staffGroup.MapInvitationEndpointsForTenantAsStaff();
		staffGroup.MapPermissionEndpointsForStaff();
		staffGroup.MapProfileEndpointsForStaff();
		staffGroup.MapTenantEndpointsForStaff();
		staffGroup.MapSystemNoticeEndpointsForStaff();
		staffGroup.MapAuditLogEndpointsForStaff();

		app.Run();
	}
}
