using FluentValidation;

using MainApi.Lib;
using MainApi.Lib.ProblemResults;
using MainApi.Lib.Validation;
using MainApi.Localization;
using MainApi.Modules.Invitations.Entities;
using MainApi.Modules.Invitations.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Modules.Invitations.Handlers.Staff;

public class FindInvitationsForTenantAsStaffResult : CursorPaginatedResult<InvitationListItem> { }

public class FindInvitationsForTenantAsStaffQuery : CursorPaginatedQuery {
	[FromQuery(Name = "q")]
	public string? Search { get; set; }

	[FromQuery(Name = "status")]
	public string? Status { get; set; }

	public string? GetSearchNormalized() {
		if (Search is null) {
			return null;
		}

		var trimmed = Search.Trim();
		return trimmed.Length == 0 ? null : trimmed;
	}

	public IReadOnlySet<InvitationEffectiveStatus>? GetStatusesOrNull() {
		if (Status is null) {
			return null;
		}

		var trimmed = Status.Trim();
		if (trimmed.Length == 0) {
			return null;
		}

		var parts = trimmed
			.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
		if (parts.Length == 0) {
			return null;
		}

		var statuses = new HashSet<InvitationEffectiveStatus>();
		foreach (var part in parts) {
			var parsed = Invitation.ParseEffectiveStatus(part);
			if (parsed is { } status) {
				statuses.Add(status);
			}
		}
		return statuses.Count > 0 ? statuses : null;
	}
}

public class FindInvitationsForTenantAsStaffQueryValidator : CursorPaginatedQueryValidator<FindInvitationsForTenantAsStaffQuery> {
	// Source of truth: nameof() — rename-safe, no hardcoded strings to maintain.
	private static readonly string[] AllowedStatuses = [
		nameof(InvitationEffectiveStatus.Pending),
		nameof(InvitationEffectiveStatus.Accepted),
		nameof(InvitationEffectiveStatus.Expired),
		nameof(InvitationEffectiveStatus.Revoked),
	];

	private static readonly HashSet<string> AllowedStatusSet =
		new(AllowedStatuses, StringComparer.OrdinalIgnoreCase);

	// Lowercased once at type init so the validation message matches the wire
	// contract (lowercase tokens). Comparison itself stays case-insensitive via
	// OrdinalIgnoreCase — ToLowerInvariant never runs on the request path.
	private static readonly string AllowedStatusesDisplay =
		string.Join(", ", AllowedStatuses.Select(s => s.ToLowerInvariant()).Order());

	public FindInvitationsForTenantAsStaffQueryValidator() {
		RuleFor(x => x.Search).MaximumLength(200);
		RuleFor(x => x.Status)
			.Must(raw => {
				if (string.IsNullOrWhiteSpace(raw)) {
					return true;
				}

				// Split WITHOUT RemoveEmptyEntries so empty tokens are caught
				// (",", ",,", "a,,b") instead of being silently dropped.
				var parts = raw.Split(',', StringSplitOptions.TrimEntries);
				if (parts.Length == 0) {
					return false;
				}
				return parts.All(p => p.Length > 0 && AllowedStatusSet.Contains(p));
			})
			.WithMessage($"Status must be one of: {AllowedStatusesDisplay}");
	}
}

public sealed class FindInvitationsForTenantAsStaff {
	public static async Task<Results<Ok<FindInvitationsForTenantAsStaffResult>, AppBadRequestHttpResult>> Handle(
		string tenantId,
		[AsParameters] FindInvitationsForTenantAsStaffQuery query,
		[FromServices] IInvitationService invitationService,
		CancellationToken cancellationToken = default
	) {
		if (!Guid.TryParse(tenantId, out var tenantGuid)) {
			return TypedProblems.BadRequest("Invalid tenant ID", ResponseKeys.BadRequest);
		}

		var cursor = query.GetCursor();
		var cursorGuid = Guid.Empty;

		if (!string.IsNullOrEmpty(cursor)) {
			if (!Guid.TryParse(cursor, out cursorGuid)) {
				return TypedProblems.BadRequest("Invalid cursor", ResponseKeys.BadRequest);
			}
		}

		var limit = query.GetLimit();
		var sortId = query.GetSortId();
		var sortOrder = query.GetSortOrder();

		var args = new FindTenantInvitationsArgs {
			Cursor = cursorGuid,
			Limit = limit,
			SortId = sortId,
			SortOrder = sortOrder,
			Filters = new FindTenantInvitationsFilters {
				Search = query.GetSearchNormalized(),
				Status = query.GetStatusesOrNull(),
			},
		};

		var serviceResult = await invitationService.FindTenantInvitationsAsync(
			tenantId: tenantGuid,
			args: args,
			cancellationToken: cancellationToken
		);

		if (serviceResult is Services.FindTenantInvitationsResult.CursorNotFound cursorError) {
			return TypedProblems.BadRequest(
				$"Cursor record not found: {cursorError.Cursor}. The record may have been deleted or the cursor is invalid.",
				ResponseKeys.BadRequest
			);
		}

		if (serviceResult is Services.FindTenantInvitationsResult.InvalidSortId sortIdError) {
			return TypedProblems.BadRequest(
				$"Invalid sort_id: {sortIdError.SortId}. Allowed values: created_at, expires_at, email, accepted_at",
				ResponseKeys.BadRequest
			);
		}

		if (serviceResult is Services.FindTenantInvitationsResult.Success success) {
			return TypedResults.Ok(new FindInvitationsForTenantAsStaffResult {
				Data = success.Data.Data,
				NextCursor = success.Data.NextCursor,
			});
		}

		throw new InvalidOperationException("Unhandled result type");
	}
}
