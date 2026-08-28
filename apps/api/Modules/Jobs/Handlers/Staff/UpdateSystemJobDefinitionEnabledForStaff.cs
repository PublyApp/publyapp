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

public record UpdateSystemJobDefinitionEnabledForStaffBody {
	// Nullable wrapper so the validator runs before any getter throws;
	// GetValueAsBoolean maps absent/null to false (documented default).
	public JsonElement? IsEnabled { get; init; }

	public bool GetIsEnabled() {
		return IsEnabled.GetValueAsBoolean();
	}
}

public class UpdateSystemJobDefinitionEnabledForStaffBodyValidator
	: AbstractValidator<UpdateSystemJobDefinitionEnabledForStaffBody> {
	public UpdateSystemJobDefinitionEnabledForStaffBodyValidator() {
		RuleFor(x => x.IsEnabled)
			.MustBeNullableBoolean("IsEnabled");
	}
}

public record SystemJobDefinitionUpdatedResponse {
	public required Guid Id { get; init; }

	// Present only on the cron update; null keeps the wire shape shared.
	public string? CronExpression { get; init; }
	public Guid? ScheduleEpoch { get; init; }
	public bool IsEnabled { get; init; }

	// Transparent-outcome rule (#1350 item 2): plain-words result + stable key.
	public string Message { get; init; } = string.Empty;
	public string Key { get; init; } = string.Empty;
}

/// <summary>
/// A5 (#636): PATCH /staff/jobs/system-jobs/{id}/enabled. A disabled flip on a
/// K-3 protected key (privacy-load-bearing retention cadence) returns 409 —
/// the sync would revert the write within a minute, so the refusal is honest
/// and immediate.
/// </summary>
public sealed class UpdateSystemJobDefinitionEnabledForStaff {
	public static async Task<Results<
		Ok<SystemJobDefinitionUpdatedResponse>,
		AppNotFoundHttpResult,
		AppConflictHttpResult
	>> Handle(
		string? systemJobId,
		[FromBody] UpdateSystemJobDefinitionEnabledForStaffBody body,
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

		var isEnabled = body.GetIsEnabled();

		var result = await systemJobDefinitionQueryService.UpdateEnabledAsync(
			new UpdateSystemJobEnabledArgs(parsedId, isEnabled),
			cancellationToken
		);

		if (result is UpdateSystemJobEnabledResult.NotFound) {
			return TypedProblems.NotFound(
				$"No system job definition exists with id {systemJobId}",
				ResponseKeys.SystemJobDefinitionNotFound
			);
		}

		if (result is UpdateSystemJobEnabledResult.ProtectedKey) {
			return TypedProblems.Conflict(
				"This system job cannot be disabled because its retention "
				+ "cadence is a privacy control.",
				ResponseKeys.SystemJobDisableProtected
			);
		}

		var updated = (UpdateSystemJobEnabledResult.Success)result;

		await auditLogService.LogAsync(
			new CreateAuditLogArgs(
				UserId: account.UserId,
				Action: updated.IsEnabled
					? AuditActions.JobSystemJobEnabled
					: AuditActions.JobSystemJobDisabled,
				TargetId: parsedId,
				Details: new { IsEnabled = updated.IsEnabled }
			),
			cancellationToken
		);

		return TypedResults.Ok(new SystemJobDefinitionUpdatedResponse {
			Id = parsedId,
			IsEnabled = updated.IsEnabled,
			Message = "System job definition updated",
			Key = ResponseKeys.SystemJobDefinitionUpdateSuccess
		});
	}
}
