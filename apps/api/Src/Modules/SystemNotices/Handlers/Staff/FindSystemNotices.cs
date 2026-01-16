using FluentValidation;

using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Modules.SystemNotices.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.SystemNotices.Handlers.Staff;

public record FindSystemNoticesQuery {
	public int? Page { get; init; }
	public int? PageSize { get; init; }
}

public record FindSystemNoticesResponse {
	public required List<SystemNoticeListItem> Items { get; init; }
	public required int TotalCount { get; init; }
	public required int Page { get; init; }
	public required int PageSize { get; init; }
	public required int TotalPages { get; init; }
}

public class FindSystemNoticesQueryValidator : AbstractValidator<FindSystemNoticesQuery> {
	public FindSystemNoticesQueryValidator() {
		RuleFor(x => x.Page)
			.GreaterThanOrEqualTo(1)
			.When(x => x.Page.HasValue)
			.WithMessage("Page must be at least 1");

		RuleFor(x => x.PageSize)
			.InclusiveBetween(1, 100)
			.When(x => x.PageSize.HasValue)
			.WithMessage("PageSize must be between 1 and 100");
	}
}

public static class FindSystemNotices {
	public static async Task<Results<
		Ok<FindSystemNoticesResponse>,
		AppForbiddenHttpResult
	>> HandleFindSystemNotices(
		[FromServices] ISystemNoticeService systemNoticeService,
		[AsParameters] FindSystemNoticesQuery query,
		CancellationToken cancellationToken = default
	) {
		var page = query.Page ?? 1;
		var pageSize = query.PageSize ?? 20;

		var (items, totalCount) = await systemNoticeService.FindAsync(
			page,
			pageSize,
			cancellationToken
		);

		var totalPages = (int)Math.Ceiling((double)totalCount / pageSize);

		return TypedResults.Ok(new FindSystemNoticesResponse {
			Items = items,
			TotalCount = totalCount,
			Page = page,
			PageSize = pageSize,
			TotalPages = totalPages
		});
	}
}
