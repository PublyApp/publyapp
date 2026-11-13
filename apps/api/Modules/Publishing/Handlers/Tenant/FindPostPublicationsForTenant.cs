using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Publishing.Services;

namespace PublyApp.Api.Modules.Publishing.Handlers.Tenant;

public sealed class FindPostPublicationsResponse {
	public required IReadOnlyList<ScheduledPublicationItem> Data { get; init; }
}

// A post's own publications (#2208): every live, non-replaced row in every status and no
// window, so the edit page reaches a row that failed long ago or is scheduled far out. Same
// row shape as the queue. 404 for an unknown or foreign post.
public sealed class FindPostPublicationsForTenant {
	public static async Task<Results<
		Ok<FindPostPublicationsResponse>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult
	>> Handle(
		[FromRoute] string postId,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] IPublicationService publicationService,
		CancellationToken cancellationToken = default
	) {
		if (!Guid.TryParse(authContext.TenantId, out var tenantId)) {
			throw new InvalidOperationException(
				$"{nameof(authContext.TenantId)} is not a GUID"
			);
		}

		// Guard: this endpoint must stay behind .WithTenantPermission(...).
		_ = authContext.GetRequiredTenantAccount();

		if (!Guid.TryParse(postId, out var postIdGuid)) {
			return TypedProblems.BadRequest("Invalid postId", ResponseKeys.MalformedId);
		}

		var items = await publicationService.FindForPostAsync(tenantId, postIdGuid, cancellationToken);
		if (items is null) {
			return TypedProblems.NotFound("Post not found", ResponseKeys.NotFound);
		}

		return TypedResults.Ok(new FindPostPublicationsResponse { Data = items });
	}
}
