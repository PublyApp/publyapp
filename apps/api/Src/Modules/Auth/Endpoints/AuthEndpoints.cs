using FluentValidation;

using MainApi.Src.Lib.Extensions;
using MainApi.Src.Lib.Filters;
using MainApi.Src.Lib.Routes;
using MainApi.Src.Lib.Utils;
using MainApi.Src.Modules.Auth.Handlers;

namespace MainApi.Src.Modules.Auth.Endpoints;

public static class AuthEndpoints {
	public static IEndpointRouteBuilder MapAuthEndpoints(this IEndpointRouteBuilder app) {
		var group = app.MapGroup(PathUtils.GetLastSegment(Routes.Auth.Root))
			.WithTags("Auth");

		group.MapPost(
			PathUtils.GetLastSegment(Routes.Auth.Login),
			PasswordLogin.HandlePasswordLogin
		)
			.WithName("LoginWithEmailAndPassword")
			.WithSummary("Password Login")
			.WithReqBodyValidation<PasswordLoginBody>()
			.ProducesAppProblem(StatusCodes.Status500InternalServerError);

		group.MapPost(
			PathUtils.GetLastSegment(Routes.Auth.Register),
			PasswordRegister.HandlePasswordRegister
		)
			.WithName("RegisterWithEmailAndPassword")
			.WithSummary("Password Register")
			.WithReqBodyValidation<PasswordRegisterBody>()
			.ProducesAppProblem(StatusCodes.Status500InternalServerError);

		group.MapGet(
			PathUtils.GetLastSegment(Routes.Auth.GetUserAuthData),
			GetUserAuthData.HandleGetUserAuthData
		)
			.WithName("GetUserAuthData")
			.WithSummary("Get User Auth Data")
			.WithCheckSessionHeader()
			.WithSessionAuthentication();

		group.MapGet(
			PathUtils.GetLastSegment(Routes.Auth.GetTenantAuthData),
			GetTenantAuthData.HandleGetTenantAuthData
		)
			.WithName("GetTenantAuthData")
			.WithSummary("Get Tenant Auth Data")
			.WithCheckSessionHeader()
			.WithSessionAuthentication();

		group.MapPost(
			PathUtils.GetLastSegment(Routes.Auth.VerifyEmailRequest),
			VerifyEmailRequest.HandleVerifyEmailRequest
		)
			.WithName("VerifyEmailRequest")
			.WithSummary("Verify Email Request")
			.WithReqBodyValidation<VerifyEmailRequestBody>()
			.ProducesAppProblem(StatusCodes.Status500InternalServerError);

		group.MapGet(
			PathUtils.GetLastSegment(Routes.Auth.GetVerificationLink),
			GetVerificationLink.HandleGetVerificationLink
		)
			.WithName("GetVerificationLink")
			.WithSummary("Get Verification Link")
			.WithReqQueryValidation<GetVerificationLinkQuery>()
			.ProducesAppProblem(StatusCodes.Status500InternalServerError);

		group.MapGet(
			PathUtils.GetLastSegment(Routes.Auth.GetRedirectCode),
			GetRedirectCode.HandleGetRedirectCode
		)
			.WithName("GetRedirectCode")
			.WithSummary("Get Redirect Code")
			.WithReqQueryValidation<GetRedirectCodeQuery>()
			.WithCheckSessionHeader()
			.WithSessionAuthentication();

		group.MapGet(
			PathUtils.GetLastSegment(Routes.Auth.GetUserTenants),
			GetUserTenants.HandleGetUserTenants
		)
			.WithName("GetUserTenants")
			.WithSummary("Get User Tenants")
			.WithCheckSessionHeader()
			.WithSessionAuthentication();

		group.MapGet(
			PathUtils.GetLastSegment(Routes.Auth.CheckEmailVerificationToken),
			CheckEmailVerificationToken.HandleCheckEmailVerificationToken
		)
			.WithName("CheckEmailVerificationToken")
			.WithSummary("Check Email Verification Token")
			.WithReqQueryValidation<CheckEmailVerificationTokenQuery>()
			.ProducesAppProblem(StatusCodes.Status500InternalServerError);

		group.MapGet(
			PathUtils.GetLastSegment(Routes.Auth.CheckResetPasswordToken),
			CheckResetPasswordToken.HandleCheckResetPasswordToken
		)
			.WithName("CheckResetPasswordToken")
			.WithSummary("Check Reset Password Token")
			.WithReqQueryValidation<CheckResetPasswordTokenQuery>()
			.ProducesAppProblem(StatusCodes.Status500InternalServerError);

		group.MapPost(
			PathUtils.GetLastSegment(Routes.Auth.ResetPassword),
			ResetPassword.HandleResetPassword
		)
			.WithName("ResetPassword")
			.WithSummary("Reset Password")
			.WithReqBodyValidation<ResetPasswordBody>()
			.ProducesAppProblem(StatusCodes.Status500InternalServerError);

		return group;
	}
}
