using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Profiles.Services;

namespace PublyApp.Api.Modules.Profiles.Handlers.Staff;

public class FindStaffProfilePermissionsResult {
	// We intentionally return the raw permission keys (strings), not a denormalized permission DTO.
	// The UI already loads the catalog of permissions (localized names/descriptions) via /staff/permissions.
	public required List<string> PermissionKeys { get; init; }
}

public sealed class FindStaffProfilePermissions {
	public static async Task<
		Results<
			Ok<FindStaffProfilePermissionsResult>,
			AppBadRequestHttpResult,
			AppNotFoundHttpResult
		>
	> Handle(
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
