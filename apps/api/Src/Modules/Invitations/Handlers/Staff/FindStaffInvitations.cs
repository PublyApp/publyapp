using FluentValidation;

using MainApi.Localization;
using MainApi.Src.Lib;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Modules.Invitations.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.Invitations.Handlers.Staff;

public class FindStaffInvitationsResult : CursorPaginatedResult<InvitationListItem> { }

public class FindStaffInvitationsQuery : CursorPaginatedQuery {
	[FromQuery] public string? Status { get; set; }

	public string? GetStatus() {
		// Normalize empty/whitespace to null so validation and service logic align.
		if (string.IsNullOrWhiteSpace(Status)) {
			return null;
		}

		return Status;
	}
}

public class FindStaffInvitationsQueryValidator : CursorPaginatedQueryValidator<FindStaffInvitationsQuery> {
	private static readonly string[] AllowedStatuses = ["pending", "accepted", "expired", "revoked"];

	public FindStaffInvitationsQueryValidator() {
		RuleFor(x => x.Status)
			.Must(status => AllowedStatuses.Contains(status, StringComparer.OrdinalIgnoreCase))
			.WithMessage("Status must be one of the following: pending, accepted, expired, revoked")
			.When(x => !string.IsNullOrEmpty(x.Status));
	}
}

public static class FindStaffInvitations {
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
		var status = findStaffInvitationsQuery.GetStatus();

		var serviceResult = await invitationService.FindStaffInvitationsAsync(
			cursor: cursorGuid,
			limit: limit,
			sortId: sortId,
			sortOrder: sortOrder,
			status: status,
			cancellationToken: cancellationToken
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
				$"Invalid sortId: {sortIdError.SortId}. Allowed values: created_at, expires_at, email, accepted_at",
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
