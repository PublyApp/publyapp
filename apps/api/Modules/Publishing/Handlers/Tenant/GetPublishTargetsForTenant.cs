using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Publishing.Services;

namespace PublyApp.Api.Modules.Publishing.Handlers.Tenant;

public class GetPublishTargetsForTenantResponse {
	public required IReadOnlyList<PublishTargetItem> Items { get; init; }
}

/// <summary>
/// Composer target lookup (D2 Task 4): GET /publishing/publish-targets.
/// Orchestrates <see cref="IPublishTargetService"/> only — no DbContext here.
/// </summary>
public sealed class GetPublishTargetsForTenant {
	public static async Task<Results<
		Ok<GetPublishTargetsForTenantResponse>,
		AppBadRequestHttpResult
	>> Handle(
		[FromQuery(Name = "project_id")] string? projectId,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] IPublishTargetService publishTargetService,
		CancellationToken cancellationToken = default
	) {
		if (!Guid.TryParse(authContext.TenantId, out var tenantId)) {
			throw new InvalidOperationException(
				$"{nameof(authContext.TenantId)} is not a GUID"
			);
		}

		Guid? projectIdFilter = null;
		if (!string.IsNullOrEmpty(projectId)) {
			if (!Guid.TryParse(projectId, out var parsedProjectId)) {
				return TypedProblems.BadRequest(
					"Invalid project_id",
					ResponseKeys.MalformedId
				);
			}
			projectIdFilter = parsedProjectId;
		}

		var items = await publishTargetService.FindForTenantAsync(
			tenantId,
			projectIdFilter,
			cancellationToken
		);

		return TypedResults.Ok(new GetPublishTargetsForTenantResponse {
			Items = items,
		});
	}
}
