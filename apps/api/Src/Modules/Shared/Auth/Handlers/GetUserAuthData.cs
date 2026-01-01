using MainApi.Localization;
using MainApi.Src.Lib;
using MainApi.Src.Lib.Middlewares;
using MainApi.Src.Modules.Shared.Users;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.Shared.Auth.Handlers;

public class GetUserAuthDataResult {
	public Guid Id { get; set; }
	public string Email { get; set; } = string.Empty;
	public string? AvatarUrl { get; set; }
	public string? FirstName { get; set; }
	public string? LastName { get; set; }
}

public class GetUserAuthData {
	public static async Task<
	Results<
		Ok<GetUserAuthDataResult>,
		BadRequest<ApiResponse>
		>
	> HandleGetUserAuthData(
		IRequestAuthContext authContext,
		ILogger<GetUserAuthData> logger,
		[FromServices] IUserService userService,
		CancellationToken cancellationToken
	) {
		if (!authContext.IsAuthenticated) {
			logger.LogError("{@GetUserAuthData}", new {
				UserId = authContext.UserId,
				SessionToken = authContext.SessionToken
			});
			throw new Exception($"{nameof(GetUserAuthData)} must be set behind {nameof(SessionAuthMiddleware)}.");
		}

		if (authContext.UserId is not Guid userId) {
			throw new Exception($"{nameof(authContext.UserId)} is not a GUID");
		}

		var user = await userService.GetUserByIdAsync(userId, cancellationToken);

		if (user is null) {
			logger.LogError("User not found for session: {@Context}", new {
				SessionToken = authContext.SessionToken,
				UserId = authContext.UserId,
			});

			return TypedResults.BadRequest(ApiResponse.Create(
					"Invalid session",
					ResponseKeys.InvalidSession
				));
		}

		return TypedResults.Ok(new GetUserAuthDataResult {
			Id = user.GetRequiredId(),
			Email = user.Email,
			AvatarUrl = user.AvatarUrl,
			FirstName = user.FirstName,
			LastName = user.LastName
		});
	}
}
