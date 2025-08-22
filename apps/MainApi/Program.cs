using Scalar.AspNetCore;
using MainApi.Src.Lib;
using MainApi.Src.Lib.Extensions;
using MainApi.Src.Features.Common.Auth;
using MainApi.Src.Features.Tenant.Product;
using MainApi.Src.Features.Common.Auth.Middlewares;

var builder = WebApplication.CreateBuilder(args);

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

app.MapFallback(() => Results.NotFound(new {
	message = "Route not found",
	key = "route-not-found",
}));

app.UseHttpsRedirection();

// TEsting validation
// ! use dotnet add package FluentValidation.AspNetCore
// ! article example: https://dev.to/stevsharp/validating-minimal-apis-best-practices-and-approaches-1gal
// app.MapPost("/testing-validation", async Task<IResult> (
// 	HttpContext context,
// 	[FromBody] Product product
// 	) => {
// 	return Results.Ok(new {
// 		message = "Test is valid",
// 		key = "test-is-valid"
// 	});
// });

app.Run();
