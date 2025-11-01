using MainApi.Src.Lib;
using MainApi.Src.Lib.Extensions;
using MainApi.Src.Features.Common.Auth;
using MainApi.Src.Features.Tenant.Product;
using MainApi.Src.Features.Staff.TenantAsStaff;
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
// TODO[filters]: Middlewares are temporarily kept for A/B testing with filters.
// Remove the middleware registrations below once filter behavior is verified.
// Tracking: see FILTER_IMPLEMENTATION_SUMMARY.md "Next Steps".
// app.UseCheckTenantHeader();
// app.UseCheckSessionHeader();
// app.UseSessionAuthentication();
// app.UseStaffAuthorization();
// TODO: UseTenantAuthentication();

app.MapAuthEndpoints();

// Apply filters to route groups (in order of execution)
var tenantGroup = app.MapGroup(RoutePath.Tenant.Root)
	.WithCheckSessionHeader()         // 1. Check session header
	.WithCheckTenantHeader()          // 2. Check tenant header
	.WithSessionAuthentication()      // 3. Authenticate session
																		// TODO[tenant-auth]: TenantAuthFilter is a placeholder; implement verification or remove for now.
	.WithTenantAuthorization();       // 4. Verify tenant access (placeholder)

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
