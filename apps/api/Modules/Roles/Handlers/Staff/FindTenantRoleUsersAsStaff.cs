using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Validation;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Roles.Services;
using PublyApp.Api.Modules.Users.Entities;

namespace PublyApp.Api.Modules.Roles.Handlers.Staff;

public class TenantRoleUserItem {
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
	public bool IsFullAccess { get; set; }
	public required List<TenantRoleUserRoleItem> OtherRoles { get; set; }
	public DateTime? JoinedAt { get; set; }
}

public class TenantRoleUserRoleItem {
	public Guid Id { get; set; }
	public string Name { get; set; } = string.Empty;
}

public class FindTenantRoleUsersAsStaffResult {
	public required List<TenantRoleUserItem> Users { get; set; }
	public required int Count { get; set; }
}

public class FindTenantRoleUsersAsStaffQuery : OffsetPaginatedQuery {
	[FromQuery(Name = "q")]
	public string? Search { get; set; }

	public string? GetSearchNormalized() {
		if (this.Search is null) {
			return null;
		}

		// Keep "blank" searches out of the DB query for consistency with other list endpoints.
		var trimmed = this.Search.Trim();
		return trimmed.Length == 0 ? null : trimmed;
	}
}

public class FindTenantRoleUsersAsStaffQueryValidator
	: OffsetPaginatedQueryValidator<FindTenantRoleUsersAsStaffQuery> {
	public FindTenantRoleUsersAsStaffQueryValidator() {
		this.RuleFor(x => x.Search).MaximumLength(200);
	}
}

/// <summary>
/// Lists the tenant members assigned to a tenant role. Mirrors
/// <c>FindStaffRoleUsers</c> (the staff-roles precedent) — same offset
/// pagination/search/response shape — but scoped to a tenant role and keyed by
/// <c>user_account_id</c> to match the sibling assign/unassign endpoints on this route group.
/// </summary>
public sealed class FindTenantRoleUsersAsStaff {
	public static async Task<
		Results<
			Ok<FindTenantRoleUsersAsStaffResult>,
			AppNotFoundHttpResult,
			AppBadRequestHttpResult
		>
	> Handle(
		[FromRoute] string tenantId,
		[FromRoute] string roleId,
		[AsParameters] FindTenantRoleUsersAsStaffQuery query,
		[FromServices] ITenantRoleQueryAsStaffService tenantRoleQueryService,
		CancellationToken cancellationToken
	) {
		if (!Guid.TryParse(tenantId, out var tenantIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid tenant ID",
				ResponseKeys.MalformedId
			);
		}

		if (!Guid.TryParse(roleId, out var roleIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid roleId",
				ResponseKeys.MalformedId
			);
		}

		// NOTE: This uses offset pagination because the sibling staff-roles Members tab
		// already uses page/limit table state (see FindStaffRoleUsersQuery). We can migrate
		// to cursor later if the UX demands it.
		var page = query.GetPage();
		var limit = query.GetLimit();
		var sortId = query.GetSortId();
		var sortOrder = query.GetSortOrder();

		var args = new FindTenantRoleUsersArgs(
			TenantId: tenantIdGuid,
			RoleId: roleIdGuid,
			Page: page,
			Limit: limit,
			SortId: sortId,
			SortOrder: sortOrder,
			Search: query.GetSearchNormalized()
		);

		var serviceResult = await tenantRoleQueryService.FindTenantRoleUsersAsync(
			args: args,
			cancellationToken: cancellationToken
		);

		if (serviceResult is FindTenantRoleUsersResult.RoleNotFound) {
			return TypedProblems.NotFound(
				"Role not found",
				ResponseKeys.NotFound
			);
		}

		if (
			serviceResult is FindTenantRoleUsersResult.InvalidSortId sortIdError
		) {
			return TypedProblems.BadRequest(
				$"Invalid sort_id: {sortIdError.SortId}.",
				ResponseKeys.BadRequest
			);
		}

		if (serviceResult is FindTenantRoleUsersResult.Success success) {
			return TypedResults.Ok(
				new FindTenantRoleUsersAsStaffResult {
					Users = success.Users
						.Select(u => new TenantRoleUserItem {
							// The item id is the user_account_id, matching the toggle route's
							// {user_account_id} placeholder — not the global user id.
							Id = u.UserAccountId,
							UserId = u.UserId,
							Email = u.Email,
							LastName = u.LastName,
							FirstName = u.FirstName,
							AvatarUrl = u.AvatarUrl,
							Status = UserAccount.GetTenantStatus(u.UserStatus, u.AccountStatus),
							IsFullAccess = u.IsFullAccess,
							OtherRoles = u.OtherRoles
								.Select(role => new TenantRoleUserRoleItem {
									Id = role.Id,
									Name = role.Name,
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
