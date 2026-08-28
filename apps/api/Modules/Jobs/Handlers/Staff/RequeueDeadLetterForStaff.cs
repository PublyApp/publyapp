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
using PublyApp.Api.Modules.Jobs.Services;

namespace PublyApp.Api.Modules.Jobs.Handlers.Staff;

public record RequeueDeadLetterForStaffBody {
	public JsonElement? Note { get; init; }

	public string? GetNote() {
		return Note.GetValueAsStringOrNull();
	}
}

public record DeadLetterRequeuedResponse {
	public required Guid JobId { get; init; }
	public required Guid DeadLetterId { get; init; }

	// Transparent-outcome rule (#1350 item 2): plain-words result + stable key.
	public string Message { get; init; } = string.Empty;
	public string Key { get; init; } = string.Empty;
}

public class RequeueDeadLetterForStaffBodyValidator
	: AbstractValidator<RequeueDeadLetterForStaffBody> {
	public RequeueDeadLetterForStaffBodyValidator() {
		RuleFor(x => x.Note)
			.MustBeNullableStringWithMaxLength("Note", 500, trim: true);
	}
}

/// <summary>
/// A5 (#636): POST /staff/dead-letter/{id}/requeue — reproduces the preserved
/// envelope into job_queue under one transaction (service) and records who
/// requeued what (audit here, handler-owned like every staff mutation).
/// Fail-closed contract: unknown/malformed id → 404, already-requeued race → 409.
/// </summary>
public sealed class RequeueDeadLetterForStaff {
	public static async Task<Results<
		Ok<DeadLetterRequeuedResponse>,
		AppNotFoundHttpResult,
		AppConflictHttpResult
	>> Handle(
		string? deadLetterId,
		[FromBody] RequeueDeadLetterForStaffBody body,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] IDeadLetterQueryService deadLetterQueryService,
		[FromServices] IAuditLogService auditLogService,
		CancellationToken cancellationToken = default
	) {
		// No route constraints on ID parameters (repo rule): bind as string, parse
		// here. Unknown OR malformed id → 404.
		if (!Guid.TryParse(deadLetterId, out var parsedId) || parsedId == Guid.Empty) {
			return TypedProblems.NotFound(
				"deadLetterId must be a valid dead-letter identifier",
				ResponseKeys.DeadLetterNotFound,
				title: "Invalid dead-letter id"
			);
		}

		var account = authContext.AccountStaff;
		if (account is null) {
			throw new InvalidOperationException(
				"Staff account not found in auth context. "
				+ "Ensure the endpoint has "
				+ ".WithPermission() middleware."
			);
		}

		var note = body.GetNote();

		var result = await deadLetterQueryService.RequeueAsync(
			new RequeueDeadLetterArgs(parsedId),
			cancellationToken
		);

		if (result is RequeueDeadLetterResult.NotFound) {
			return TypedProblems.NotFound(
				$"No dead-letter entry exists with id {deadLetterId}",
				ResponseKeys.DeadLetterNotFound
			);
		}

		if (result is RequeueDeadLetterResult.AlreadyRequeued) {
			return TypedProblems.Conflict(
				"Dead-letter entry has already been requeued into job_queue.",
				ResponseKeys.DeadLetterRequeueConflict
			);
		}

		var requeued = (RequeueDeadLetterResult.Requeued)result;

		await auditLogService.LogAsync(
			new CreateAuditLogArgs(
				UserId: account.UserId,
				Action: AuditActions.JobDeadLetterRequeued,
				TargetId: parsedId,
				Details: new {
					NewJobId = requeued.NewJobId,
					OriginalJobId = requeued.OriginalJobId,
					Note = note
				}
			),
			cancellationToken
		);

		return TypedResults.Ok(new DeadLetterRequeuedResponse {
			JobId = requeued.NewJobId,
			DeadLetterId = parsedId,
			Message = "Dead-letter job requeued",
			Key = ResponseKeys.DeadLetterRequeueSuccess
		});
	}
}
