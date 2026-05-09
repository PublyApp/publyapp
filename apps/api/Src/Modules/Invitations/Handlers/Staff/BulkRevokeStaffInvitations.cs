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

		foreach (var invitationId in succeededInvitationIds) {
			await auditLogService.LogAsync(
				new CreateAuditLogArgs(
					UserId: account.UserId,
					Action: AuditActions.InvitationRevoked,
					TargetId: invitationId
				),
				cancellationToken
			);
		}

		return TypedResults.Ok(result);
	}
}
