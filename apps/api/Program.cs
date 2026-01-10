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

namespace MainApi;

public class Program {
	public static void Main(string[] args) {
		AppEnvironment.LoadEnv(); // ! must be called before anything else

		var builder = WebApplication.CreateBuilder(args);

		builder.ConfigureLogger();
		builder.AddAppServices();
		builder.AddCors();

		var app = builder.Build();

		// ! order matters !
		app.UseResponseCompression(); // Compress responses (should be early in the pipeline)
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

		var staffGroup = app.MapGroup(RoutePath.Staff.Root)
			.WithCheckSessionHeader()         // 1. Check session header
			.WithSessionAuthentication()      // 2. Authenticate session
			.WithStaffAuthorization();        // 3. Verify staff account

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
	}
}
