using MainApi.Localization;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Modules.SystemNotices.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.SystemNotices.Handlers.Staff;

public record SystemNoticeDetail {
	public required Guid Id { get; init; }
	public required string Severity { get; init; }
	public required string Title { get; init; }
	public required string Message { get; init; }
	public required DateTime StartsAt { get; init; }
	public DateTime? ExpiresAt { get; init; }
	public required bool IsActive { get; init; }
	public required Guid CreatedByStaffId { get; init; }
	public required DateTime CreatedAt { get; init; }
	public required DateTime UpdatedAt { get; init; }
}

public static class GetSystemNoticeById {
	public static async Task<Results<
		Ok<SystemNoticeDetail>,
		AppNotFoundHttpResult,
		AppForbiddenHttpResult
	>> HandleGetSystemNoticeById(
		[FromServices] ISystemNoticeService systemNoticeService,
		[FromRoute] Guid noticeId,
		CancellationToken cancellationToken = default
	) {
		var notice = await systemNoticeService.GetByIdAsync(noticeId, cancellationToken);

		if (notice is null) {
			return TypedProblems.NotFound(
				"System notice not found",
				ResponseKeys.SystemNoticeNotFound
			);
		}

		return TypedResults.Ok(new SystemNoticeDetail {
			Id = notice.Id!.Value,
			Severity = notice.Severity.ToString().ToLowerInvariant(),
			Title = notice.Title,
			Message = notice.Message,
			StartsAt = notice.StartsAt,
			ExpiresAt = notice.ExpiresAt,
			IsActive = notice.IsActive(),
			CreatedByStaffId = notice.CreatedByStaffId,
			CreatedAt = notice.CreatedAt,
			UpdatedAt = notice.UpdatedAt
		});
	}
}
