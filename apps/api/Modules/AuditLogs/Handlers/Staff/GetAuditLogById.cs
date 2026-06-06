using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.AuditLogs.Services;

namespace PublyApp.Api.Modules.AuditLogs.Handlers.Staff;

public sealed class GetAuditLogById {
	public static async Task<Results<
		Ok<AuditLogDetail>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult
	>> Handle(
		[FromRoute] string logId,
		[FromServices]
		IAuditLogQueryService auditLogQueryService,
		CancellationToken cancellationToken = default
	) {
		if (!Guid.TryParse(logId, out var logIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid audit log ID",
				ResponseKeys.MalformedId
			);
		}

		var detail =
			await auditLogQueryService.GetByIdAsync(
				logIdGuid, cancellationToken
			);

		if (detail is null) {
			return TypedProblems.NotFound(
				"Audit log not found",
				ResponseKeys.NotFound
			);
		}

		return TypedResults.Ok(detail);
	}
}
