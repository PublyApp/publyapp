using MainApi.Localization;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Modules.Profiles.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.Profiles.Handlers.Staff;

public class GetStaffProfileByIdResult {
	public required StaffProfileItem Profile { get; set; }
}

public class GetStaffProfileById {
	public static async Task<
		Results<
			Ok<GetStaffProfileByIdResult>,
			AppNotFoundHttpResult,
			AppBadRequestHttpResult
		>
	> HandleGetStaffProfileById(
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

		var serviceResult =
			await profileAsStaffService.GetStaffProfileByIdAsync(
				profileId: profileIdGuid,
				cancellationToken: cancellationToken
			);

		if (serviceResult is GetStaffProfileByIdServiceResult.ProfileNotFound) {
			return TypedProblems.NotFound(
				"Profile not found",
				ResponseKeys.NotFound
			);
		}

		if (serviceResult is GetStaffProfileByIdServiceResult.Success success) {
			return TypedResults.Ok(new GetStaffProfileByIdResult { Profile = success.Profile });
		}

		throw new InvalidOperationException("Unhandled result type");
	}
}

