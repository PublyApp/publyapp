using MainApi.Localization;
using MainApi.Src.Features.Common.User;
using MainApi.Src.Lib;
using MainApi.Src.Lib.Middlewares;
using Microsoft.AspNetCore.Http.HttpResults;

namespace MainApi.Src.Features.Common.Auth.Handlers.GetUserAuthData;

public class GetUserAuthDataSuccessResult {
	public Guid UserId { get; set; }
	public string Email { get; set; } = string.Empty;
}

public class GetUserAuthData {
	public static async Task<
	Results<
		Ok<GetUserAuthDataSuccessResult>,
		BadRequest<ApiResponse>
		>
	> HandleGetUserAuthData(
		IAuthContext authContext,
		ILogger<GetUserAuthData> logger,
		IUserService userService,
		CancellationToken cancellationToken = default
	) {
		if (!authContext.IsAuthenticated) {
			logger.LogError("{@GetUserAuthData}", new {
				UserId = authContext.UserId,
				SessionToken = authContext.SessionToken
			});
			throw new Exception($"{nameof(GetUserAuthData)} must be set behind {nameof(SessionAuthMiddleware)}.");
		}

		if (authContext.UserId is not Guid userId) {
			return TypedResults.BadRequest(ApiResponse.Create(
					"Invalid session",
					ResponseKeys.InvalidSession
			));
		}

		var user = await userService.GetUserByIdAsync(userId, cancellationToken);

		if (user is null) {
			logger.LogError("User not found for session: {@Context}", new {
				UserId = authContext.UserId,
				SessionToken = authContext.SessionToken
			});
			return TypedResults.BadRequest(ApiResponse.Create(
					"Invalid session",
					ResponseKeys.InvalidSession
				));
		}

		return TypedResults.Ok(new GetUserAuthDataSuccessResult {
			UserId = user.Id,
			Email = user.Email
		});
	}
}
