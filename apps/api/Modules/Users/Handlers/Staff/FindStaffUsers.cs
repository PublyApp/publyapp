using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Validation;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Roles.Services;
using PublyApp.Api.Modules.Users.Entities;
using PublyApp.Api.Modules.Users.Services;

namespace PublyApp.Api.Modules.Users.Handlers.Staff;

public class StaffUserItem {
	public Guid Id { get; set; }
	public string Email { get; set; } = string.Empty;
	public string? LastName { get; set; }
	public string? FirstName { get; set; }
	public string? AvatarUrl { get; set; }
	public UserStatus Status { get; set; }
	// Full access is carried by a protected system role (never a level).
	public bool IsFullAccess { get; set; }

	// Assigned role names, loaded in one batched query per page (no N+1).
	public List<string> Roles { get; set; } = [];

	// Still-valid sessions of this member.
	public int OpenSessions { get; set; }

	// Most recent sign-in; null when the member never signed in.
	public DateTime? LastSignInAt { get; set; }

	// Who invited this member (accepted invitation); null when not invited.
	public string? InvitedByName { get; set; }
}


public class StaffUserListCounts {
	public int Total { get; set; }
	public int Active { get; set; }
	public int Suspended { get; set; }
	public int FullAccess { get; set; }
	public int ConnectedToday { get; set; }
	public int OpenSessions { get; set; }

	// Members per role over the whole filtered collection (not the page).
	public List<StaffRoleCountItem> RoleCounts { get; set; } = [];
}

public class FindStaffUsersResponse : CursorPaginatedResult<StaffUserItem> {
	public int TotalCount { get; set; }
	public StaffUserListCounts Counts { get; set; } = new();
}

public class FindStaffUsersQuery : CursorPaginatedQuery {
	[FromQuery(Name = "q")]
	public string? Search { get; set; }

	[FromQuery(Name = "status")]
	public string? Status { get; set; }

	public string? GetSearchNormalized() {
		if (this.Search is null) {
			return null;
		}

		var trimmed = this.Search.Trim();
		return trimmed.Length == 0 ? null : trimmed;
	}

	public IReadOnlySet<UserStatus>? GetStatusesOrNull() {
		if (this.Status is null) {
			return null;
		}

		var trimmed = this.Status.Trim();
		if (trimmed.Length == 0) {
			return null;
		}

		var parts = trimmed.Split(',', StringSplitOptions.TrimEntries);
		if (parts.Length == 0) {
			return null;
		}

		var statuses = new HashSet<UserStatus>();
		foreach (var part in parts) {
			UserStatus? parsed = User.ParseStatus(part);
			if (parsed is { } status) {
				statuses.Add(status);
			}
		}

		return statuses.Count > 0 ? statuses : null;
	}
}

public class FindStaffUsersQueryValidator
	: CursorPaginatedQueryValidator<FindStaffUsersQuery> {
	private static readonly HashSet<string> _AllowedStatuses =
		new(["active", "suspended"]);

	public FindStaffUsersQueryValidator() {
		this.RuleFor(x => x.Search).MaximumLength(200);
		this.RuleFor(x => x.Status)
			.Must(raw => {
				if (string.IsNullOrEmpty(raw)) {
					return true;
				}

				// Split WITHOUT RemoveEmptyEntries so empty tokens are rejected
				// (",", ",,", "active,,suspended") instead of silently dropped,
				// matching FindTenantsAsStaffQueryValidator.
				var parts = raw.Split(',', StringSplitOptions.TrimEntries);
				return parts.All(part =>
					part.Length > 0
					&& FindStaffUsersQueryValidator._AllowedStatuses.Contains(part)
				);
			})
			.WithMessage(
				"Invalid status value. Must be comma-separated: "
				+ string.Join(",", FindStaffUsersQueryValidator._AllowedStatuses)
			);
	}
}

public sealed class FindStaffUsers {
	public static async Task<
		Results<
			Ok<FindStaffUsersResponse>,
			AppBadRequestHttpResult
		>
	> Handle(
		[AsParameters] FindStaffUsersQuery findStaffUsersQuery,
		[FromServices] IStaffUserQueryService userService,
		CancellationToken cancellationToken
	) {
		var cursor = findStaffUsersQuery.GetCursor();
		var cursorGuid = Guid.Empty;

		if (!string.IsNullOrEmpty(cursor)) {
			if (!Guid.TryParse(cursor, out cursorGuid)) {
				return TypedProblems.BadRequest(
					"Invalid cursor",
					ResponseKeys.BadRequest
				);
			}
		}

		var limit = findStaffUsersQuery.GetLimit();
		var sortId = findStaffUsersQuery.GetSortId();
		var sortOrder = findStaffUsersQuery.GetSortOrder();
		var search = findStaffUsersQuery.GetSearchNormalized();

		var serviceResult = await userService.FindStaffUsersAsync(
			new FindStaffUsersArgs(
				Cursor: cursorGuid,
				Limit: limit,
				SortId: sortId,
				SortOrder: sortOrder,
				Filters: new FindStaffUsersFilters(
					Search: search,
					Status: findStaffUsersQuery.GetStatusesOrNull()
				)
			),
			cancellationToken
		);

		if (serviceResult is FindStaffUsersResult.InvalidSortId sortIdError) {
			return TypedProblems.BadRequest(
				$"Invalid sort_id: {sortIdError.SortId}.",
				ResponseKeys.BadRequest
			);
		}

		if (serviceResult is FindStaffUsersResult.CursorNotFound cursorError) {
			return TypedProblems.BadRequest(
				$"Cursor record not found: {cursorError.Cursor}.",
				ResponseKeys.BadRequest
			);
		}

		if (serviceResult is FindStaffUsersResult.Success success) {
			return TypedResults.Ok(
				new FindStaffUsersResponse {
					Data = success.Data.Data
						.Select(staffUser => new StaffUserItem {
							Id = staffUser.User.GetRequiredId(),
							Email = staffUser.User.Email,
							LastName = staffUser.User.LastName,
							FirstName = staffUser.User.FirstName,
							AvatarUrl = staffUser.User.AvatarUrl,
							Status = staffUser.User.Status,
							IsFullAccess = staffUser.IsFullAccess,
							Roles = staffUser.Roles,
							OpenSessions = staffUser.OpenSessions,
							LastSignInAt = staffUser.LastSignInAt,
							InvitedByName = staffUser.InvitedByName,
						})
						.ToList(),
					NextCursor = success.Data.NextCursor,
					TotalCount = success.Counts.Total,
					Counts = new StaffUserListCounts {
						Total = success.Counts.Total,
						Active = success.Counts.Active,
						Suspended = success.Counts.Suspended,
						FullAccess = success.Counts.FullAccess,
						ConnectedToday = success.Counts.ConnectedToday,
						OpenSessions = success.Counts.OpenSessions,
						RoleCounts = success.Counts.RoleCounts
							.Select(StaffRoleCountItem.From)
							.ToList(),
					},
				}
			);
		}

		throw new InvalidOperationException("Unhandled result type");
	}
}
