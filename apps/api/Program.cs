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

AppEnvironment.LoadEnv(); // ! must be called before anything else

var builder = WebApplication.CreateBuilder(args);

builder.ConfigureLogger();
builder.AddAppServices();
builder.AddCors();

var app = builder.Build();

// ! order matters !
app.UseSecurityHeaders();
app.UseCustomExceptionHandler();
app.UseHttpsRedirection();
app.UseCors();
app.UseOpenApi();

app.MapAuthEndpoints();
app.MapInvitationAnonymousEndpoints();

		app.MapAuthEndpoints();
		app.MapInvitationEndpointsAnonymous();
		app.MapSystemNoticeEndpointsAnonymous();

// Staff endpoints
staffGroup.MapPermissionAsStaffEndpoints();
staffGroup.MapProfileAsStaffEndpoints();
staffGroup.MapTenantAsStaffEndpoints();
staffGroup.MapStaffMemberEndpoints();
staffGroup.MapInvitationAsStaffEndpoints();

// Tenant endpoints
tenantGroup.MapProductEndpoints();

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
