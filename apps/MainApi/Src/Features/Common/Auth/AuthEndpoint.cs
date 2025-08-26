namespace MainApi.Src.Features.Common.Auth;

using FluentValidation;
using MainApi.Src.Lib.Filters;

using MainApi.Src.Features.Common.Auth.Handlers.PasswordLogin;

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
			.AddEndpointFilter<ValidationFilter<PasswordLoginBody>>();
		// .WithValidation<LoginWithEmailAndPasswordDto>();

		group.MapPost("/register", AuthHandlers.RegisterWithEmailAndPassword)
			.WithName("RegisterWithEmailAndPassword")
			.WithSummary("Password Register");
		// .WithValidation<RegisterWithEmailAndPasswordDto>();

		// group.MapPost("/login-with-google", AuthHandlers.LoginWithGoogle);

		// group.MapPost("/register-with-google", AuthHandlers.RegisterWithGoogle);

		return group;
	}
}
