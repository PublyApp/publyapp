namespace MainApi.Src.Features.Common.Auth;

using FluentValidation;
// using MainApi.Src.Features.Common.Auth.Filters;

public static class AuthEndpoint
{
	public static RouteGroupBuilder MapAuthEndpoints(this WebApplication app)
	{
		var group = app.MapGroup("/auth")
			.WithTags("Auth")
			.WithOpenApi();

		group.MapPost("/login", AuthHandlers.LoginWithEmailAndPassword)
				.WithName("LoginWithEmailAndPassword")
				.WithSummary("Login with email and password");
		// .WithValidation<LoginWithEmailAndPasswordDto>();

		group.MapPost("/register", AuthHandlers.RegisterWithEmailAndPassword)
				.WithName("RegisterWithEmailAndPassword")
				.WithSummary("Register with email and password");
		// .WithValidation<RegisterWithEmailAndPasswordDto>();

		// group.MapPost("/login-with-google", AuthHandlers.LoginWithGoogle);

		// group.MapPost("/register-with-google", AuthHandlers.RegisterWithGoogle);

		return group;
	}
}
