using System.Text.RegularExpressions;

using FluentValidation;

using MainApi.Lib;
using MainApi.Lib.ProblemResults;
using MainApi.Lib.Validation;
using MainApi.Localization;
using MainApi.Modules.Users.Entities;
using MainApi.Modules.Users.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Modules.Users.Handlers.Staff;

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

	[FromQuery(Name = "status")]
	public string? Status { get; set; }

	public string? GetSearchNormalized() {
		if (Search is null) {
			return null;
		}

		var trimmed = Search.Trim();
		return trimmed.Length == 0 ? null : trimmed;
	}

	public IReadOnlySet<TenantUserStatus>? GetStatusesOrNull() {
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

		var statuses = new HashSet<TenantUserStatus>();
		foreach (var part in parts) {
			TenantUserStatus? parsed = UserAccount.ParseTenantStatus(part);
			if (parsed is { } status) {
				statuses.Add(status);
			}
		}

		return statuses.Count > 0 ? statuses : null;
	}
}

public class FindTenantUsersAsStaffQueryValidator
	: CursorPaginatedQueryValidator<
		FindTenantUsersAsStaffQuery
	> {
	// Source of truth: nameof() - rename-safe, no hardcoded strings to maintain.
	private static readonly string[] AllowedStatuses = [
		nameof(TenantUserStatus.Active),
		nameof(TenantUserStatus.Suspended),
		nameof(TenantUserStatus.GloballySuspended),
	];

	// Snake-case the PascalCase enum member names once at type init. The wire
	// contract uses snake_case tokens (e.g. "globally_suspended"); collapsing to
	// lowercase via .ToLowerInvariant() would yield "globallysuspended" and
	// break the existing wire format. Both the comparison set and the display
	// string derive from the same conversion so they stay in sync.
	private static string ToSnakeCase(string value) {
		return Regex.Replace(value, "(?<!^)([A-Z])", "_$1").ToLowerInvariant();
	}

	private static readonly HashSet<string> AllowedStatusSet =
		new(AllowedStatuses.Select(ToSnakeCase), StringComparer.OrdinalIgnoreCase);

	private static readonly string AllowedStatusesDisplay =
		string.Join(", ", AllowedStatuses.Select(ToSnakeCase).Order());

	public FindTenantUsersAsStaffQueryValidator() {
		RuleFor(x => x.Search)
			.MaximumLength(200)
			.WithMessage("q must be at most 200 characters");
		RuleFor(x => x.Status)
			.Must(raw => {
				if (string.IsNullOrEmpty(raw)) {
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
			.WithMessage($"status must be one of: {AllowedStatusesDisplay}");
	}
}

public sealed class FindTenantUsersAsStaff {
	public static async Task<
		Results<
			Ok<FindTenantUsersAsStaffResult>,
			AppBadRequestHttpResult
		>
	> Handle(
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
		var args = new FindTenantUsersAsStaffArgs(
			Cursor: cursorGuid,
			Limit: limit,
			SortId: sortId,
			SortOrder: sortOrder,
			Filters: new FindTenantUsersAsStaffFilters(
				Search: query.GetSearchNormalized(),
				Status: query.GetStatusesOrNull()
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
								Email =
									tu.User.Email,
								LastName =
									tu.User.LastName,
								FirstName =
									tu.User.FirstName,
								AvatarUrl =
									tu.User.AvatarUrl,
								Status = UserAccount.GetStatusDescription(
									UserAccount.GetTenantStatus(
										tu.User.Status,
										tu.Account.Status
									)
								),
								Level = UserAccount
									.GetLevelDescription(
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
