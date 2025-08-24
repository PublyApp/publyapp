using Scalar.AspNetCore;
using MainApi.Src.Lib;
using MainApi.Src.Lib.Extensions;
using MainApi.Src.Features.Common.Auth;
using MainApi.Src.Features.Tenant.Product;
using MainApi.Src.Features.Common.Auth.Middlewares;

var builder = WebApplication.CreateBuilder(args);

// Configure Serilog
builder.ConfigureSerilog();

builder.AddServices();

var app = builder.Build();

app.UseCustomExceptionHandler();

// dev only middlewares
if (app.Environment.IsDevelopment())
{
	app.MapOpenApi();
	app.MapScalarApiReference();
}

// all-time middlewares
app.UseCheckSessionHeader();
app.UseCheckTenantHeader();
app.UseSessionAuthentication();
// TODO: UseTenantAuthentication();

// mount endpoints
app.MapAuthEndpoints();

var staffGroup = app.MapGroup("/staff");
var tenantGroup = app.MapGroup("/tenant");

// Map organized endpoints
tenantGroup.MapProductEndpoints();

app.MapFallback(() => Results.NotFound(new
{
	message = "Route not found",
	key = "route-not-found",
}));

app.UseHttpsRedirection();

app.Run();
