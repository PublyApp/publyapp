using MainApi.Localization;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Modules.AuditLogs.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.AuditLogs.Handlers.Staff;

public static class GetAuditLogById {
	public static async Task<Results<
		Ok<AuditLogDetail>,
		AppNotFoundHttpResult
	>> HandleGetAuditLogById(
		[FromServices]
		IAuditLogQueryService auditLogQueryService,
		[FromRoute] Guid logId,
		CancellationToken cancellationToken = default
	) {
		var detail =
			await auditLogQueryService.GetByIdAsync(
				logId, cancellationToken
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
