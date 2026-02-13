using MainApi.Localization;
using MainApi.Src.Lib;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Modules.AuditLogs.Entities;
using MainApi.Src.Modules.AuditLogs.Services;
using MainApi.Src.Modules.SystemNotices.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.SystemNotices.Handlers.Staff;

public static class DeleteSystemNotice {
	public static async Task<Results<
		NoContent,
		AppNotFoundHttpResult
	>> HandleDeleteSystemNotice(
		[FromServices] IRequestAuthContext authContext,
		[FromServices] ISystemNoticeService systemNoticeService,
		[FromServices] IAuditLogService auditLogService,
		[FromRoute] Guid noticeId,
		CancellationToken cancellationToken = default
	) {
		var account = authContext.AccountStaff
			?? throw new InvalidOperationException(
				"Staff account not found in auth context. "
				+ "Ensure the endpoint has "
				+ ".WithPermission() middleware."
			);

		var deleted = await systemNoticeService.DeleteAsync(
			noticeId, cancellationToken
		);

		if (!deleted) {
			return TypedProblems.NotFound(
				"System notice not found",
				ResponseKeys.SystemNoticeNotFound
			);
		}

		await auditLogService.LogAsync(
			account.UserId,
			AuditActions.SystemNoticeDeleted,
			noticeId,
			null,
			cancellationToken
		);

		return TypedResults.NoContent();
	}
}
