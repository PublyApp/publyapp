using MainApi.Localization;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Modules.Profiles.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.Profiles.Handlers.Staff;

public class FindStaffProfilePermissionsResult {
	// We intentionally return the raw permission keys (strings), not a denormalized permission DTO.
	// The UI already loads the catalog of permissions (localized names/descriptions) via /staff/permissions.
	public required List<string> PermissionKeys { get; init; }
}

public class FindStaffProfilePermissions {
	public static async Task<
		Results<
			Ok<FindStaffProfilePermissionsResult>,
			AppBadRequestHttpResult,
			AppNotFoundHttpResult
		>
	> HandleFindStaffProfilePermissions(
		[FromServices] IProfileAsStaffService profileAsStaffService,
		[FromRoute] string profileId,
		CancellationToken cancellationToken
	) {
		if (!Guid.TryParse(profileId, out var profileIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid profileId",
				ResponseKeys.MalformedId
			);
		}

		var result = await profileAsStaffService.FindStaffProfilePermissionKeysAsync(
			profileIdGuid,
			cancellationToken
		);

		if (result is FindStaffProfilePermissionKeysResult.ProfileNotFound) {
			return TypedProblems.NotFound(
				"Profile not found",
				ResponseKeys.NotFound
			);
		}

		if (result is FindStaffProfilePermissionKeysResult.Success success) {
			return TypedResults.Ok(new FindStaffProfilePermissionsResult {
				PermissionKeys = success.PermissionKeys
			});
		}

		throw new InvalidOperationException("Unhandled result type");
	}
}
