using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Jobs.Services;

namespace PublyApp.Api.Modules.Jobs.Handlers.Staff;

public sealed class GetDeadLetterForStaff {
	public static async Task<Results<
		Ok<GetDeadLetterResponse>,
		AppNotFoundHttpResult
	>> Handle(
		string? deadLetterId,
		[FromServices] IDeadLetterQueryService deadLetterQueryService,
		CancellationToken cancellationToken = default
	) {
		// No route constraints on ID parameters (repo rule): bind as string, parse
		// here. Unknown OR malformed id → 404.
		if (!Guid.TryParse(deadLetterId, out var parsedId) || parsedId == Guid.Empty) {
			return TypedProblems.NotFound(
				"deadLetterId must be a valid dead-letter identifier",
				ResponseKeys.DeadLetterNotFound,
				title: "Invalid dead-letter id"
			);
		}

		var detail = await deadLetterQueryService.GetByIdAsync(
			parsedId, cancellationToken
		);

		if (detail is null) {
			return TypedProblems.NotFound(
				$"No dead-letter entry exists with id {deadLetterId}",
				ResponseKeys.DeadLetterNotFound
			);
		}

		// Fail-closed staff payload exposure (#636 brief fix #6): only the real
		// seeded payload-free system keys pass through untouched; every other
		// job_type — email/social/messaging families and anything unknown — is
		// fully redacted here, at the wire boundary.
		return TypedResults.Ok(new GetDeadLetterResponse {
			Detail = detail with {
				Payload = PayloadRedaction.Redact(detail.JobType, detail.Payload),
			},
		});
	}
}

/// <summary>
/// Wire wrapper so the detail stays a single camelCase object under "detail"
/// while keeping the service record free of wire concerns.
/// </summary>
public record GetDeadLetterResponse {
	public required DeadLetterDetail Detail { get; init; }
}
