using MainApi.Src.Data.DbContext;
using MainApi.Src.Lib;
using Microsoft.AspNetCore.Http.HttpResults;

namespace MainApi.Src.Features.Common.Auth.Handlers.GetUserAuthData;

public class GetUserAuthDataSuccessResult
{
	public Guid UserId { get; set; }
	public string Email { get; set; } = string.Empty;
}

public class GetUserAuthData
{
	public static async Task<
	Results<
	Ok<GetUserAuthDataSuccessResult>,
	BadRequest<AppResponseResult>
	>
	> HandleGetUserAuthData(
	IAuthContext authContext,
	ILogger<GetUserAuthData> logger,
	MainApiDbContext dbContext
	)
	{
		if (!authContext.IsAuthenticated)
		{
			logger.LogError("{@GetUserAuthData}", new
			{
				UserId = authContext.UserId,
				SessionToken = authContext.SessionToken
			});
			throw new Exception("GetUserAuthData must be set behind SessionAuthMiddleware.");
		}

		var user = await dbContext.User.FindAsync(authContext.UserId);

		if (user == null)
		{
			logger.LogError("User not found for session: {@Context}", new
			{
				UserId = authContext.UserId,
				SessionToken = authContext.SessionToken
			});
			return TypedResults.BadRequest(new AppResponseResult
			{
				Message = "Invalid session",
				Key = "invalid-session"
			});
		}

		return TypedResults.Ok(new GetUserAuthDataSuccessResult
		{
			UserId = user.Id,
			Email = user.Email ?? throw new Exception("Email is null")
		});
	}
}
