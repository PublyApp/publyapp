using Scalar.AspNetCore;
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

if (app.Environment.IsDevelopment())
{
	// /openapi/{documentName}.json
	app.MapOpenApi();
	app.MapScalarApiReference(options =>
	{
		options.EnabledTargets = [
			ScalarTarget.Shell,
			ScalarTarget.Node,
			ScalarTarget.JavaScript,
			ScalarTarget.CSharp,
		];
		options.EnabledClients = [
			ScalarClient.Curl,
			ScalarClient.Wget,
			ScalarClient.Axios,
			ScalarClient.HttpClient,
			ScalarClient.Request,
			ScalarClient.RestSharp,
		];
	});
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

// Example endpoint showing type-safe translation keys
app.MapGet("/example/unauthorized", () =>
{
	return Results.Json(ApiResponse.Create("Access denied", ResponseKeys.Unauthorized));
});

app.MapGet("/example/not-found", () =>
{
	return Results.Json(ApiResponse.Create("Resource not found", ResponseKeys.NotFound));
});

app.MapFallback(() => Results.NotFound(ApiResponse.Create("Route not found", ResponseKeys.NotFound)));

app.UseHttpsRedirection();

app.Run();
