namespace MainApi.Src.Features.Common.Auth;

using FluentValidation;
using MainApi.Src.Lib.Filters;
using MainApi.Src.Features.Common.Auth.Handlers.PasswordLogin;
using MainApi.Src.Features.Common.Auth.Handlers.PasswordRegister;
using MainApi.Src.Features.Common.Auth.Handlers.GetUserAuthData;
using Microsoft.OpenApi.Models;

public static class AuthEndpoint
{
	public static IEndpointRouteBuilder MapAuthEndpoints(this IEndpointRouteBuilder app)
	{
		var group = app.MapGroup("/auth")
			.WithTags("Auth")
			.WithOpenApi();

		group.MapPost("/login", PasswordLogin.HandlePasswordLogin)
			.WithName("LoginWithEmailAndPassword")
			.WithSummary("Password Login")
			.WithBodyValidation<PasswordLoginBody>();

		group.MapPost("/register", PasswordRegister.HandlePasswordRegister)
			.WithName("RegisterWithEmailAndPassword")
			.WithSummary("Password Register")
			.WithBodyValidation<PasswordRegisterBody>();

		group.MapGet("/user-auth-data", GetUserAuthData.HandleGetUserAuthData)
			.WithName("GetUserAuthData")
			.WithSummary("Get User Auth Data");

		return group;
	}
}
