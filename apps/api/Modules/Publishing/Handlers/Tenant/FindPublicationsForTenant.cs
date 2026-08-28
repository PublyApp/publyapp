using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Validation;
using PublyApp.Api.Modules.Publishing.Entities;
using PublyApp.Api.Modules.Publishing.Services;

namespace PublyApp.Api.Modules.Publishing.Handlers.Tenant;

public class FindPublicationsForTenantResponse
	: CursorPaginatedResult<PublicationListItem> { }

public class FindPublicationsQuery : CursorPaginatedQuery {
	[FromQuery(Name = "status")] public string? Status { get; set; }

	public IReadOnlyList<PublicationStatus>? GetStatusList() {
		return PublicationStatusCsv.Parse(Status);
	}
}

public class FindPublicationsQueryValidator
	: CursorPaginatedQueryValidator<FindPublicationsQuery> {
	public FindPublicationsQueryValidator() {
		RuleFor(x => x.Status)
			.Custom((raw, context) => {
				var error = PublicationStatusCsv.GetValidationError(raw);
				if (error is not null) {
					context.AddFailure(error);
				}
			});
	}
}

/// <summary>
/// Maps the `status` CSV wire parameter back to enum values. The token vocabulary
/// is DERIVED from the single formatter <see cref="PublicationWire.FormatStatus"/> —
/// this parser never invents a second status→wire mapping (plan D2 Task 3).
/// </summary>
internal static class PublicationStatusCsv {
	public const string WireName = "status";

	public static IReadOnlyList<PublicationStatus>? Parse(
		string? raw
	) {
		if (string.IsNullOrWhiteSpace(raw)) {
			return null;
		}

		var tokens = raw.Split(
			',',
			StringSplitOptions.TrimEntries
		);
		var statuses = new List<PublicationStatus>(tokens.Length);
		foreach (var token in tokens) {
			if (TryParseToken(token, out var status)) {
				statuses.Add(status);
			}
		}

		return statuses;
	}

	public static string? GetValidationError(
		string? raw
	) {
		if (string.IsNullOrWhiteSpace(raw)) {
			return null;
		}

		var tokens = raw.Split(
			',',
			StringSplitOptions.TrimEntries
		);

		if (tokens.Any(token => token.Length == 0)) {
			return $"status cannot contain empty values.";
		}

		if (tokens.Length > 10) {
			return $"At most 10 statuses can be filtered at once.";
		}

		foreach (var token in tokens) {
			if (!TryParseToken(token, out _)) {
				return $"'{token}' is not a valid publication status.";
			}
		}

		return null;
	}

	private static bool TryParseToken(
		string token,
		out PublicationStatus status
	) {
		switch (token) {
			case var _ when string.Equals(
				token, "scheduled", StringComparison.OrdinalIgnoreCase
			):
				status = PublicationStatus.Scheduled;
				return true;
			case var _ when string.Equals(
				token, "in_progress", StringComparison.OrdinalIgnoreCase
			):
				status = PublicationStatus.InProgress;
				return true;
			case var _ when string.Equals(
				token, "published", StringComparison.OrdinalIgnoreCase
			):
				status = PublicationStatus.Published;
				return true;
			case var _ when string.Equals(
				token, "failed", StringComparison.OrdinalIgnoreCase
			):
				status = PublicationStatus.Failed;
				return true;
			case var _ when string.Equals(
				token, "paused", StringComparison.OrdinalIgnoreCase
			):
				status = PublicationStatus.Paused;
				return true;
			default:
				status = default;
				return false;
		}
	}
}

public sealed class FindPublicationsForTenant {
	public static async Task<
		Ok<FindPublicationsForTenantResponse>
	> Handle(
		[AsParameters] FindPublicationsQuery query,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] IPublicationListService service,
		CancellationToken cancellationToken = default
	) {
		if (!Guid.TryParse(authContext.TenantId, out var tenantId)) {
			throw new InvalidOperationException(
				$"{nameof(authContext.TenantId)} is not a GUID"
			);
		}

		var result = await service.FindForTenantAsync(
			new FindPublicationsArgs(
				TenantId: tenantId,
				Cursor: query.GetCursor(),
				Limit: query.GetLimit(),
				Statuses: query.GetStatusList()
			),
			cancellationToken
		);

		if (result is FindPublicationsResult.CursorNotFound cursorError) {
			throw new InvalidOperationException(
				"Cursor record not found: "
				+ cursorError.Cursor
				+ ". The record may have been deleted or the cursor is invalid."
			);
		}

		if (result is not FindPublicationsResult.Success success) {
			throw new InvalidOperationException(
				"Unexpected publication list result kind"
			);
		}

		return TypedResults.Ok(new FindPublicationsForTenantResponse {
			Data = success.Data.Data,
			NextCursor = success.Data.NextCursor,
		});
	}
}
