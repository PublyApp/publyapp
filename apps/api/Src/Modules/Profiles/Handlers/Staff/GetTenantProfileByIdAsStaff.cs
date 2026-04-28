using MainApi.Localization;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Modules.Profiles.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.Profiles.Handlers.Staff;

public class GetTenantProfileByIdResponse {
	public required TenantProfileItem Profile { get; init; }
}

public class GetTenantProfileByIdAsStaff {
	public static async Task<Results<
		Ok<GetTenantProfileByIdResponse>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult
	>> HandleGetTenantProfileByIdAsStaff(
		[FromServices] IProfileAsStaffService profileAsStaffService,
		[FromRoute] string tenantId,
		[FromRoute] string profileId,
		CancellationToken cancellationToken
	) {
		if (!Guid.TryParse(tenantId, out var tenantIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid tenant ID",
				ResponseKeys.MalformedId
			);
		}

		if (!Guid.TryParse(profileId, out var profileIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid profileId",
				ResponseKeys.MalformedId
			);
		}

		var result = await profileAsStaffService.GetTenantProfileByIdAsync(
			new GetTenantProfileByIdArgs(
				TenantId: tenantIdGuid,
				ProfileId: profileIdGuid
			),
			cancellationToken
		);

		if (result is GetTenantProfileByIdResult.ProfileNotFound) {
			return TypedProblems.NotFound(
				"Profile not found",
				ResponseKeys.NotFound
			);
		}

		if (result is GetTenantProfileByIdResult.Success success) {
			return TypedResults.Ok(new GetTenantProfileByIdResponse {
				Profile = success.Profile
			});
		}

		throw new InvalidOperationException("Unhandled result type");
	}
}
