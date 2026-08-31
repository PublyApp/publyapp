using FluentValidation;

using PublyApp.Api.Lib.Extensions;
using PublyApp.Api.Lib.Filters;
using PublyApp.Api.Lib.RateLimiting;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Auth.Handlers;

namespace PublyApp.Api.Modules.Auth.Endpoints;

public static class AuthEndpoints {
	public static IEndpointRouteBuilder MapAuthEndpoints(this IEndpointRouteBuilder app) {
		var group = app.MapGroup(PathUtils.GetLastSegment(Routes.Auth.Root))
			.RequireRateLimiting(
				ApiRateLimitPolicies.AnonymousOther
			)
			.ProducesAppProblem(
				StatusCodes.Status429TooManyRequests
			)
			.WithTags("Auth");

		group.MapPost(
			PathUtils.GetLastSegment(Routes.Auth.Login),
			PasswordLogin.Handle
		)
			.WithName("LoginWithEmailAndPassword")
			.WithSummary("Password Login")
			.WithReqBodyValidation<PasswordLoginBody>()
			.RequireAnonymousAuthEmailRateLimit()
			.ProducesAppProblem(StatusCodes.Status500InternalServerError);

		group.MapPost(
			PathUtils.GetLastSegment(Routes.Auth.Register),
			PasswordRegister.Handle
		)
			.WithName("RegisterWithEmailAndPassword")
			.WithSummary("Password Register")
			.WithReqBodyValidation<PasswordRegisterBody>()
			.RequireAnonymousAuthEmailRateLimit()
			.ProducesAppProblem(StatusCodes.Status500InternalServerError);

		group.MapGet(
			PathUtils.GetLastSegment(Routes.Auth.GetUserAuthData),
			GetUserAuthData.Handle
		)
			.WithName("GetUserAuthData")
			.WithSummary("Get User Auth Data")
			.RequireRateLimiting(
				ApiRateLimitPolicies.AuthenticatedDefault
			)
			.WithCheckSessionHeader()
			.WithSessionAuthentication();

		group.MapGet(
			PathUtils.GetLastSegment(Routes.Auth.GetScopeAuthData),
			GetScopeAuthData.Handle
		)
			.WithName("GetScopeAuthData")
			.WithSummary("Get Scope Auth Data")
			.RequireRateLimiting(
				ApiRateLimitPolicies.AuthenticatedDefault
			)
			.WithCheckSessionHeader()
			.WithSessionAuthentication();

		group.MapPost(
			PathUtils.GetLastSegment(Routes.Auth.VerifyEmailRequest),
			VerifyEmailRequest.Handle
		)
			.WithName("VerifyEmailRequest")
			.WithSummary("Verify Email Request")
			.WithReqBodyValidation<VerifyEmailRequestBody>()
			.RequireAnonymousAuthEmailRateLimit(
				isPasswordReset: true
			)
			.ProducesAppProblem(StatusCodes.Status500InternalServerError);

		group.MapGet(
			PathUtils.GetLastSegment(Routes.Auth.GetVerificationLink),
			GetVerificationLink.Handle
		)
			.WithName("GetVerificationLink")
			.WithSummary("Get Verification Link")
			.WithReqQueryValidation<GetVerificationLinkQuery>()
			.RequireAnonymousAuthIpRateLimit()
			.ProducesAppProblem(StatusCodes.Status500InternalServerError);

		group.MapGet(
			PathUtils.GetLastSegment(Routes.Auth.GetRedirectCode),
			GetRedirectCode.Handle
		)
			.WithName("GetRedirectCode")
			.WithSummary("Get Redirect Code")
			.WithReqQueryValidation<GetRedirectCodeQuery>()
			.RequireRateLimiting(
				ApiRateLimitPolicies.AuthenticatedDefault
			)
			.WithCheckSessionHeader()
			.WithSessionAuthentication();

		group.MapGet(
			PathUtils.GetLastSegment(Routes.Auth.GetUserTenants),
			GetUserTenants.Handle
		)
			.WithName("GetUserTenants")
			.WithSummary("Get User Tenants")
			.RequireRateLimiting(
				ApiRateLimitPolicies.AuthenticatedDefault
			)
			.WithCheckSessionHeader()
			.WithSessionAuthentication();

		group.MapGet(
			PathUtils.GetLastSegment(Routes.Auth.CheckEmailVerificationToken),
			CheckEmailVerificationToken.Handle
		)
			.WithName("CheckEmailVerificationToken")
			.WithSummary("Check Email Verification Token")
			.WithReqQueryValidation<CheckEmailVerificationTokenQuery>()
			.RequireAnonymousAuthIpRateLimit()
			.ProducesAppProblem(StatusCodes.Status500InternalServerError);

		group.MapGet(
			PathUtils.GetLastSegment(Routes.Auth.CheckResetPasswordToken),
			CheckResetPasswordToken.Handle
		)
			.WithName("CheckResetPasswordToken")
			.WithSummary("Check Reset Password Token")
			.WithReqQueryValidation<CheckResetPasswordTokenQuery>()
			.RequireAnonymousAuthIpRateLimit()
			.ProducesAppProblem(StatusCodes.Status500InternalServerError);

		group.MapPost(
			PathUtils.GetLastSegment(Routes.Auth.RequestPasswordReset),
			RequestPasswordReset.Handle
		)
			.WithName("RequestPasswordReset")
			.WithSummary("Request Password Reset")
			.WithReqBodyValidation<RequestPasswordResetBody>()
			.RequireAnonymousAuthEmailRateLimit(
				isPasswordReset: true
			)
			.ProducesAppProblem(StatusCodes.Status500InternalServerError);

		group.MapPost(
			PathUtils.GetLastSegment(Routes.Auth.ResetPassword),
			ResetPassword.Handle
		)
			.WithName("ResetPassword")
			.WithSummary("Reset Password")
			.WithReqBodyValidation<ResetPasswordBody>()
			.RequireAnonymousAuthIpRateLimit()
			.ProducesAppProblem(StatusCodes.Status500InternalServerError);

		group.MapGet(
			PathUtils.GetLastSegment(Routes.Auth.GetUserTenantsForPicker),
			GetUserTenantsForPicker.Handle
		)
			.WithName("GetUserTenantsForPicker")
			.WithSummary("Get all user tenants for picker including suspended")
			.RequireRateLimiting(
				ApiRateLimitPolicies.AuthenticatedDefault
			)
			.WithCheckSessionHeader()
			.WithSessionAuthentication();

		group.MapPost(
			PathUtils.GetLastSegment(Routes.Auth.RevokeSession),
			RevokeSession.Handle
		)
			.WithName("RevokeSession")
			.WithSummary("Revoke the current session")
			.RequireRateLimiting(
				ApiRateLimitPolicies.AuthenticatedDefault
			)
			.WithCheckSessionHeader()
			.WithSessionAuthentication();

		return group;
	}
}
