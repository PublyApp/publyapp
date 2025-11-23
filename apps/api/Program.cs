using MainApi.Src.Lib;
using MainApi.Src.Lib.Extensions;
using MainApi.Src.Features.Common.Auth;
using MainApi.Src.Features.Tenant.Product;
using MainApi.Src.Features.Staff.TenantAsStaff;
using MainApi.Src.Features.Staff.StaffMember;
using MainApi.Src.Features.Staff.ProfileAsStaff;
using MainApi.Src.Lib.Filters;
using MainApi.Src.Features.Staff.Invitations;
using MainApi.Src.Features.Staff.PermissionAsStaff;

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

// Apply filters to route groups (in order of execution)
var tenantGroup = app.MapGroup(RoutePath.Tenant.Root)
	.WithCheckSessionHeader()         // 1. Check session header
	.WithCheckTenantHeader()          // 2. Check tenant header
	.WithSessionAuthentication()      // 3. Authenticate session
																		// TODO[tenant-auth]: TenantAuthFilter is a placeholder;
																		// * implement tenant verification logic later.
	.WithTenantAuthorization();       // 4. Verify tenant access (placeholder)

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

app.MapHealthChecks("/health");
app.MapNotFoundRoute();

app.Run();
