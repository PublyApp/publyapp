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

public class TenantUserItem {
	public Guid Id { get; set; }
	// The tenant membership (UserAccount) id — distinct from Id (the global User id) above.
	// Callers that need to address tenant-scoped membership operations (e.g. tenant-profile
	// assign/unassign, which key by user_account_id) MUST use this field, never Id.
	public Guid UserAccountId { get; set; }
	public string Email { get; set; } = string.Empty;
	public string? LastName { get; set; }
	public string? FirstName { get; set; }
	public string? AvatarUrl { get; set; }
	public TenantUserStatus Status { get; set; }
	public AccountLevel Level { get; set; }
}

public class FindTenantUsersAsStaffResult
	: CursorPaginatedResult<TenantUserItem> { }

public class FindTenantUsersAsStaffQuery
	: CursorPaginatedQuery {
	[FromQuery(Name = "q")]
	public string? Search { get; set; }

	[FromQuery(Name = "status")]
	public string? Status { get; set; }

	[FromQuery(Name = "level")]
	public string? Level { get; set; }

	public string? GetSearchNormalized() {
		return TenantUserFilterQuery.NormalizeSearch(Search);
	}

	public IReadOnlySet<TenantUserStatus>? GetStatusesOrNull() {
		return TenantUserFilterQuery.ParseStatuses(Status);
	}

	public IReadOnlySet<AccountLevel>? GetLevelsOrNull() {
		return TenantUserFilterQuery.ParseLevels(Level);
	}
}

public class FindTenantUsersAsStaffQueryValidator
	: CursorPaginatedQueryValidator<
		FindTenantUsersAsStaffQuery
	> {
	public FindTenantUsersAsStaffQueryValidator() {
		RuleFor(x => x.Search)
			.MaximumLength(200)
			.WithMessage("q must be at most 200 characters");
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
				return parts.All(p => p.Length > 0 && TenantUserFilterQuery.AllowedStatusSet.Contains(p));
			})
			.WithMessage($"status must be one of: {TenantUserFilterQuery.AllowedStatusesDisplay}");
		RuleFor(x => x.Level)
			.Must(raw => {
				if (string.IsNullOrWhiteSpace(raw)) {
					return true;
				}

				var parts = raw.Split(',', StringSplitOptions.TrimEntries);
				if (parts.Length == 0) {
					return false;
				}
				return parts.All(p => p.Length > 0 && TenantUserFilterQuery.AllowedLevelSet.Contains(p));
			})
			.WithMessage($"level must be one of: {TenantUserFilterQuery.AllowedLevelsDisplay}");
	}
}

public sealed class FindTenantUsersAsStaff {
	public static async Task<
		Results<
			Ok<FindTenantUsersAsStaffResult>,
			AppBadRequestHttpResult
		>
	> Handle(
		[FromRoute] string tenantId,
		[AsParameters]
			FindTenantUsersAsStaffQuery query,
		[FromServices] ITenantUserQueryService userService,
		CancellationToken cancellationToken
	) {
		if (
			!Guid.TryParse(
				tenantId,
				out var tenantIdGuid
			)
		) {
			return TypedProblems.BadRequest(
				"Invalid tenantId",
				ResponseKeys.MalformedId
			);
		}

		var cursor = query.GetCursor();
		var cursorGuid = Guid.Empty;

		if (!string.IsNullOrEmpty(cursor)) {
			if (
				!Guid.TryParse(
					cursor,
					out cursorGuid
				)
			) {
				return TypedProblems.BadRequest(
					"Invalid cursor",
					ResponseKeys.BadRequest
				);
			}
		}

		var limit = query.GetLimit();
		var sortId = query.GetSortId();
		var sortOrder = query.GetSortOrder();
		var args = new FindTenantUsersAsStaffArgs(
			Cursor: cursorGuid,
			Limit: limit,
			SortId: sortId,
			SortOrder: sortOrder,
			Filters: new FindTenantUsersAsStaffFilters(
				Search: query.GetSearchNormalized(),
				Status: query.GetStatusesOrNull(),
				Level: query.GetLevelsOrNull()
			)
		);

		var serviceResult =
			await userService.FindTenantUsersAsync(
				tenantId: tenantIdGuid,
				args: args,
				cancellationToken: cancellationToken
			);

		if (
			serviceResult
				is FindTenantUsersResult
					.CursorNotFound cursorError
		) {
			return TypedProblems.BadRequest(
				$"Cursor record not found: "
					+ $"{cursorError.Cursor}.",
				ResponseKeys.BadRequest
			);
		}

		if (
			serviceResult
				is FindTenantUsersResult
					.InvalidSortId sortIdError
		) {
			return TypedProblems.BadRequest(
				$"Invalid sort_id: "
					+ $"{sortIdError.SortId}.",
				ResponseKeys.BadRequest
			);
		}

		if (
			serviceResult
				is FindTenantUsersResult
					.Success success
		) {
			return TypedResults.Ok(
				new FindTenantUsersAsStaffResult {
					Data = success.Data.Data
						.Select(
							tu => new TenantUserItem {
								Id = tu.User
									.GetRequiredId(),
								UserAccountId = tu.Account
									.GetRequiredId(),
								Email =
									tu.User.Email,
								LastName =
									tu.User.LastName,
								FirstName =
									tu.User.FirstName,
								AvatarUrl =
									tu.User.AvatarUrl,
								Status = UserAccount.GetTenantStatus(
									tu.User.Status,
									tu.Account.Status
								),
								Level = tu.AccountLevel,
							}
						)
						.ToList(),
					NextCursor =
						success.Data.NextCursor,
				}
			);
		}

		throw new InvalidOperationException(
			"Unhandled result type"
		);
	}
}
