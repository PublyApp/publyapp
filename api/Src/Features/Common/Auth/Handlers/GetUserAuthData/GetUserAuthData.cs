using MainApi.Src.Data.DbContext;
using MainApi.Src.Lib;
using Microsoft.AspNetCore.Http.HttpResults;

namespace MainApi.Src.Features.Common.Auth.Handlers.GetUserAuthData;

public class GetUserAuthDataSuccessResult
{
	public string UserId { get; set; } = string.Empty;
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
			throw new Exception("GetUserAuthData must be set behind SessionAuthMiddleware.");
		}

		var user = await dbContext.User.FindAsync(authContext.UserId);

		if (user == null)
		{
			logger.LogDebug("User not found: {@Context}", new
			{
				UserId = authContext.UserId,
			});
			return TypedResults.BadRequest(new AppResponseResult
			{
				Message = "User not found",
				Key = "user-not-found"
			});
		}

		return TypedResults.Ok(new GetUserAuthDataSuccessResult
		{
			UserId = user.Id ?? throw new Exception("Id is null"),
			Email = user.Email ?? throw new Exception("Email is null")
		});
	}
}
