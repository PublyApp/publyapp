using MainApi.Localization;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Modules.Profiles.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.Profiles.Handlers.Staff;

public class AssignStaffProfilePermission {
	public static async Task<Results<
		NoContent,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult
	>> HandleAssignStaffProfilePermission(
		[FromServices] IProfileAsStaffService profileAsStaffService,
		[FromRoute] string profileId,
		[FromRoute] string permissionKey,
		CancellationToken cancellationToken
	) {
		if (!Guid.TryParse(profileId, out var profileIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid profileId",
				ResponseKeys.MalformedId
			);
		}

		if (string.IsNullOrWhiteSpace(permissionKey)) {
			return TypedProblems.BadRequest(
				"Invalid permissionKey",
				ResponseKeys.BadRequest
			);
		}

		var result = await profileAsStaffService.SetStaffProfilePermissionAsync(
			new SetStaffProfilePermissionArgs(
				ProfileId: profileIdGuid,
				PermissionKey: permissionKey.Trim(),
				IsAssigned: true
			),
			cancellationToken
		);

		if (result is SetStaffProfilePermissionResult.ProfileNotFound) {
			return TypedProblems.NotFound(
				"Profile not found",
				ResponseKeys.NotFound
			);
		}

		if (result is SetStaffProfilePermissionResult.PermissionNotFound) {
			return TypedProblems.BadRequest(
				"Permission not found",
				ResponseKeys.BadRequest
			);
		}

		if (result is SetStaffProfilePermissionResult.Success) {
			// No payload: this endpoint is used by switch toggles and can be called frequently.
			return TypedResults.NoContent();
		}

		throw new InvalidOperationException("Unhandled result type");
	}
}
