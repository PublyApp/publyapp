using System.ComponentModel.DataAnnotations;
using System.Text.Json;

using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Extensions;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Validation;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.AuditLogs.Services;
using PublyApp.Api.Modules.Profiles.Services;

namespace PublyApp.Api.Modules.Profiles.Handlers.Staff;

public sealed class BulkDeleteTenantProfilesBody {
	// Request payload intentionally holds JsonElement so the shared validator can
	// enforce JSON shape and max-count constraints uniformly.
	[Required]
	public JsonElement ProfileIds { get; init; }

	public List<Guid> GetProfileIds() {
		var profileIds = new List<Guid>();
		foreach (var profileIdElement in ProfileIds.EnumerateArray()) {
			profileIds.Add(profileIdElement.GetValueAsGuid());
		}
		return profileIds;
	}
}

public sealed class BulkDeleteTenantProfilesBodyValidator
	: AbstractValidator<BulkDeleteTenantProfilesBody> {
	public BulkDeleteTenantProfilesBodyValidator() {
		RuleFor(x => x.ProfileIds)
			.MustBeRequiredGuidArray(
				fieldName: "profileIds",
				itemName: "profileId",
				maxCount: 100
			);
	}
}

public sealed class BulkDeleteTenantProfilesAsStaff {
	// Handles tenant-scoped bulk deletes. Returns aggregated batch status and keeps
	// per-profile failures visible to the caller.
	public static async Task<
		Results<Ok<BulkProfileActionResult>, AppBadRequestHttpResult>
	> Handle(
		[FromRoute] string tenantId,
		[FromBody] BulkDeleteTenantProfilesBody body,
		[FromServices] ITenantProfileAsStaffService tenantProfileService,
		[FromServices] IAuditLogService auditLogService,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] ILogger<BulkDeleteTenantProfilesAsStaff> logger,
		CancellationToken cancellationToken = default
	) {
		// Tenant-scoped bulk delete requires staff context and a valid tenant route id.
		var account = authContext.AccountStaff;
		if (account is null) {
			throw new InvalidOperationException(
				"Staff account not found in auth context. Ensure the endpoint has .WithPermission()."
			);
		}

		if (!Guid.TryParse(tenantId, out var tenantIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid tenant ID",
				ResponseKeys.MalformedId
			);
		}

		var distinctProfileIds = body.GetProfileIds().Distinct().ToList();
		var result = await tenantProfileService.BulkDeleteTenantProfilesAsync(
			new BulkDeleteTenantProfilesArgs(
				TenantId: tenantIdGuid,
				ProfileIds: distinctProfileIds
			),
			cancellationToken
		);

		if (logger.IsEnabled(LogLevel.Information)) {
			logger.LogInformation(
				"Bulk delete tenant profiles completed: {Succeeded} succeeded, {Failed} failed",
				result.SucceededCount,
				result.FailedCount
			);
		}

		await auditLogService.LogAsync(
			new CreateAuditLogArgs(
				UserId: account.UserId,
				Action: AuditActions.TenantProfileBulkDeleted,
				TargetId: null,
				Details: new {
					TenantId = tenantIdGuid,
					RequestedCount = distinctProfileIds.Count,
					result.SucceededCount,
					result.FailedCount,
					ProfileIds = distinctProfileIds,
					FailedItems = result.FailedItems
				}
			),
			cancellationToken
		);

		return TypedResults.Ok(result);
	}
}
