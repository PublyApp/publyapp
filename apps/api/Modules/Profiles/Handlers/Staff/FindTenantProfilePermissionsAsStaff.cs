using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Profiles.Services;

namespace PublyApp.Api.Modules.Profiles.Handlers.Staff;

public class FindTenantProfilePermissionsAsStaffResult {
	public required List<string> PermissionKeys { get; init; }
}

public sealed class FindTenantProfilePermissionsAsStaff {
	public static async Task<Results<
		Ok<FindTenantProfilePermissionsAsStaffResult>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult
	>> Handle(
		[FromServices] ITenantProfileAsStaffService tenantProfileService,
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

		var result = await tenantProfileService
			.FindTenantProfilePermissionKeysAsync(
				new FindTenantProfilePermissionKeysArgs(
					TenantId: tenantIdGuid,
					ProfileId: profileIdGuid
				),
				cancellationToken
			);

		if (result is FindTenantProfilePermissionKeysResult.ProfileNotFound) {
			return TypedProblems.NotFound(
				"Profile not found",
				ResponseKeys.NotFound
			);
		}

		if (result is FindTenantProfilePermissionKeysResult.Success success) {
			return TypedResults.Ok(new FindTenantProfilePermissionsAsStaffResult {
				PermissionKeys = success.PermissionKeys
			});
		}

		throw new InvalidOperationException("Unhandled result type");
	}
}
