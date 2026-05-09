using System.ComponentModel.DataAnnotations;
using System.Text.Json;

using FluentValidation;

using MainApi.Src.Lib;
using MainApi.Src.Lib.Extensions;
using MainApi.Src.Lib.Validation;
using MainApi.Src.Modules.AuditLogs.Entities;
using MainApi.Src.Modules.AuditLogs.Services;
using MainApi.Src.Modules.Invitations.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.Invitations.Handlers.Staff;

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
		HandleBulkRevokeStaffInvitations(
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
