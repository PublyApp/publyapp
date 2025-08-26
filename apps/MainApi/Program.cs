using Scalar.AspNetCore;
using MainApi.Src.Lib;
using MainApi.Src.Lib.Extensions;
using MainApi.Src.Features.Common.Auth;
using MainApi.Src.Features.Tenant.Product;
using MainApi.Src.Features.Staff.Tenant;
using MainApi.Src.Lib.Middlewares;

AppEnvironment.LoadEnv();

var builder = WebApplication.CreateBuilder(args);

builder.ConfigureSerilog();
builder.AddServices();

var app = builder.Build();

app.UseCustomExceptionHandler();

if (app.Environment.IsDevelopment())
{
	app.MapOpenApi();
	app.MapScalarApiReference();
}

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

app.MapFallback(() => Results.NotFound(new
{
	message = "Route not found",
	key = "route-not-found",
}));

app.UseHttpsRedirection();

app.Run();
