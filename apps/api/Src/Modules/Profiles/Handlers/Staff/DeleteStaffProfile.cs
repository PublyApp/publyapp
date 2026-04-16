using MainApi.Localization;
using MainApi.Src.Lib;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Modules.Profiles.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.Profiles.Handlers.Staff;

public sealed class DeleteStaffProfile {
	public static async Task<
		Results<
			Ok<ApiResponse>,
			AppBadRequestHttpResult,
			AppNotFoundHttpResult
		>
	> HandleDeleteStaffProfile(
		[FromRoute] string profileId,
		[FromServices] IProfileAsStaffService profileAsStaffService,
		CancellationToken cancellationToken
	) {
		// Keep route-level concerns here only: malformed IDs stay a 400, while
		// existence/soft-delete semantics stay in the service.
		if (!Guid.TryParse(profileId, out var profileIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid profileId",
				ResponseKeys.MalformedId
			);
		}

		var result = await profileAsStaffService.DeleteStaffProfileAsync(
			profileIdGuid,
			cancellationToken
		);

		if (result is DeleteStaffProfileServiceResult.ProfileNotFound) {
			return TypedProblems.NotFound(
				"Profile not found",
				ResponseKeys.NotFound
			);
		}

		if (result is not DeleteStaffProfileServiceResult.Success success) {
			throw new InvalidOperationException(
				"Unhandled DeleteStaffProfileServiceResult type: " + result.GetType().Name
			);
		}

		return TypedResults.Ok(
			ApiResponse.Create(
				$"Deleted {success.DeletedProfileCount} profile(s)",
				ResponseKeys.StaffProfileDeletedSuccess
			)
		);
	}
}
