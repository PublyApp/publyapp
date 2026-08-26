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

public class FindJobQueueItemsResponse
	: CursorPaginatedResult<JobQueueListItem> { }

public class FindJobQueueItemsQuery : CursorPaginatedQuery {
	[FromQuery(Name = "tenant_id")] public string? TenantId { get; set; }
	[FromQuery(Name = "status")] public string? Status { get; set; }
	[FromQuery(Name = "job_type")] public string? JobType { get; set; }

	public Guid? GetTenantId() {
		return QueryPredicates.ParseNullableGuid(TenantId);
	}

	// CSV-encoded so the property stays primitive — required for [AsParameters]
	// binding and for the OpenAPI generator to emit the param (a List<string>?
	// property forces a custom BindAsync which strips every query param from the
	// generated Kiota client URI template).
	public IReadOnlyList<string>? GetStatusList() {
		if (string.IsNullOrWhiteSpace(Status)) {
			return null;
		}

		return Status.Split(',', StringSplitOptions.TrimEntries);
	}

	public string? GetJobType() {
		if (string.IsNullOrWhiteSpace(JobType)) {
			return null;
		}

		var trimmed = JobType.Trim();
		return trimmed.Length > 200 ? trimmed[..200] : trimmed;
	}
}

public class FindJobQueueItemsQueryValidator
	: CursorPaginatedQueryValidator<FindJobQueueItemsQuery> {
	public FindJobQueueItemsQueryValidator() {
		RuleFor(x => x.TenantId)
			.Must(QueryPredicates.BeValidNullableGuid)
			.WithMessage("tenant_id must be a valid GUID");

		RuleFor(x => x.Status)
			.Custom((raw, context) => {
				if (string.IsNullOrWhiteSpace(raw)) {
					return;
				}

				foreach (var token in raw.Split(
					',', StringSplitOptions.TrimEntries
				)) {
					if (!JobQueueStatusCsv.IsKnown(token)) {
						context.AddFailure(
							"status",
							$"'{token}' is not a valid queue status. "
							+ $"Allowed values: {JobQueueStatusCsv.AllowedNames}"
						);
						return;
					}
				}
			});
	}
}

internal static class JobQueueStatusCsv {
	public const string AllowedNames = "pending, processing";

	// Case-insensitive by comparer (PUBLY0003: never ToLower() for dispatch).
	private static readonly Dictionary<string, bool> KnownStatuses =
		new(StringComparer.OrdinalIgnoreCase) {
			[nameof(JobQueueStatus.Pending)] = true,
			[nameof(JobQueueStatus.Processing)] = true,
		};

	public static bool IsKnown(string raw) {
		return KnownStatuses.ContainsKey(raw);
	}
}

public sealed class FindJobQueueItemsForStaff {
	public static async Task<Results<
		Ok<FindJobQueueItemsResponse>,
		AppBadRequestHttpResult
	>> Handle(
		[AsParameters] FindJobQueueItemsQuery query,
		[FromServices] IJobQueueQueryService jobQueueQueryService,
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

		var serviceResult = await jobQueueQueryService.FindAsync(
			new FindJobQueueItemsArgs(
				Cursor: cursorGuid,
				Limit: query.GetLimit(),
				TenantId: query.GetTenantId(),
				StatusCsv: query.Status,
				JobType: query.GetJobType()
			),
			cancellationToken
		);

		if (serviceResult is FindJobQueueItemsResult.InvalidStatusCsv invalid) {
			return TypedProblems.BadRequest(
				$"Invalid status CSV: '{invalid.StatusCsv}'. "
				+ $"Allowed values: {JobQueueStatusCsv.AllowedNames}",
				ResponseKeys.BadRequest
			);
		}

		var success =
			(FindJobQueueItemsResult.Success)serviceResult;
		return TypedResults.Ok(new FindJobQueueItemsResponse {
			Data = success.Data.Data,
			NextCursor = success.Data.NextCursor,
		});
	}
}
