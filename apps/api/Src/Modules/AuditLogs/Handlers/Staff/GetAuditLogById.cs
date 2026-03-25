using MainApi.Localization;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Modules.AuditLogs.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.AuditLogs.Handlers.Staff;

public class GetAuditLogById {
	public static async Task<Results<
		Ok<AuditLogDetail>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult
	>> HandleGetAuditLogById(
		[FromServices]
		IAuditLogQueryService auditLogQueryService,
		[FromRoute] string logId,
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
