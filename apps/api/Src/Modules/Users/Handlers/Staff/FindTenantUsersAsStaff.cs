using FluentValidation;

using MainApi.Localization;
using MainApi.Src.Lib;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Lib.Validation;
using MainApi.Src.Modules.Users.Entities;
using MainApi.Src.Modules.Users.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.Users.Handlers.Staff;

public class TenantUserItem {
	public Guid Id { get; set; }
	public string Email { get; set; } = string.Empty;
	public string? LastName { get; set; }
	public string? FirstName { get; set; }
	public string? AvatarUrl { get; set; }
	public string Status { get; set; } = string.Empty;
	public string Level { get; set; } = string.Empty;
}

public class FindTenantUsersAsStaffResult
	: CursorPaginatedResult<TenantUserItem> { }

public class FindTenantUsersAsStaffQuery
	: CursorPaginatedQuery {
	[FromQuery(Name = "q")]
	public string? Search { get; set; }

	[FromQuery]
	public string? Status { get; set; }

	public string? GetSearchNormalized() => string.IsNullOrWhiteSpace(Search)
		? null
		: Search.Trim();
}

public class FindTenantUsersAsStaffQueryValidator
	: CursorPaginatedQueryValidator<
		FindTenantUsersAsStaffQuery
	> {
	private static readonly HashSet<string> AllowedStatuses =
		new(["active", "pending", "suspended"], StringComparer.OrdinalIgnoreCase);

	public FindTenantUsersAsStaffQueryValidator() {
		RuleFor(x => x.Search).MaximumLength(200);
		RuleFor(x => x.Status)
			.Must(raw => string.IsNullOrEmpty(raw)
				|| AllowedStatuses.Contains(raw))
			.WithMessage("Status must be one of: active, pending, suspended");
	}
}

public class FindTenantUsersAsStaff {
	public static async Task<
		Results<
			Ok<FindTenantUsersAsStaffResult>,
			AppBadRequestHttpResult
		>
	> HandleFindTenantUsersAsStaff(
		[FromServices] IUserService userService,
		[AsParameters]
			FindTenantUsersAsStaffQuery query,
		[FromRoute] string tenantId,
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

		var serviceResult =
			await userService.FindTenantUsersAsync(
				tenantId: tenantIdGuid,
				cursor: cursorGuid,
				limit: limit,
				sortId: sortId,
				sortOrder: sortOrder,
				q: query.GetSearchNormalized(),
				status: query.Status,
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
				$"Invalid sortId: "
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
								Email =
									tu.User.Email,
								LastName =
									tu.User.LastName,
								FirstName =
									tu.User.FirstName,
								AvatarUrl =
									tu.User.AvatarUrl,
								Status = User
									.GetStatusDescription(
										tu.User.Status
									),
								Level = UserAccount
									.GetAccountLevelDescription(
										tu.AccountLevel
									),
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
