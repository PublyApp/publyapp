using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Jobs.Services;

namespace PublyApp.Api.Modules.Jobs.Handlers.Staff;

public sealed class GetSystemJobDefinitionForStaff {
	public static async Task<Results<
		Ok<SystemJobDefinitionDetail>,
		AppNotFoundHttpResult
	>> Handle(
		string? systemJobId,
		[FromServices] ISystemJobDefinitionQueryService systemJobDefinitionQueryService,
		CancellationToken cancellationToken = default
	) {
		// No route constraints on ID parameters (repo rule): bind as string, parse
		// here. Unknown OR malformed id → 404.
		if (!Guid.TryParse(systemJobId, out var parsedId) || parsedId == Guid.Empty) {
			return TypedProblems.NotFound(
				"systemJobId must be a valid system job definition identifier",
				ResponseKeys.SystemJobDefinitionNotFound,
				title: "Invalid system job definition id"
			);
		}

		var detail = await systemJobDefinitionQueryService.GetByIdAsync(
			parsedId, cancellationToken
		);

		if (detail is null) {
			return TypedProblems.NotFound(
				$"No system job definition exists with id {systemJobId}",
				ResponseKeys.SystemJobDefinitionNotFound
			);
		}

		return TypedResults.Ok(detail);
	}
}
