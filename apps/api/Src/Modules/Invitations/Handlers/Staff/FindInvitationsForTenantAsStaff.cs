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

	public IReadOnlySet<InvitationStatus>? GetStatusesOrNull() {
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

		var statuses = new HashSet<InvitationStatus>();
		foreach (var part in parts) {
			var parsed = Invitation.ParseStatus(part);
			if (parsed is { } status) {
				statuses.Add(status);
			}
		}
		return statuses.Count > 0 ? statuses : null;
	}
}

public class FindInvitationsForTenantAsStaffQueryValidator : CursorPaginatedQueryValidator<FindInvitationsForTenantAsStaffQuery> {
	private static readonly HashSet<string> AllowedStatuses =
		new([nameof(InvitationStatus.Pending), nameof(InvitationStatus.Accepted), nameof(InvitationStatus.Expired), nameof(InvitationStatus.Revoked)], StringComparer.OrdinalIgnoreCase);

	public FindInvitationsForTenantAsStaffQueryValidator() {
		RuleFor(x => x.Search).MaximumLength(200);
		RuleFor(x => x.Status)
			.Must(raw => {
				if (string.IsNullOrEmpty(raw)) {
					return true;
				}

				var parts = raw
					.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
				return parts.All(AllowedStatuses.Contains);
			})
			.WithMessage("Invalid status value. Must be comma-separated: " + string.Join(",", AllowedStatuses));
	}
}

public class FindInvitationsForTenantAsStaff {
	public static async Task<Results<Ok<FindInvitationsForTenantAsStaffResult>, AppBadRequestHttpResult>> HandleFindInvitationsForTenantAsStaff(
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
				$"Invalid sortId: {sortIdError.SortId}. Allowed values: created_at, expires_at, email, accepted_at",
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
