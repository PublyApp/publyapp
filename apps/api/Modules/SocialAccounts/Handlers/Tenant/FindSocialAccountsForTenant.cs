using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Validation;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.SocialAccounts.Services;

namespace PublyApp.Api.Modules.SocialAccounts.Handlers.Tenant;

public class FindSocialAccountsForTenantResponse
	: CursorPaginatedResult<SocialAccountListItem> { }

public class FindSocialAccountsForTenantQuery : CursorPaginatedQuery {
	[FromQuery(Name = "project_id")]
	public string? ProjectId { get; set; }
}

public class FindSocialAccountsForTenantQueryValidator
	: CursorPaginatedQueryValidator<FindSocialAccountsForTenantQuery> {
	public FindSocialAccountsForTenantQueryValidator() {
		RuleFor(x => x.ProjectId)
			.Must(BeValidNullableGuid)
			.WithMessage("project_id must be a valid GUID");
	}

	private static bool BeValidNullableGuid(string? value) {
		if (value is null) {
			return true;
		}
		return Guid.TryParse(value, out _);
	}
}

public sealed class FindSocialAccountsForTenant {
	public static async Task<Results<
		Ok<FindSocialAccountsForTenantResponse>,
		AppBadRequestHttpResult
	>> Handle(
		[AsParameters] FindSocialAccountsForTenantQuery query,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] SocialAccountService socialAccountService,
		CancellationToken cancellationToken = default
	) {
		if (!Guid.TryParse(authContext.TenantId, out var tenantId)) {
			throw new InvalidOperationException(
				$"{nameof(authContext.TenantId)} is not a GUID"
			);
		}

		var tenantAccount = authContext.AccountTenant;
		if (tenantAccount is null) {
			throw new InvalidOperationException(
				"Tenant account not found in auth context. "
				+ "Ensure the endpoint has "
				+ ".WithTenantPermission(...) middleware."
			);
		}

		var cursor = query.GetCursor();
		var cursorGuid = Guid.Empty;

		if (!string.IsNullOrEmpty(cursor)) {
			if (!Guid.TryParse(cursor, out cursorGuid)) {
				return TypedProblems.BadRequest(
					"Invalid cursor",
					ResponseKeys.BadRequest
				);
			}
		}

		Guid? projectIdFilter = null;
		if (!string.IsNullOrEmpty(query.ProjectId)) {
			if (!Guid.TryParse(query.ProjectId, out var parsedProjectId)) {
				return TypedProblems.BadRequest(
					"Invalid project_id",
					ResponseKeys.MalformedId
				);
			}
			projectIdFilter = parsedProjectId;
		}

		var serviceResult = await socialAccountService.FindForTenantAsync(
			tenantId,
			new FindSocialAccountsArgs(
				Cursor: cursorGuid,
				Limit: query.GetLimit(),
				SortId: query.GetSortId(),
				SortOrder: query.GetSortOrder(),
				ProjectId: projectIdFilter
			),
			cancellationToken
		);

		if (serviceResult is FindSocialAccountsResult.CursorNotFound cursorError) {
			return TypedProblems.BadRequest(
				$"Cursor record not found: {cursorError.Cursor}. "
				+ "The record may have been deleted "
				+ "or the cursor is invalid.",
				ResponseKeys.BadRequest
			);
		}

		if (serviceResult is FindSocialAccountsResult.InvalidSortId sortIdError) {
			return TypedProblems.BadRequest(
				$"Invalid sort_id: {sortIdError.SortId}. "
				+ "Allowed values: created_at, updated_at",
				ResponseKeys.BadRequest
			);
		}

		if (serviceResult is FindSocialAccountsResult.Success success) {
			return TypedResults.Ok(new FindSocialAccountsForTenantResponse {
				Data = success.Data.Data,
				NextCursor = success.Data.NextCursor,
			});
		}

		throw new InvalidOperationException(
			"Unhandled result type"
		);
	}
}
