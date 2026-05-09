using FluentValidation;

using MainApi.Localization;
using MainApi.Src.Lib;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Lib.Validation;
using MainApi.Src.Modules.Invitations.Entities;
using MainApi.Src.Modules.Invitations.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.Invitations.Handlers.Staff;

public class FindStaffInvitationsResult : CursorPaginatedResult<InvitationListItem> { }

public class FindStaffInvitationsQuery : CursorPaginatedQuery {
	[FromQuery(Name = "status")] public string? Status { get; set; }

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

public class FindStaffInvitationsQueryValidator : CursorPaginatedQueryValidator<FindStaffInvitationsQuery> {
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

	public FindStaffInvitationsQueryValidator() {
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

public class FindStaffInvitations {
	public static async Task<Results<Ok<FindStaffInvitationsResult>, AppBadRequestHttpResult>> HandleFindStaffInvitations(
		[AsParameters] FindStaffInvitationsQuery findStaffInvitationsQuery,
		[FromServices] IInvitationService invitationService,
		CancellationToken cancellationToken = default
	) {
		var cursor = findStaffInvitationsQuery.GetCursor();
		var cursorGuid = Guid.Empty;

		// Cursor must be a Guid; empty means first page.
		if (!string.IsNullOrEmpty(cursor)) {
			if (!Guid.TryParse(cursor, out cursorGuid)) {
				return TypedProblems.BadRequest("Invalid cursor", ResponseKeys.BadRequest);
			}
		}

		var limit = findStaffInvitationsQuery.GetLimit();
		var sortId = findStaffInvitationsQuery.GetSortId();
		var sortOrder = findStaffInvitationsQuery.GetSortOrder();
		var statuses = findStaffInvitationsQuery.GetStatusesOrNull();
		var args = new FindStaffInvitationsArgs {
			Cursor = cursorGuid,
			Limit = limit,
			SortId = sortId,
			SortOrder = sortOrder,
			Statuses = statuses,
		};

		var serviceResult = await invitationService.FindStaffInvitationsAsync(
			args,
			cancellationToken
		);

		if (serviceResult is Services.FindStaffInvitationsResult.CursorNotFound cursorError) {
			return TypedProblems.BadRequest(
				$"Cursor record not found: {cursorError.Cursor}. The record may have been deleted or the cursor is invalid.",
				ResponseKeys.BadRequest
			);
		}

		if (serviceResult is Services.FindStaffInvitationsResult.InvalidSortId sortIdError) {
			// Surface invalid sortId explicitly instead of silently falling back.
			return TypedProblems.BadRequest(
				$"Invalid sort_id: {sortIdError.SortId}. Allowed values: created_at, expires_at, email, accepted_at",
				ResponseKeys.BadRequest
			);
		}

		if (serviceResult is Services.FindStaffInvitationsResult.Success success) {
			return TypedResults.Ok(new FindStaffInvitationsResult {
				Data = success.Data.Data,
				NextCursor = success.Data.NextCursor,
			});
		}

		throw new InvalidOperationException("Unhandled result type");
	}
}
