using MainApi.Src.Modules.SystemNotices.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.SystemNotices.Handlers.Anonymous;

public static class GetActiveSystemNotices {
	public static async Task<Ok<List<ActiveSystemNotice>>> HandleGetActiveSystemNotices(
		[FromServices] ISystemNoticeService systemNoticeService,
		CancellationToken cancellationToken = default
	) {
		var notices = await systemNoticeService.GetActiveAsync(cancellationToken);
		return TypedResults.Ok(notices);
	}
}
