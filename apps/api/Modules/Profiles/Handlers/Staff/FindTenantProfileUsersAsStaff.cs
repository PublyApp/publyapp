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

public class TenantProfileUserItem {
	// The tenant membership (UserAccount) id — matches the sibling assign/unassign toggle
	// route's {user_account_id} placeholder, not the global user id.
	public Guid Id { get; set; }
	// The global User id — distinct from Id above. Callers that need to LINK to a user's
	// own detail page (e.g. GET /staff/tenants/{tenantId}/users/{userId}, which resolves the
	// global user id) MUST use this field, never Id.
	public Guid UserId { get; set; }
	public string Email { get; set; } = string.Empty;
	public string? LastName { get; set; }
	public string? FirstName { get; set; }
	public string? AvatarUrl { get; set; }
	public TenantUserStatus Status { get; set; }
	public AccountLevel Level { get; set; }
	public required List<TenantProfileUserProfileItem> OtherProfiles { get; set; }
	public DateTime? JoinedAt { get; set; }
}

public class TenantProfileUserProfileItem {
	public Guid Id { get; set; }
	public string Name { get; set; } = string.Empty;
}

public class FindTenantProfileUsersAsStaffResult {
	public required List<TenantProfileUserItem> Users { get; set; }
	public required int Count { get; set; }
}

public class FindTenantProfileUsersAsStaffQuery : OffsetPaginatedQuery {
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

public class FindTenantProfileUsersAsStaffQueryValidator
	: OffsetPaginatedQueryValidator<FindTenantProfileUsersAsStaffQuery> {
	public FindTenantProfileUsersAsStaffQueryValidator() {
		RuleFor(x => x.Search).MaximumLength(200);
	}
}

/// <summary>
/// Lists the tenant members assigned to a tenant profile. Mirrors
/// <c>FindStaffProfileUsers</c> (the staff-profiles precedent) — same offset
/// pagination/search/response shape — but scoped to a tenant profile and keyed by
/// <c>user_account_id</c> to match the sibling assign/unassign endpoints on this route group.
/// </summary>
public sealed class FindTenantProfileUsersAsStaff {
	public static async Task<
		Results<
			Ok<FindTenantProfileUsersAsStaffResult>,
			AppNotFoundHttpResult,
			AppBadRequestHttpResult
		>
	> Handle(
		[FromRoute] string tenantId,
		[FromRoute] string profileId,
		[AsParameters] FindTenantProfileUsersAsStaffQuery query,
		[FromServices] ITenantProfileQueryAsStaffService tenantProfileQueryService,
		CancellationToken cancellationToken
	) {
		if (!Guid.TryParse(tenantId, out var tenantIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid tenant ID",
				ResponseKeys.MalformedId
			);
		}

		if (!Guid.TryParse(profileId, out var profileIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid profileId",
				ResponseKeys.MalformedId
			);
		}

		// NOTE: This uses offset pagination because the sibling staff-profiles Members tab
		// already uses page/limit table state (see FindStaffProfileUsersQuery). We can migrate
		// to cursor later if the UX demands it.
		var page = query.GetPage();
		var limit = query.GetLimit();
		var sortId = query.GetSortId();
		var sortOrder = query.GetSortOrder();

		var args = new FindTenantProfileUsersArgs(
			TenantId: tenantIdGuid,
			ProfileId: profileIdGuid,
			Page: page,
			Limit: limit,
			SortId: sortId,
			SortOrder: sortOrder,
			Search: query.GetSearchNormalized()
		);

		var serviceResult = await tenantProfileQueryService.FindTenantProfileUsersAsync(
			args: args,
			cancellationToken: cancellationToken
		);

		if (serviceResult is FindTenantProfileUsersResult.ProfileNotFound) {
			return TypedProblems.NotFound(
				"Profile not found",
				ResponseKeys.NotFound
			);
		}

		if (
			serviceResult is FindTenantProfileUsersResult.InvalidSortId sortIdError
		) {
			return TypedProblems.BadRequest(
				$"Invalid sort_id: {sortIdError.SortId}.",
				ResponseKeys.BadRequest
			);
		}

		if (serviceResult is FindTenantProfileUsersResult.Success success) {
			return TypedResults.Ok(
				new FindTenantProfileUsersAsStaffResult {
					Users = success.Users
						.Select(u => new TenantProfileUserItem {
							// The item id is the user_account_id, matching the toggle route's
							// {user_account_id} placeholder — not the global user id.
							Id = u.UserAccountId,
							UserId = u.UserId,
							Email = u.Email,
							LastName = u.LastName,
							FirstName = u.FirstName,
							AvatarUrl = u.AvatarUrl,
							Status = UserAccount.GetTenantStatus(u.UserStatus, u.AccountStatus),
							Level = u.Level,
							OtherProfiles = u.OtherProfiles
								.Select(profile => new TenantProfileUserProfileItem {
									Id = profile.Id,
									Name = profile.Name,
								})
								.ToList(),
							JoinedAt = u.JoinedAt,
						})
						.ToList(),
					Count = success.Count,
				}
			);
		}

		throw new InvalidOperationException("Unhandled result type");
	}
}
