using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Modules.Publishing.Services;

namespace PublyApp.Api.Modules.Publishing.Handlers.Tenant;

public sealed class FindPostPublicationsResponse {
	public required IReadOnlyList<ScheduledPublicationItem> Data { get; init; }
}

/// <summary>
/// A post's own publications (#2208): every live status, no window, so the edit page can
/// reach a row that failed long ago or is scheduled far out. Same row shape as the queue.
/// </summary>
public sealed class FindPostPublicationsForTenant {
	public static async Task<Ok<FindPostPublicationsResponse>> Handle(
		[FromRoute] Guid postId,
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

		return TypedResults.Ok(new FindPostPublicationsResponse {
			Data = await publicationService.FindForPostAsync(tenantId, postId, cancellationToken),
		});
	}
}
