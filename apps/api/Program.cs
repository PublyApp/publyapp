using MainApi.Src.Lib;
using MainApi.Src.Lib.Extensions;
using MainApi.Src.Features.Common.Auth;
using MainApi.Src.Features.Tenant.Product;
using MainApi.Src.Features.Staff.Tenant;
using MainApi.Src.Lib.Middlewares;


AppEnvironment.LoadEnv();

var builder = WebApplication.CreateBuilder(args);

builder.ConfigureLogger();
builder.AddServices();

var app = builder.Build();

app.UseCustomExceptionHandler();
app.UseCors();
app.UseOpenApi();

app.UseCheckSessionHeader();
app.UseCheckTenantHeader();
app.UseSessionAuthentication();
app.UseStaffAuthorization();
// TODO: UseTenantAuthentication();

app.MapAuthEndpoints();

var staffGroup = app.MapGroup(RoutePath.Staff.Root);
var tenantGroup = app.MapGroup(RoutePath.Tenant.Root);

// Staff endpoints
staffGroup.MapStaffTenantEndpoints();

// Tenant endpoints
tenantGroup.MapProductEndpoints();

app.MapNotFoundRoute();

app.UseHttpsRedirection();

app.Run();
