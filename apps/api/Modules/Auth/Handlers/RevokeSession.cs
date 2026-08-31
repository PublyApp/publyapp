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
		AppUnauthorizedHttpResult
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

		await sessionService.RevokeSessionForTokenAsync(
			token,
			cancellationToken
		);

		return TypedResults.Ok(
			ApiResponse.Create(
				"Session revoked successfully",
				ResponseKeys.SessionRevoked
			)
		);
	}
}
