using FluentValidation;

using PublyApp.Api.Lib.Extensions;
using PublyApp.Api.Lib.Filters;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Auth.Handlers;

namespace PublyApp.Api.Modules.Auth.Endpoints;

public static class AuthEndpoints {
	public static IEndpointRouteBuilder MapAuthEndpoints(this IEndpointRouteBuilder app) {
		var group = app.MapGroup(PathUtils.GetLastSegment(Routes.Auth.Root))
			.WithTags("Auth");

		group.MapPost(
			PathUtils.GetLastSegment(Routes.Auth.Login),
			PasswordLogin.Handle
		)
			.WithName("LoginWithEmailAndPassword")
			.WithSummary("Password Login")
			.WithReqBodyValidation<PasswordLoginBody>()
			.ProducesAppProblem(StatusCodes.Status500InternalServerError);

		group.MapPost(
			PathUtils.GetLastSegment(Routes.Auth.Register),
			PasswordRegister.Handle
		)
			.WithName("RegisterWithEmailAndPassword")
			.WithSummary("Password Register")
			.WithReqBodyValidation<PasswordRegisterBody>()
			.ProducesAppProblem(StatusCodes.Status500InternalServerError);

		group.MapGet(
			PathUtils.GetLastSegment(Routes.Auth.GetUserAuthData),
			GetUserAuthData.Handle
		)
			.WithName("GetUserAuthData")
			.WithSummary("Get User Auth Data")
			.WithCheckSessionHeader()
			.WithSessionAuthentication();

		group.MapGet(
			PathUtils.GetLastSegment(Routes.Auth.GetScopeAuthData),
			GetScopeAuthData.Handle
		)
			.WithName("GetScopeAuthData")
			.WithSummary("Get Scope Auth Data")
			.WithCheckSessionHeader()
			.WithSessionAuthentication();

		group.MapPost(
			PathUtils.GetLastSegment(Routes.Auth.VerifyEmailRequest),
			VerifyEmailRequest.Handle
		)
			.WithName("VerifyEmailRequest")
			.WithSummary("Verify Email Request")
			.WithReqBodyValidation<VerifyEmailRequestBody>()
			.ProducesAppProblem(StatusCodes.Status500InternalServerError);

		group.MapGet(
			PathUtils.GetLastSegment(Routes.Auth.GetVerificationLink),
			GetVerificationLink.Handle
		)
			.WithName("GetVerificationLink")
			.WithSummary("Get Verification Link")
			.WithReqQueryValidation<GetVerificationLinkQuery>()
			.ProducesAppProblem(StatusCodes.Status500InternalServerError);

		group.MapGet(
			PathUtils.GetLastSegment(Routes.Auth.GetRedirectCode),
			GetRedirectCode.Handle
		)
			.WithName("GetRedirectCode")
			.WithSummary("Get Redirect Code")
			.WithReqQueryValidation<GetRedirectCodeQuery>()
			.WithCheckSessionHeader()
			.WithSessionAuthentication();

		group.MapGet(
			PathUtils.GetLastSegment(Routes.Auth.GetUserTenants),
			GetUserTenants.Handle
		)
			.WithName("GetUserTenants")
			.WithSummary("Get User Tenants")
			.WithCheckSessionHeader()
			.WithSessionAuthentication();

		group.MapGet(
			PathUtils.GetLastSegment(Routes.Auth.CheckEmailVerificationToken),
			CheckEmailVerificationToken.Handle
		)
			.WithName("CheckEmailVerificationToken")
			.WithSummary("Check Email Verification Token")
			.WithReqQueryValidation<CheckEmailVerificationTokenQuery>()
			.ProducesAppProblem(StatusCodes.Status500InternalServerError);

		group.MapGet(
			PathUtils.GetLastSegment(Routes.Auth.CheckResetPasswordToken),
			CheckResetPasswordToken.Handle
		)
			.WithName("CheckResetPasswordToken")
			.WithSummary("Check Reset Password Token")
			.WithReqQueryValidation<CheckResetPasswordTokenQuery>()
			.ProducesAppProblem(StatusCodes.Status500InternalServerError);

		group.MapPost(
			PathUtils.GetLastSegment(Routes.Auth.ResetPassword),
			ResetPassword.Handle
		)
			.WithName("ResetPassword")
			.WithSummary("Reset Password")
			.WithReqBodyValidation<ResetPasswordBody>()
			.ProducesAppProblem(StatusCodes.Status500InternalServerError);

		group.MapGet(
			PathUtils.GetLastSegment(Routes.Auth.GetUserTenantsForPicker),
			GetUserTenantsForPicker.Handle
		)
			.WithName("GetUserTenantsForPicker")
			.WithSummary("Get all user tenants for picker including suspended")
			.WithCheckSessionHeader()
			.WithSessionAuthentication();

		return group;
	}
}
