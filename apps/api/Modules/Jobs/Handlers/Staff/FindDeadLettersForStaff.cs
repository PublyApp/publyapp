using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Validation;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Jobs.Entities;
using PublyApp.Api.Modules.Jobs.Services;

namespace PublyApp.Api.Modules.Jobs.Handlers.Staff;

public class FindDeadLettersResponse
	: CursorPaginatedResult<DeadLetterListItem> { }

public class FindDeadLettersQuery : CursorPaginatedQuery {
	[FromQuery(Name = "tenant_id")] public string? TenantId { get; set; }
	[FromQuery(Name = "external_state_status")]
	public string? ExternalStateStatus { get; set; }
	[FromQuery(Name = "job_type")] public string? JobType { get; set; }

	public Guid? GetTenantId() {
		return QueryPredicates.ParseNullableGuid(TenantId);
	}

	public IReadOnlyList<string>? GetExternalStateStatusList() {
		if (string.IsNullOrWhiteSpace(ExternalStateStatus)) {
			return null;
		}

		return ExternalStateStatus.Split(',', StringSplitOptions.TrimEntries);
	}

	public string? GetJobType() {
		if (string.IsNullOrWhiteSpace(JobType)) {
			return null;
		}

		var trimmed = JobType.Trim();
		return trimmed.Length > 200 ? trimmed[..200] : trimmed;
	}
}

public class FindDeadLettersQueryValidator
	: CursorPaginatedQueryValidator<FindDeadLettersQuery> {
	public FindDeadLettersQueryValidator() {
		RuleFor(x => x.TenantId)
			.Must(QueryPredicates.BeValidNullableGuid)
			.WithMessage("tenant_id must be a valid GUID");

		RuleFor(x => x.ExternalStateStatus)
			.Custom((raw, context) => {
				if (string.IsNullOrWhiteSpace(raw)) {
					return;
				}

				foreach (var token in raw.Split(
					',', StringSplitOptions.TrimEntries
				)) {
					if (!int.TryParse(token, out var value)
						|| value < 0
						|| value > (int)ExternalStateStatusCsv.MaxStatus) {
						context.AddFailure(
							"external_state_status",
							$"'{token}' is not a valid external state status "
							+ $"(0..{(int)ExternalStateStatusCsv.MaxStatus})"
						);
						return;
					}
				}
			});
	}
}

internal static class ExternalStateStatusCsv {
	public static ExternalStateStatus MaxStatus {
		get { return ExternalStateStatus.Unclassified; }
	}
}

public sealed class FindDeadLettersForStaff {
	public static async Task<Results<
		Ok<FindDeadLettersResponse>,
		AppBadRequestHttpResult
	>> Handle(
		[AsParameters] FindDeadLettersQuery query,
		[FromServices] IDeadLetterQueryService deadLetterQueryService,
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

		var serviceResult = await deadLetterQueryService.FindAsync(
			new FindDeadLetterItemsArgs(
				Cursor: cursorGuid,
				Limit: query.GetLimit(),
				TenantId: query.GetTenantId(),
				ExternalStateStatusCsv: query.ExternalStateStatus,
				JobType: query.GetJobType()
			),
			cancellationToken
		);

		if (serviceResult is FindDeadLetterItemsResult.InvalidStatusCsv invalid) {
			return TypedProblems.BadRequest(
				$"Invalid external state status CSV: '{invalid.StatusCsv}'",
				ResponseKeys.BadRequest
			);
		}

		var success =
			(FindDeadLetterItemsResult.Success)serviceResult;
		return TypedResults.Ok(new FindDeadLettersResponse {
			Data = success.Data.Data,
			NextCursor = success.Data.NextCursor,
		});
	}
}
