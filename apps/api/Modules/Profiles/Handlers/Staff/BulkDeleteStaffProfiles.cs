using System.ComponentModel.DataAnnotations;
using System.Text.Json;

using FluentValidation;

using MainApi.Lib;
using MainApi.Lib.Extensions;
using MainApi.Lib.Validation;
using MainApi.Modules.AuditLogs.Entities;
using MainApi.Modules.AuditLogs.Services;
using MainApi.Modules.Profiles.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Modules.Profiles.Handlers.Staff;

public sealed class BulkDeleteStaffProfilesBody {
	// Request payload intentionally holds JsonElement because API contract uses an
	// untyped array for compatibility with current bulk request patterns.
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

public sealed class BulkDeleteStaffProfilesBodyValidator
	: AbstractValidator<BulkDeleteStaffProfilesBody> {
	public BulkDeleteStaffProfilesBodyValidator() {
		RuleFor(x => x.ProfileIds)
			.MustBeRequiredGuidArray(
				fieldName: "profileIds",
				itemName: "profileId",
				maxCount: 100
			);
	}
}

public sealed class BulkDeleteStaffProfiles {
	// Handles one bulk request for multiple staff profile IDs and returns a
	// batched success/failure count response, never throwing per-item.
	public static async Task<Ok<BulkProfileActionResult>>
		HandleBulkDeleteStaffProfiles(
		[FromBody] BulkDeleteStaffProfilesBody body,
		[FromServices] IProfileAsStaffService profileAsStaffService,
		[FromServices] IAuditLogService auditLogService,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] ILogger<BulkDeleteStaffProfiles> logger,
		CancellationToken cancellationToken = default
	) {
		// Staff profile bulk delete is staff-only and relies on auth context.
		var account = authContext.AccountStaff;
		if (account is null) {
			throw new InvalidOperationException(
				"Staff account not found in auth context. Ensure the endpoint has .WithPermission()."
			);
		}

		// Normalize incoming IDs once; backend service enforces max batch size via validation.
		var distinctProfileIds = body.GetProfileIds().Distinct().ToList();
		var result = await profileAsStaffService.BulkDeleteStaffProfilesAsync(
			new BulkDeleteStaffProfilesArgs(ProfileIds: distinctProfileIds),
			cancellationToken
		);

		if (logger.IsEnabled(LogLevel.Information)) {
			logger.LogInformation(
				"Bulk delete staff profiles completed: {Succeeded} succeeded, {Failed} failed",
				result.SucceededCount,
				result.FailedCount
			);
		}

		await auditLogService.LogAsync(
			new CreateAuditLogArgs(
				UserId: account.UserId,
				Action: AuditActions.StaffProfileBulkDeleted,
				TargetId: null,
				Details: new {
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
