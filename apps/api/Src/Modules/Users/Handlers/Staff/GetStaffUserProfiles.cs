using MainApi.Localization;
using MainApi.Src.Lib;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Modules.Users.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.Users.Handlers.Staff;

public sealed class StaffUserProfileItem {
	public required Guid Id { get; init; }
	public required string Name { get; init; }
	public string? Description { get; init; }
}

public sealed class GetStaffUserProfilesResult {
	public required int MaxProfilesPerUser { get; init; }
	public required List<StaffUserProfileItem> AssignedProfiles { get; init; }
}

public class GetStaffUserProfiles {
	public static async Task<
		Results<
			Ok<GetStaffUserProfilesResult>,
			AppBadRequestHttpResult,
			AppNotFoundHttpResult
		>
	> HandleGetStaffUserProfiles(
		[FromRoute] string userId,
		[FromServices] IUserService userService,
		ILogger<GetStaffUserProfiles> logger,
		CancellationToken cancellationToken
	) {
		if (!Guid.TryParse(userId, out var userIdGuid)) {
			if (logger.IsEnabled(LogLevel.Debug)) {
				logger.LogDebug(
					"Invalid user id: {@LogData}",
					new { UserId = userId }
				);
			}

			return TypedProblems.BadRequest(
				"Invalid user ID",
				ResponseKeys.MalformedId
			);
		}

		var result = await userService.GetStaffUserProfilesAsync(
			userIdGuid,
			cancellationToken
		);

		if (result is null) {
			if (logger.IsEnabled(LogLevel.Debug)) {
				logger.LogDebug(
					"User does not exist or is not a staff member: {@LogData}",
					new { UserId = userIdGuid }
				);
			}

			return TypedProblems.NotFound(
				"User not found",
				ResponseKeys.NotFound
			);
		}

		return TypedResults.Ok(new GetStaffUserProfilesResult {
			MaxProfilesPerUser = AppEnvironment.Instance.MAX_PROFILES_PER_USER,
			AssignedProfiles = result.AssignedProfiles
				.Select(p => new StaffUserProfileItem {
					Id = p.Id,
					Name = p.Name,
					Description = p.Description,
				})
				.ToList(),
		});
	}
}
