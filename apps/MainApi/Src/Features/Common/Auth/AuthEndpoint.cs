namespace MainApi.Src.Features.Common.Auth;

using FluentValidation;
using MainApi.Src.Lib.Filters;
using MainApi.Src.Features.Common.Auth.Handlers.PasswordLogin;
using MainApi.Src.Features.Common.Auth.Handlers.PasswordRegister;

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
			.WithBodyValidation<PasswordLoginBody>()
			.Produces<PasswordLoginSuccessApiResponse>()
			.Produces<PasswordLoginFailResponseResult>(StatusCodes.Status400BadRequest);

		group.MapPost("/register", PasswordRegister.HandlePasswordRegister)
			.WithName("RegisterWithEmailAndPassword")
			.WithSummary("Password Register")
			.WithBodyValidation<PasswordRegisterBody>()
			.Produces<PasswordRegisterSuccessApiResponse>()
			.Produces<PasswordRegisterFailResponseResult>(StatusCodes.Status400BadRequest);

		// group.MapPost("/login-with-google", AuthHandlers.LoginWithGoogle);

		// group.MapPost("/register-with-google", AuthHandlers.RegisterWithGoogle);

		return group;
	}
}
