using MainApi.Localization;
using MainApi.Lib;
using MainApi.Lib.ProblemResults;
using MainApi.Modules.AuditLogs.Entities;
using MainApi.Modules.AuditLogs.Services;
using MainApi.Modules.SystemNotices.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Modules.SystemNotices.Handlers.Staff;

public class DeleteSystemNotice {
	public static async Task<Results<
		Ok<ApiResponse>,
		AppNotFoundHttpResult,
		AppBadRequestHttpResult
	>> HandleDeleteSystemNotice(
		[FromServices] IRequestAuthContext authContext,
		[FromServices] ISystemNoticeService systemNoticeService,
		[FromServices] IAuditLogService auditLogService,
		[FromRoute] string noticeId,
		CancellationToken cancellationToken = default
	) {
		var account = authContext.AccountStaff;
		if (account is null) {
			throw new InvalidOperationException(
				"Staff account not found in auth "
				+ "context. Ensure the endpoint has "
				+ ".WithPermission() middleware."
			);
		}

		if (!Guid.TryParse(noticeId, out var noticeIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid noticeId",
				ResponseKeys.MalformedId
			);
		}

		var deleted = await systemNoticeService.DeleteAsync(
			noticeIdGuid, cancellationToken
		);

		if (!deleted) {
			return TypedProblems.NotFound(
				"System notice not found",
				ResponseKeys.SystemNoticeNotFound
			);
		}

		await auditLogService.LogAsync(
			new CreateAuditLogArgs(
				UserId: account.UserId,
				Action: AuditActions.SystemNoticeDeleted,
				TargetId: noticeIdGuid
			),
			cancellationToken
		);

		return TypedResults.Ok(
			ApiResponse.Create(
				"System notice deleted successfully",
				ResponseKeys
					.SystemNoticeDeletedSuccessfully
			)
		);
	}
}
