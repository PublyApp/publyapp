using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Validation;
using PublyApp.Api.Localization;
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
	public AccountLevel Level { get; set; }
}

public class FindStaffUsersResponse : CursorPaginatedResult<StaffUserItem> { }

public class FindStaffUsersQuery : CursorPaginatedQuery {
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

	public IReadOnlySet<UserStatus>? GetStatusesOrNull() {
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
	private static readonly HashSet<string> AllowedStatuses =
		new(["active", "suspended"]);

	public FindStaffUsersQueryValidator() {
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
			.WithMessage(
				"Invalid status value. Must be comma-separated: "
				+ string.Join(",", AllowedStatuses)
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
							Level = staffUser.AccountLevel,
						})
						.ToList(),
					NextCursor = success.Data.NextCursor,
				}
			);
		}

		throw new InvalidOperationException("Unhandled result type");
	}
}
