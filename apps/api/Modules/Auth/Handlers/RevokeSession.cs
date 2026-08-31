using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Auth.Services;

namespace PublyApp.Api.Modules.Auth.Handlers;

public sealed class RevokeSession {
	public static async Task<Results<
		Ok<ApiResponse>,
		AppUnauthorizedHttpResult,
		AppForbiddenHttpResult
	>> Handle(
		[FromServices] IRequestAuthContext authContext,
		[FromServices] ISessionService sessionService,
		CancellationToken cancellationToken
	) {
		var token = authContext.SessionToken;
		if (token is null) {
			throw new InvalidOperationException(
				"RevokeSession must run behind SessionAuthFilter."
			);
		}

		// Delegates to the service method that performs an atomic delete
		// constrained by token AND IsImpersonation == false. A return value
		// of false means no ordinary session matched the token — the token
		// may be an impersonation session, or the session was already
		// consumed by a concurrent request. Either way this is an
		// authenticated (non-401) failure: the ordinary session cannot be
		// revoked. A valid impersonation token remains usable and no
		// `impersonation.ended` audit action is emitted from here.
		var revoked = await sessionService.RevokeRegularSessionForTokenAsync(
			token,
			cancellationToken
		);

		if (!revoked) {
			return TypedProblems.Forbidden(
				"Session is not an ordinary session, or has already been revoked",
				ResponseKeys.SessionNotRegular
			);
		}

		return TypedResults.Ok(
			ApiResponse.Create(
				"Session revoked successfully",
				ResponseKeys.SessionRevoked
			)
		);
	}
}
