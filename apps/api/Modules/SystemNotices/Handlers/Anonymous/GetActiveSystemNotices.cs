using MainApi.Modules.SystemNotices.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Modules.SystemNotices.Handlers.Anonymous;

public sealed class GetActiveSystemNotices {
	public static async Task<Ok<List<ActiveSystemNotice>>> Handle(
		[FromServices] ISystemNoticeService systemNoticeService,
		CancellationToken cancellationToken = default
	) {
		var notices = await systemNoticeService.GetActiveAsync(cancellationToken);
		return TypedResults.Ok(notices);
	}
}
