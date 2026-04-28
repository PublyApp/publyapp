using MainApi.Localization;
using MainApi.Src.Lib;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Modules.AuditLogs.Entities;
using MainApi.Src.Modules.AuditLogs.Services;
using MainApi.Src.Modules.Profiles.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.Profiles.Handlers.Staff;

public sealed class DeleteTenantProfileAsStaff {
	public static async Task<Results<
		Ok<ApiResponse>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult
	>> HandleDeleteTenantProfileAsStaff(
		[FromRoute] string tenantId,
		[FromRoute] string profileId,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] IProfileAsStaffService profileAsStaffService,
		[FromServices] IAuditLogService auditLogService,
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

		var result = await profileAsStaffService.DeleteTenantProfileAsync(
			new DeleteTenantProfileArgs(
				TenantId: tenantIdGuid,
				ProfileId: profileIdGuid
			),
			cancellationToken
		);

		if (result is DeleteTenantProfileResult.ProfileNotFound) {
			return TypedProblems.NotFound(
				"Profile not found",
				ResponseKeys.NotFound
			);
		}

		if (result is DeleteTenantProfileResult.DefaultProfileDeletionNotAllowed) {
			return TypedProblems.BadRequest(
				"Default tenant profile cannot be deleted",
				ResponseKeys.TenantProfileDefaultDeleteNotAllowed
			);
		}

		if (result is not DeleteTenantProfileResult.Success success) {
			throw new InvalidOperationException(
				"Unhandled DeleteTenantProfileResult type: "
				+ result.GetType().Name
			);
		}

		var account = authContext.AccountStaff;
		if (account is null) {
			throw new InvalidOperationException(
				"Staff account not found in auth context. Ensure the endpoint has .WithPermission() middleware."
			);
		}

		await auditLogService.LogAsync(
			account.UserId,
			AuditActions.TenantProfileDeleted,
			profileIdGuid,
			new {
				// Log the pre-delete snapshot because the profile row is soft-deleted and its
				// junction rows are removed in the same transaction.
				TenantId = tenantIdGuid,
				ProfileId = profileIdGuid,
				ProfileName = success.Profile.ProfileName,
				IsDefault = success.Profile.IsDefault
			},
			cancellationToken
		);

		return TypedResults.Ok(
			ApiResponse.Create(
				"Tenant profile deleted successfully",
				ResponseKeys.TenantProfileDeletedSuccess
			)
		);
	}
}
