using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.AuditLogs.Services;
using PublyApp.Api.Modules.SystemNotices.Services;

namespace PublyApp.Api.Modules.SystemNotices.Handlers.Staff;

public sealed class DeleteSystemNotice {
	public static async Task<Results<
		Ok<ApiResponse>,
		AppNotFoundHttpResult,
		AppBadRequestHttpResult
	>> Handle(
		[FromRoute] string noticeId,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] ISystemNoticeService systemNoticeService,
		[FromServices] IAuditLogService auditLogService,
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
