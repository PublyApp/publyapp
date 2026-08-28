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

public record UpdateSystemJobDefinitionCronForStaffBody {
	public JsonElement CronExpression { get; init; }

	public string GetCronExpression() {
		return CronExpression.GetValueAsString();
	}
}

public class UpdateSystemJobDefinitionCronForStaffBodyValidator
	: AbstractValidator<UpdateSystemJobDefinitionCronForStaffBody> {
	public UpdateSystemJobDefinitionCronForStaffBodyValidator() {
		RuleFor(x => x.CronExpression)
			.MustBeRequiredStringWithLength("CronExpression", 1, 100);
	}
}

/// <summary>
/// A5 (#636): PATCH /staff/jobs/system-jobs/{id}/cron. Quartz rejects an invalid
/// expression → 422 with nothing written. Success NEVER rotates schedule_epoch:
/// the service returns the unchanged epoch and SyncSystemJobsJob rotates it on
/// its next reconcile pass (the no-double-rotation contract).
/// </summary>
public sealed class UpdateSystemJobDefinitionCronForStaff {
	public static async Task<Results<
		Ok<SystemJobDefinitionUpdatedResponse>,
		AppNotFoundHttpResult,
		AppValidationProblemHttpResult
	>> Handle(
		string? systemJobId,
		[FromBody] UpdateSystemJobDefinitionCronForStaffBody body,
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

		var newCron = body.GetCronExpression();

		var result = await systemJobDefinitionQueryService.UpdateCronAsync(
			new UpdateSystemJobCronArgs(parsedId, newCron),
			cancellationToken
		);

		if (result is UpdateSystemJobCronResult.NotFound) {
			return TypedProblems.NotFound(
				$"No system job definition exists with id {systemJobId}",
				ResponseKeys.SystemJobDefinitionNotFound
			);
		}

		if (result is UpdateSystemJobCronResult.InvalidCron) {
			return TypedProblems.ValidationProblem(
				"The cron expression could not be parsed by the scheduler.",
				ResponseKeys.SystemJobCronInvalid,
				new Dictionary<string, string[]> {
					["cron_expression"] = [
						"The cron expression is not a valid Quartz cron expression."
					],
				}
			);
		}

		var updated = (UpdateSystemJobCronResult.Success)result;

		await auditLogService.LogAsync(
			new CreateAuditLogArgs(
				UserId: account.UserId,
				Action: AuditActions.JobSystemJobCronUpdated,
				TargetId: parsedId,
				Details: new {
					PreviousScope = "system_job_definitions",
					CronExpression = updated.CronExpression,
					ScheduleEpoch = updated.ScheduleEpoch
				}
			),
			cancellationToken
		);

		return TypedResults.Ok(new SystemJobDefinitionUpdatedResponse {
			Id = parsedId,
			CronExpression = updated.CronExpression,
			ScheduleEpoch = updated.ScheduleEpoch,
			Message = "System job definition updated",
			Key = ResponseKeys.SystemJobDefinitionUpdateSuccess
		});
	}
}
