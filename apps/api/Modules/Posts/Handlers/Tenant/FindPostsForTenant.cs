using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Validation;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Posts.Services;
using PublyApp.Api.Modules.Posts.Validation;

namespace PublyApp.Api.Modules.Posts.Handlers.Tenant;

public class FindPostsForTenantResponse
	: CursorPaginatedResult<PostListItem> { }

public class FindPostsForTenantQuery : CursorPaginatedQuery {
	[FromQuery(Name = "q")]
	public string? Search { get; set; }

	public string? GetSearchNormalized() {
		if (Search is null) {
			return null;
		}

		var trimmed = Search.Trim();
		return trimmed.Length == 0 ? null : trimmed;
	}
}

public class FindPostsForTenantQueryValidator
	: CursorPaginatedQueryValidator<FindPostsForTenantQuery> {
	public FindPostsForTenantQueryValidator() {
		RuleFor(x => x.Search)
			.MaximumLength(PostValidationRules.SearchMaxLength)
			.WithMessage(
				$"q must be at most {PostValidationRules.SearchMaxLength} characters"
			);
	}
}

public sealed class FindPostsForTenant {
	public static async Task<Results<
		Ok<FindPostsForTenantResponse>,
		AppBadRequestHttpResult
	>> Handle(
		[AsParameters] FindPostsForTenantQuery query,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] IPostService postService,
		CancellationToken cancellationToken = default
	) {
		if (!Guid.TryParse(authContext.TenantId, out var tenantId)) {
			throw new InvalidOperationException(
				$"{nameof(authContext.TenantId)} is not a GUID"
			);
		}

		var tenantAccount = authContext.AccountTenant;
		if (tenantAccount is null) {
			throw new InvalidOperationException(
				"Tenant account not found in auth context. "
				+ "Ensure the endpoint has "
				+ ".WithTenantPermission(...) middleware."
			);
		}

		var cursor = query.GetCursor();
		var cursorGuid = Guid.Empty;

		if (!string.IsNullOrEmpty(cursor)) {
			if (!Guid.TryParse(cursor, out cursorGuid)) {
				return TypedProblems.BadRequest(
					"Invalid cursor",
					ResponseKeys.BadRequest
				);
			}
		}

		var limit = query.GetLimit();
		var sortId = query.GetSortId();
		var sortOrder = query.GetSortOrder();
		var search = query.GetSearchNormalized();

		var args = new FindPostsArgs(
			Cursor: cursorGuid,
			Limit: limit,
			SortId: sortId,
			SortOrder: sortOrder,
			Search: search
		);

		var serviceResult = await postService.FindForTenantAsync(
			tenantId,
			args,
			cancellationToken
		);

		if (serviceResult is FindPostsResult.CursorNotFound cursorError) {
			return TypedProblems.BadRequest(
				$"Cursor record not found: {cursorError.Cursor}. "
				+ "The record may have been deleted "
				+ "or the cursor is invalid.",
				ResponseKeys.BadRequest
			);
		}

		if (serviceResult is FindPostsResult.InvalidSortId sortIdError) {
			return TypedProblems.BadRequest(
				$"Invalid sort_id: {sortIdError.SortId}. "
				+ "Allowed values: created_at, updated_at",
				ResponseKeys.BadRequest
			);
		}

		if (serviceResult is FindPostsResult.Success success) {
			return TypedResults.Ok(new FindPostsForTenantResponse {
				Data = success.Data.Data,
				NextCursor = success.Data.NextCursor,
			});
		}

		throw new InvalidOperationException(
			"Unhandled result type"
		);
	}
}
