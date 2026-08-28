using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Validation;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Jobs.Services;

namespace PublyApp.Api.Modules.Jobs.Handlers.Staff;

public class FindSystemJobDefinitionsResponse
	: CursorPaginatedResult<SystemJobDefinitionListItem> { }

public class FindSystemJobDefinitionsQuery : CursorPaginatedQuery {
	[FromQuery(Name = "is_enabled")] public string? IsEnabled { get; set; }

	public bool? GetIsEnabled() {
		return QueryPredicates.ParseNullableBoolean(IsEnabled);
	}
}

public class FindSystemJobDefinitionsQueryValidator
	: CursorPaginatedQueryValidator<FindSystemJobDefinitionsQuery> {
	public FindSystemJobDefinitionsQueryValidator() {
		RuleFor(x => x.IsEnabled)
			.Must(QueryPredicates.BeValidNullableBoolean)
			.WithMessage("is_enabled must be a boolean");
	}
}

public sealed class FindSystemJobDefinitionsForStaff {
	public static async Task<Results<
		Ok<FindSystemJobDefinitionsResponse>,
		AppBadRequestHttpResult
	>> Handle(
		[AsParameters] FindSystemJobDefinitionsQuery query,
		[FromServices] ISystemJobDefinitionQueryService systemJobDefinitionQueryService,
		CancellationToken cancellationToken = default
	) {
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

		var serviceResult = await systemJobDefinitionQueryService.FindAsync(
			new FindSystemJobDefinitionsArgs(
				Cursor: cursorGuid,
				Limit: query.GetLimit(),
				IsEnabled: query.GetIsEnabled()
			),
			cancellationToken
		);

		var success =
			(FindSystemJobDefinitionsResult.Success)serviceResult;
		return TypedResults.Ok(new FindSystemJobDefinitionsResponse {
			Data = success.Data.Data,
			NextCursor = success.Data.NextCursor,
		});
	}
}
