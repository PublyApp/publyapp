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


var builder = WebApplication.CreateBuilder(args);

AppEnvironment.LoadEnv();

builder.ConfigureLogger();
builder.AddServices();
builder.AddCors();

var app = builder.Build();

app.UseCors();
app.UseOpenApi();
app.UseHttpsRedirection();
app.UseCustomExceptionHandler();

app.UseCheckTenantHeader();
app.UseCheckSessionHeader();
app.UseStaffAuthorization();
app.UseSessionAuthentication();
// TODO: UseTenantAuthentication();

app.MapAuthEndpoints();

		app.MapAuthEndpoints();
		app.MapInvitationEndpointsAnonymous();
		app.MapSystemNoticeEndpointsAnonymous();

// Staff endpoints
staffGroup.MapStaffTenantEndpoints();

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
