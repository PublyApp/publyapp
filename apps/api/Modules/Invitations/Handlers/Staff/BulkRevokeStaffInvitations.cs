using System.ComponentModel.DataAnnotations;
using System.Text.Json;

using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Extensions;
using PublyApp.Api.Lib.Validation;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.AuditLogs.Services;
using PublyApp.Api.Modules.Invitations.Services;

namespace PublyApp.Api.Modules.Invitations.Handlers.Staff;

public sealed class BulkRevokeStaffInvitationsBody {
	[Required]
	public JsonElement InvitationIds { get; init; }

	public List<Guid> GetInvitationIds() {
		var invitationIds = new List<Guid>();

		foreach (var invitationIdElement in InvitationIds.EnumerateArray()) {
			invitationIds.Add(invitationIdElement.GetValueAsGuid());
		}

		return invitationIds;
	}
}

public sealed class BulkRevokeStaffInvitationsBodyValidator
	: AbstractValidator<BulkRevokeStaffInvitationsBody> {
	public BulkRevokeStaffInvitationsBodyValidator() {
		RuleFor(x => x.InvitationIds)
			.MustBeRequiredGuidArray(
				fieldName: "invitationIds",
				itemName: "invitationId",
				// Must stay in sync with shared BULK_ACTION_MAX_COUNT
				// (packages/shared-ts/lib/constants.ts) used by frontend selection UIs.
				maxCount: 100
			);
	}
}

public sealed class BulkRevokeStaffInvitations {
	public static async Task<Ok<BulkStaffInvitationActionResult>>
		Handle(
			[FromBody] BulkRevokeStaffInvitationsBody body,
			[FromServices] IRequestAuthContext authContext,
			[FromServices] IInvitationService invitationService,
			[FromServices] IAuditLogService auditLogService,
			[FromServices] ILogger<BulkRevokeStaffInvitations> logger,
			CancellationToken cancellationToken = default
	) {
		var account = authContext.AccountStaff;
		if (account is null) {
			throw new InvalidOperationException(
				"Staff account not found in auth context. "
				+ "Ensure the endpoint has .WithPermission() middleware."
			);
		}

		var requestedInvitationIds = body.GetInvitationIds().Distinct().ToList();
		var result = await invitationService.BulkRevokeStaffInvitationsAsync(
			requestedInvitationIds,
			cancellationToken
		);
		var failedInvitationIds = result.FailedItems
			.Select(item => item.InvitationId)
			.ToHashSet();
		var succeededInvitationIds = requestedInvitationIds
			.Where(invitationId => !failedInvitationIds.Contains(invitationId))
			.ToList();

		try {
			await auditLogService.LogManyAsync(
				succeededInvitationIds
					.Select(invitationId => new CreateAuditLogArgs(
						UserId: account.UserId,
						Action: AuditActions.InvitationRevoked,
						TargetId: invitationId
					))
					.ToList(),
				cancellationToken
			);
		} catch (Exception ex) {
			// Audit logging is observability — don't fail the bulk response over it.
			// Log centrally and let the user see their bulk action succeed.
			logger.LogError(
				ex,
				"Failed to write audit logs for bulk staff invitation revoke; {Count} entries lost.",
				succeededInvitationIds.Count
			);
		}

		return TypedResults.Ok(result);
	}
}
