using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Users.Services;

namespace PublyApp.Api.Modules.Users.Handlers.Staff;

public sealed class StaffUserRoleItem {
	public required Guid Id { get; init; }
	public required string Name { get; init; }
	public string? Description { get; init; }
}

public sealed class GetStaffUserRolesResult {
	public required int MaxRolesPerUser { get; init; }
	public required List<StaffUserRoleItem> AssignedRoles { get; init; }
}

public sealed class GetStaffUserRoles {
	public static async Task<
		Results<
			Ok<GetStaffUserRolesResult>,
			AppBadRequestHttpResult,
			AppNotFoundHttpResult
		>
	> Handle(
		[FromRoute] string userId,
		[FromServices] IStaffUserRoleAssignmentService userService,
		ILogger<GetStaffUserRoles> logger,
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

		var result = await userService.GetStaffUserRolesAsync(
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

		return TypedResults.Ok(new GetStaffUserRolesResult {
			MaxRolesPerUser = AppEnvironment.Instance.MAX_ROLES_PER_USER,
			AssignedRoles = result.AssignedRoles
				.Select(p => new StaffUserRoleItem {
					Id = p.Id,
					Name = p.Name,
					Description = p.Description,
				})
				.ToList(),
		});
	}
}
