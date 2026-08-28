using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Jobs.Services;

namespace PublyApp.Api.Modules.Jobs.Handlers.Staff;

public sealed class GetJobQueueItemForStaff {
	public static async Task<Results<
		Ok<JobQueueItemDetail>,
		AppNotFoundHttpResult
	>> Handle(
		string? queueItemId,
		[FromServices] IJobQueueQueryService jobQueueQueryService,
		CancellationToken cancellationToken = default
	) {
		// No route constraints on ID parameters (repo rule): bind as string, parse
		// here. Unknown OR malformed id → 404.
		if (!Guid.TryParse(queueItemId, out var parsedId) || parsedId == Guid.Empty) {
			return TypedProblems.NotFound(
				"queueItemId must be a valid job queue item identifier",
				ResponseKeys.JobQueueItemNotFound,
				title: "Invalid job queue item id"
			);
		}

		var detail = await jobQueueQueryService.GetByIdAsync(
			parsedId, cancellationToken
		);

		if (detail is null) {
			return TypedProblems.NotFound(
				$"No job queue item exists with id {queueItemId}",
				ResponseKeys.JobQueueItemNotFound
			);
		}

		return TypedResults.Ok(detail);
	}
}
