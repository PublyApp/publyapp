using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Profiles.Services;

namespace PublyApp.Api.Modules.Profiles.Handlers.Staff;

public sealed class DeleteStaffProfile {
	public static async Task<
		Results<
			Ok<ApiResponse>,
			AppBadRequestHttpResult,
			AppNotFoundHttpResult
		>
	> Handle(
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
