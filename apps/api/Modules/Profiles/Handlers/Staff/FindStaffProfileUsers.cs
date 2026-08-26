using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Validation;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Profiles.Services;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Modules.Profiles.Handlers.Staff;

public class StaffProfileUserItem {
	public Guid Id { get; set; }
	public string Email { get; set; } = string.Empty;
	public string? LastName { get; set; }
	public string? FirstName { get; set; }
	public string? AvatarUrl { get; set; }
	public UserStatus Status { get; set; }
}

public class FindStaffProfileUsersResult {
	public required List<StaffProfileUserItem> Users { get; set; }
	public required int Count { get; set; }
}

public class FindStaffProfileUsersQuery : OffsetPaginatedQuery {
	[FromQuery(Name = "q")]
	public string? Search { get; set; }

	public string? GetSearchNormalized() {
		if (Search is null) {
			return null;
		}

		// Keep "blank" searches out of the DB query for consistency with other list endpoints.
		var trimmed = Search.Trim();
		return trimmed.Length == 0 ? null : trimmed;
	}
}

public class FindStaffProfileUsersQueryValidator
	: OffsetPaginatedQueryValidator<FindStaffProfileUsersQuery> {
	public FindStaffProfileUsersQueryValidator() {
		RuleFor(x => x.Search).MaximumLength(200);
	}
}

public sealed class FindStaffProfileUsers {
	public static async Task<
		Results<
			Ok<FindStaffProfileUsersResult>,
			AppNotFoundHttpResult,
			AppBadRequestHttpResult
		>
	> Handle(
		[FromRoute] string profileId,
		[AsParameters] FindStaffProfileUsersQuery query,
		[FromServices] IStaffProfileUserAssignmentAsStaffService staffProfileUserAssignmentAsStaffService,
		CancellationToken cancellationToken
	) {
		if (!Guid.TryParse(profileId, out var profileIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid profileId",
				ResponseKeys.MalformedId
			);
		}

		// NOTE: This uses offset pagination because the existing Profile Users tab UI already
		// uses page/limit table state. We can migrate to cursor later if the UX demands it.
		var page = query.GetPage();
		var limit = query.GetLimit();
		var sortId = query.GetSortId();
		var sortOrder = query.GetSortOrder();

		var args = new FindStaffProfileUsersArgs(
			ProfileId: profileIdGuid,
			Page: page,
			Limit: limit,
			SortId: sortId,
			SortOrder: sortOrder,
			Search: query.GetSearchNormalized()
		);

		var serviceResult =
			await staffProfileUserAssignmentAsStaffService.FindStaffProfileUsersAsync(
				args: args,
				cancellationToken: cancellationToken
			);

		if (serviceResult is FindStaffProfileUsersServiceResult.ProfileNotFound) {
			return TypedProblems.NotFound(
				"Profile not found",
				ResponseKeys.NotFound
			);
		}

		if (
			serviceResult is FindStaffProfileUsersServiceResult.InvalidSortId sortIdError
		) {
			return TypedProblems.BadRequest(
				$"Invalid sort_id: {sortIdError.SortId}.",
				ResponseKeys.BadRequest
			);
		}

		if (serviceResult is FindStaffProfileUsersServiceResult.Success success) {
			return TypedResults.Ok(
				new FindStaffProfileUsersResult {
					Users = success.Users
						.Select(u => new StaffProfileUserItem {
							Id = u.UserId,
							Email = u.Email,
							LastName = u.LastName,
							FirstName = u.FirstName,
							AvatarUrl = u.AvatarUrl,
							Status = u.Status,
						})
						.ToList(),
					Count = success.Count,
				}
			);
		}

		throw new InvalidOperationException("Unhandled result type");
	}
}
