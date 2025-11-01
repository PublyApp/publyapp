using MainApi.Src.Lib;
using MainApi.Src.Lib.Extensions;
using MainApi.Src.Features.Common.Auth;
using MainApi.Src.Features.Tenant.Product;
using MainApi.Src.Features.Staff.TenantAsStaff;
using MainApi.Src.Lib.Middlewares;
using MainApi.Src.Features.Staff.StaffMember;
using MainApi.Src.Features.Staff.ProfileAsStaff;
using MainApi.Src.Lib.Filters;

AppEnvironment.LoadEnv(); // ! must be called before anything else

var builder = WebApplication.CreateBuilder(args);

builder.ConfigureLogger();
builder.AddServices();
builder.AddCors();

var app = builder.Build();

// ! order matters !
app.UseSecurityHeaders();
app.UseCustomExceptionHandler();
app.UseHttpsRedirection();
app.UseCors();
app.UseOpenApi();

// ! order matters !
// NOTE: Middlewares are kept for now until filters are tested and confirmed working
app.UseCheckTenantHeader();
app.UseCheckSessionHeader();
app.UseSessionAuthentication();
app.UseStaffAuthorization();
// TODO: UseTenantAuthentication();

app.MapAuthEndpoints();

// Apply filters to route groups (in order of execution)
var tenantGroup = app.MapGroup(RoutePath.Tenant.Root)
	.WithCheckTenantHeader()          // 1. Check tenant header
	.WithCheckSessionHeader()         // 2. Check session header
	.WithSessionAuthentication()      // 3. Authenticate session
	.WithTenantAuthorization();       // 4. Verify tenant access

var staffGroup = app.MapGroup(RoutePath.Staff.Root)
	.WithCheckSessionHeader()         // 1. Check session header
	.WithSessionAuthentication()      // 2. Authenticate session
	.WithStaffAuthorization();         // 3. Verify staff account

// Staff endpoints
staffGroup.MapTenantAsStaffEndpoints();
staffGroup.MapStaffMemberEndPoints();
staffGroup.MapProfileAsStaffEndPoints();

// Tenant endpoints
tenantGroup.MapProductEndpoints();

app.MapHealthChecks("/health");
app.MapNotFoundRoute();

app.Run();
