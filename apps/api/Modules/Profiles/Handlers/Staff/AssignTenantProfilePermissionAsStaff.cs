using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.AuditLogs.Services;
using PublyApp.Api.Modules.Profiles.Services;

namespace PublyApp.Api.Modules.Profiles.Handlers.Staff;

public sealed class AssignTenantProfilePermissionAsStaff {
	public static async Task<Results<
		NoContent,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult
	>> Handle(
		[FromRoute] string tenantId,
		[FromRoute] string profileId,
		[FromRoute] string permissionKey,
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

		if (string.IsNullOrWhiteSpace(permissionKey)) {
			return TypedProblems.BadRequest(
				"Invalid permissionKey",
				ResponseKeys.BadRequest
			);
		}

		var normalizedPermissionKey = permissionKey.Trim();
		var result = await profileAsStaffService.SetTenantProfilePermissionAsync(
			new SetTenantProfilePermissionArgs(
				TenantId: tenantIdGuid,
				ProfileId: profileIdGuid,
				PermissionKey: normalizedPermissionKey,
				IsAssigned: true
			),
			cancellationToken
		);

		if (result is SetTenantProfilePermissionResult.ProfileNotFound) {
			return TypedProblems.NotFound(
				"Profile not found",
				ResponseKeys.NotFound
			);
		}

		if (result is SetTenantProfilePermissionResult.PermissionNotFound) {
			return TypedProblems.BadRequest(
				"Permission not found",
				ResponseKeys.BadRequest
			);
		}

		if (result is SetTenantProfilePermissionResult.Success success) {
			if (success.Changed) {
				var account = authContext.AccountStaff;
				if (account is null) {
					throw new InvalidOperationException(
						"Staff account not found in auth context. Ensure the endpoint has .WithPermission() middleware."
					);
				}

				await auditLogService.LogAsync(
					new CreateAuditLogArgs(
						UserId: account.UserId,
						Action: AuditActions.TenantProfilePermissionsAssigned,
						TargetId: profileIdGuid,
						Details: new {
							TenantId = tenantIdGuid,
							ProfileId = profileIdGuid,
							ProfileName = success.Profile.ProfileName,
							IsDefault = success.Profile.IsDefault,
							PermissionKey = normalizedPermissionKey
						}
					),
					cancellationToken
				);
			}

			return TypedResults.NoContent();
		}

		throw new InvalidOperationException("Unhandled result type");
	}
}
