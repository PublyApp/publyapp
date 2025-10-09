using FluentValidation;
using MainApi.Src.Lib.Filters;
using MainApi.Src.Features.Common.Auth.Handlers;
using MainApi.Src.Lib;
using MainApi.Src.Lib.Utils;
using MainApi.Src.Lib.Extensions;

namespace MainApi.Src.Features.Common.Auth;

public static class AuthEndpoint {
	public static IEndpointRouteBuilder MapAuthEndpoints(this IEndpointRouteBuilder app) {
		var group = app.MapGroup(PathUtils.GetLastSegment(RoutePath.Auth.Root))
			.WithTags("Auth")
			.WithOpenApi();

		group.MapPost(
			PathUtils.GetLastSegment(RoutePath.Auth.Login),
			PasswordLogin.HandlePasswordLogin
		)
			.WithName("LoginWithEmailAndPassword")
			.WithSummary("Password Login")
			.WithReqBodyValidation<PasswordLoginBody>()
			.Produces500ApiResponse();

		group.MapPost(
			PathUtils.GetLastSegment(RoutePath.Auth.Register),
			PasswordRegister.HandlePasswordRegister
		)
			.WithName("RegisterWithEmailAndPassword")
			.WithSummary("Password Register")
			.WithReqBodyValidation<PasswordRegisterBody>()
			.Produces500ApiResponse();

		group.MapGet(
			PathUtils.GetLastSegment(RoutePath.Auth.GetUserAuthData),
			GetUserAuthData.HandleGetUserAuthData
		)
			.WithName("GetUserAuthData")
			.WithSummary("Get User Auth Data")
			.Produces500ApiResponse();

		group.MapGet(
			PathUtils.GetLastSegment(RoutePath.Auth.GetTenantAuthData),
			GetTenantAuthData.HandleGetTenantAuthData
		)
			.WithName("GetTenantAuthData")
			.WithSummary("Get Tenant Auth Data")
			.Produces500ApiResponse();

		group.MapPost(
			PathUtils.GetLastSegment(RoutePath.Auth.VerifyEmailRequest),
			VerifyEmailRequest.HandleVerifyEmailRequest
		)
			.WithName("VerifyEmailRequest")
			.WithSummary("Verify Email Request")
			.WithReqBodyValidation<VerifyEmailRequestBody>()
			.Produces500ApiResponse();

		group.MapGet(
			PathUtils.GetLastSegment(RoutePath.Auth.GetVerificationLink),
			GetVerificationLink.HandleGetVerificationLink
		)
			.WithName("GetVerificationLink")
			.WithSummary("Get Verification Link")
			.WithReqQueryValidation<GetVerificationLinkQuery>()
			.Produces500ApiResponse();

		group.MapGet(
			PathUtils.GetLastSegment(RoutePath.Auth.GetRedirectCode),
			GetRedirectCode.HandleGetRedirectCode
		)
			.WithName("GetRedirectCode")
			.WithSummary("Get Redirect Code")
			.WithReqQueryValidation<GetRedirectCodeQuery>()
			.Produces500ApiResponse();

		group.MapGet(
			PathUtils.GetLastSegment(RoutePath.Auth.CheckEmailVerificationToken),
			CheckEmailVerificationToken.HandleCheckEmailVerificationToken
		)
			.WithName("CheckEmailVerificationToken")
			.WithSummary("Check Email Verification Token")
			.WithReqQueryValidation<CheckEmailVerificationTokenQuery>()
			.Produces500ApiResponse();

		group.MapGet(
			PathUtils.GetLastSegment(RoutePath.Auth.CheckResetPasswordToken),
			CheckResetPasswordToken.HandleCheckResetPasswordToken
		)
			.WithName("CheckResetPasswordToken")
			.WithSummary("Check Reset Password Token")
			.WithReqQueryValidation<CheckResetPasswordTokenQuery>()
			.Produces500ApiResponse();

		group.MapPost(
			PathUtils.GetLastSegment(RoutePath.Auth.ResetPassword),
			ResetPassword.HandleResetPassword
		)
			.WithName("ResetPassword")
			.WithSummary("Reset Password")
			.WithReqBodyValidation<ResetPasswordBody>()
			.Produces500ApiResponse();

		return group;
	}
}
