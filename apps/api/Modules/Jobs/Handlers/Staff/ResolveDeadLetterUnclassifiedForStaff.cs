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
using PublyApp.Api.Modules.Jobs.Entities;
using PublyApp.Api.Modules.Jobs.Services;

namespace PublyApp.Api.Modules.Jobs.Handlers.Staff;

public record ResolveDeadLetterUnclassifiedForStaffBody {
	public JsonElement? Note { get; init; }

	public string? GetNote() {
		return Note.GetValueAsStringOrNull();
	}
}

public record DeadLetterResolvedResponse {
	public required Guid Id { get; init; }
	public required int ExternalStateStatus { get; init; }
}

public class ResolveDeadLetterUnclassifiedForStaffBodyValidator
	: AbstractValidator<ResolveDeadLetterUnclassifiedForStaffBody> {
	public ResolveDeadLetterUnclassifiedForStaffBodyValidator() {
		RuleFor(x => x.Note)
			.MustBeNullableStringWithMaxLength("Note", 500, trim: true);
	}
}

/// <summary>
/// K-1 (#863): the resolution path for a dead-letter row stuck at status 6
/// Unclassified. An operator confirms the externally-referenced resource is
/// absent, the row stamps 4 Missing (retention-eligible again), one evidence
/// event is appended, and an audit-log entry records who resolved what.
///
/// Fail-closed contract:
/// - unknown or malformed id → 404 (no route constraints; Guid.TryParse here)
/// - current external_state_status ≠ 6 → 409 naming the actual state
/// - success requires <see cref="AppPermissions.Staff"/> Jobs.RESOLVE.
/// </summary>
public sealed class ResolveDeadLetterUnclassifiedForStaff {
	public static async Task<Results<
		Ok<DeadLetterResolvedResponse>,
		AppNotFoundHttpResult,
		AppConflictHttpResult
	>> Handle(
		string? deadLetterId,
		[FromBody] ResolveDeadLetterUnclassifiedForStaffBody body,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] IJobDeadLetterService jobDeadLetterService,
		[FromServices] IAuditLogService auditLogService,
		CancellationToken cancellationToken = default
	) {
		// No route constraints on ID parameters (repo rule): bind as string, parse
		// here. Design (#863 §fail-closed): unknown OR malformed id → 404.
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

		var result = await jobDeadLetterService.ResolveUnclassifiedAsync(
			new ResolveDeadLetterUnclassifiedArgs(
				DeadLetterId: parsedId,
				OperatorStaffId: account.UserId,
				Note: note
			),
			cancellationToken
		);

		if (result is ResolveDeadLetterUnclassifiedResult.NotFound) {
			return TypedProblems.NotFound(
				$"No dead-letter entry exists with id {deadLetterId}",
				ResponseKeys.DeadLetterNotFound
			);
		}

		if (result is ResolveDeadLetterUnclassifiedResult.NotUnclassified notUnclassified) {
			return TypedProblems.Conflict(
				"Dead-letter entry is not awaiting unclassified triage: its "
				+ $"external state is '{notUnclassified.CurrentStatus}' "
				+ $"({(int)notUnclassified.CurrentStatus}).",
				ResponseKeys.DeadLetterNotUnclassified
			);
		}

		var resolved = (ResolveDeadLetterUnclassifiedResult.Resolved)result;

		await auditLogService.LogAsync(
			new CreateAuditLogArgs(
				UserId: account.UserId,
				Action: AuditActions.JobDeadLetterTriageResolved,
				TargetId: parsedId,
				Details: new {
					PriorExternalStateStatus = (int)ExternalStateStatus.Unclassified,
					NewExternalStateStatus = (int)ExternalStateStatus.Missing,
					EventId = resolved.EventId,
					Note = note
				}
			),
			cancellationToken
		);

		return TypedResults.Ok(new DeadLetterResolvedResponse {
			Id = parsedId,
			// Wire value mirrors the entity's stored int (4 Missing).
			ExternalStateStatus = (int)ExternalStateStatus.Missing
		});
	}
}
