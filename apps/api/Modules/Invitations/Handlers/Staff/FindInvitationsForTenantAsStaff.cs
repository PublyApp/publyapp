using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Validation;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Invitations.Entities;
using PublyApp.Api.Modules.Invitations.Services;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Modules.Invitations.Handlers.Staff;

public class FindInvitationsForTenantAsStaffResult : CursorPaginatedResult<StaffTenantInvitationListItem> {
}

public class FindInvitationsForTenantAsStaffQuery : CursorPaginatedQuery {
	[FromQuery(Name = "q")]
	public string? Search { get; set; }

	[FromQuery(Name = "status")]
	public string? Status { get; set; }

	[FromQuery(Name = "level")]
	public string? Level { get; set; }

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

	public IReadOnlySet<AccountLevel>? GetLevelsOrNull() {
		if (Level is null) {
			return null;
		}

		var trimmed = Level.Trim();
		if (trimmed.Length == 0) {
			return null;
		}

		var parts = trimmed
			.Split(
				',',
				StringSplitOptions.RemoveEmptyEntries
					| StringSplitOptions.TrimEntries
			);
		if (parts.Length == 0) {
			return null;
		}

		var levels = new HashSet<AccountLevel>();
		foreach (var part in parts) {
			AccountLevel? parsed = UserAccount.ParseLevel(part);
			if (parsed is { } level) {
				levels.Add(level);
			}
		}

		return levels.Count > 0 ? levels : null;
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

	private static readonly string[] AllowedLevels = [
		nameof(AccountLevel.Admin),
		nameof(AccountLevel.User),
	];

	private static readonly HashSet<string> AllowedLevelSet =
		new(AllowedLevels, StringComparer.OrdinalIgnoreCase);

	private static readonly string AllowedLevelsDisplay =
		string.Join(", ", AllowedLevels.Select(s => s.ToLowerInvariant()).Order());

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
		RuleFor(x => x.Level)
			.Must(raw => {
				if (raw is null) {
					return true;
				}

				var parts = raw.Split(',', StringSplitOptions.TrimEntries);
				if (parts.Length == 0) {
					return false;
				}

				return parts.All(
					part =>
						part.Length > 0
						&& AllowedLevelSet.Contains(part)
				);
			})
			.WithMessage($"level must be one of: {AllowedLevelsDisplay}");
	}
}

public sealed class FindInvitationsForTenantAsStaff {
	public static async Task<Results<Ok<FindInvitationsForTenantAsStaffResult>, AppBadRequestHttpResult>> Handle(
		string tenantId,
		[AsParameters] FindInvitationsForTenantAsStaffQuery query,
		[FromServices] IInvitationQueryService invitationQueryService,
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
				Level = query.GetLevelsOrNull(),
			},
		};

		var serviceResult = await invitationQueryService.FindTenantInvitationsAsync(
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
