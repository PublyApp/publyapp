using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Profiles.Services;

namespace PublyApp.Api.Modules.Profiles.Handlers.Staff;

public class GetStaffProfileByIdResult {
	public required StaffProfileItem Profile { get; set; }
}

public sealed class GetStaffProfileById {
	public static async Task<
		Results<
			Ok<GetStaffProfileByIdResult>,
			AppNotFoundHttpResult,
			AppBadRequestHttpResult
		>
	> Handle(
		[FromServices] IStaffProfileQueryAsStaffService profileQueryAsStaffService,
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
			await profileQueryAsStaffService.GetStaffProfileByIdAsync(
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

