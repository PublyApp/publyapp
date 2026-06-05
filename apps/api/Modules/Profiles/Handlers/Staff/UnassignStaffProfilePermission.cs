using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Profiles.Services;

namespace PublyApp.Api.Modules.Profiles.Handlers.Staff;

public sealed class UnassignStaffProfilePermission {
	public static async Task<Results<
		NoContent,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult
	>> Handle(
		[FromServices] IStaffProfileAsStaffService profileAsStaffService,
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
				IsAssigned: false
			),
			cancellationToken
		);

		if (result is SetStaffProfilePermissionResult.ProfileNotFound) {
			return TypedProblems.NotFound(
				"Profile not found",
				ResponseKeys.NotFound
			);
		}

		// Unassign should be idempotent:
		// if the permission doesn't exist (or isn't staff-scoped), we don't treat it as an error.
		if (result is SetStaffProfilePermissionResult.Success
			or SetStaffProfilePermissionResult.PermissionNotFound) {
			// No payload: this endpoint is used by switch toggles and can be called frequently.
			return TypedResults.NoContent();
		}

		throw new InvalidOperationException("Unhandled result type");
	}
}
