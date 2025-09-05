using MainApi.Src.Lib;
using MainApi.Src.Lib.Extensions;
using MainApi.Src.Features.Common.Auth;
using MainApi.Src.Features.Tenant.Product;
using MainApi.Src.Features.Staff.Tenant;
using MainApi.Src.Lib.Middlewares;
using MainApi.Localization;

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

var staffGroup = app.MapGroup("/staff");
var tenantGroup = app.MapGroup("/tenant");

// Staff endpoints
staffGroup.MapTenantStaffEndpoints();

// Tenant endpoints
tenantGroup.MapProductEndpoints();

app.MapFallback(() =>
{
	return Results.NotFound(ApiResponse.Create("Route not found", ResponseKeys.NotFound));
});

app.UseHttpsRedirection();

app.Run();
