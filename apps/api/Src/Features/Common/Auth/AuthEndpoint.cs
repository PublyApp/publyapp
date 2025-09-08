namespace MainApi.Src.Features.Common.Auth;

using FluentValidation;
using MainApi.Src.Lib.Filters;
using MainApi.Src.Features.Common.Auth.Handlers.PasswordLogin;
using MainApi.Src.Features.Common.Auth.Handlers.PasswordRegister;
using MainApi.Src.Features.Common.Auth.Handlers.GetUserAuthData;
using MainApi.Src.Features.Common.Auth.Handlers.VerifyEmailRequest;
using MainApi.Src.Features.Common.Auth.Handlers.GetVerificationLink;

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

		group.MapPost("/verify-email-request", VerifyEmailRequest.HandleVerifyEmailRequest)
			.WithName("VerifyEmailRequest")
			.WithSummary("Verify Email Request")
			.WithBodyValidation<VerifyEmailRequestBody>();

		group.MapGet("/verification-link", GetVerificationLink.HandleGetVerificationLink)
			.WithName("GetVerificationLink")
			.WithSummary("Get Verification Link")
			.WithQueryValidation<GetVerificationLinkQuery>();

		return group;
	}
}
