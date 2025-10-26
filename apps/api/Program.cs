using MainApi.Src.Lib;
using MainApi.Src.Lib.Extensions;
using MainApi.Src.Features.Common.Auth;
using MainApi.Src.Features.Tenant.Product;
using MainApi.Src.Features.Staff.TenantAsStaff;
using MainApi.Src.Lib.Middlewares;
using MainApi.Src.Features.Staff.StaffMember;
using MainApi.Src.Features.Staff.ProfileAsStaff;

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
app.UseCheckTenantHeader();
app.UseCheckSessionHeader();
app.UseSessionAuthentication();
app.UseStaffAuthorization();
// TODO: UseTenantAuthentication();

app.MapAuthEndpoints();

var staffGroup = app.MapGroup(RoutePath.Staff.Root);
var tenantGroup = app.MapGroup(RoutePath.Tenant.Root);

// Staff endpoints
staffGroup.MapTenantAsStaffEndpoints();
staffGroup.MapStaffMemberEndPoints();
staffGroup.MapProfileAsStaffEndPoints();

// Tenant endpoints
tenantGroup.MapProductEndpoints();

app.MapHealthChecks("/health");
app.MapNotFoundRoute();

app.Run();
