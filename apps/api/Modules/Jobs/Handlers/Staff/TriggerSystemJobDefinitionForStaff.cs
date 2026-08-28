using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.AuditLogs.Services;
using PublyApp.Api.Modules.Jobs.Services;

namespace PublyApp.Api.Modules.Jobs.Handlers.Staff;

public record SystemJobTriggeredResponse {
	public required Guid JobId { get; init; }
	public required DateTime ScheduledFireAt { get; init; }
	public required Guid ScheduleEpoch { get; init; }

	// Transparent-outcome rule (#1350 item 2): plain-words result + stable key.
	public string Message { get; init; } = string.Empty;
	public string Key { get; init; } = string.Empty;
}

/// <summary>
/// A5 (#636): POST /staff/jobs/system-jobs/{id}/trigger. The disabled-key case is
/// a deliberate 200 NoOp carrying key system-job-trigger-noop (verdict-r1 MEDIUM
/// fix #2: the row exists, it just refused — that is not a 404). Unknown or
/// malformed ids are the only 404s.
/// </summary>
public sealed class TriggerSystemJobDefinitionForStaff {
	public static async Task<Results<
		Ok<SystemJobTriggeredResponse>,
		AppNotFoundHttpResult
	>> Handle(
		string? systemJobId,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] ISystemJobDefinitionQueryService systemJobDefinitionQueryService,
		[FromServices] IAuditLogService auditLogService,
		CancellationToken cancellationToken = default
	) {
		// No route constraints on ID parameters (repo rule): bind as string, parse
		// here. Unknown OR malformed id → 404.
		if (!Guid.TryParse(systemJobId, out var parsedId) || parsedId == Guid.Empty) {
			return TypedProblems.NotFound(
				"systemJobId must be a valid system job definition identifier",
				ResponseKeys.SystemJobDefinitionNotFound,
				title: "Invalid system job definition id"
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

		var result = await systemJobDefinitionQueryService.TriggerNowAsync(
			new TriggerSystemJobArgs(parsedId),
			cancellationToken
		);

		if (result is TriggerSystemJobResult.NotFound) {
			return TypedProblems.NotFound(
				$"No system job definition exists with id {systemJobId}",
				ResponseKeys.SystemJobDefinitionNotFound
			);
		}

		if (result is TriggerSystemJobResult.NoOp) {
			// Deliberate 200: the trigger was refused because the key is
			// disabled, not because the row is missing. No enqueue, no audit.
			return TypedResults.Ok(new SystemJobTriggeredResponse {
				JobId = Guid.Empty,
				ScheduledFireAt = DateTime.MinValue,
				ScheduleEpoch = Guid.Empty,
				Message = "System job is disabled and was not enqueued",
				Key = ResponseKeys.SystemJobTriggerNoop
			});
		}

		var enqueued = (TriggerSystemJobResult.Enqueued)result;

		await auditLogService.LogAsync(
			new CreateAuditLogArgs(
				UserId: account.UserId,
				Action: AuditActions.JobSystemJobTriggered,
				TargetId: parsedId,
				Details: new {
					NewJobId = enqueued.JobId,
					ScheduledFireAt = enqueued.ScheduledFireAt,
					ScheduleEpoch = enqueued.ScheduleEpoch
				}
			),
			cancellationToken
		);

		return TypedResults.Ok(new SystemJobTriggeredResponse {
			JobId = enqueued.JobId,
			ScheduledFireAt = enqueued.ScheduledFireAt,
			ScheduleEpoch = enqueued.ScheduleEpoch,
			Message = "System job enqueued",
			Key = ResponseKeys.SystemJobTriggerSuccess
		});
	}
}
