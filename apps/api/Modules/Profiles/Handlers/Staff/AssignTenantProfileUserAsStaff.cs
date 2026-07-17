using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Profiles.Services;

namespace PublyApp.Api.Modules.Profiles.Handlers.Staff;

public sealed class AssignTenantProfileUserAsStaff {
	public static async Task<Results<
		NoContent,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult,
		AppValidationProblemHttpResult
	>> Handle(
		[FromRoute] string tenantId,
		[FromRoute] string profileId,
		[FromRoute(Name = "user_account_id")] string userAccountId,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] ITenantProfileAsStaffService tenantProfileService,
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

		if (!Guid.TryParse(userAccountId, out var userAccountIdGuid)) {
			return TypedProblems.BadRequest(
				"Invalid user_account_id",
				ResponseKeys.MalformedId
			);
		}

		var account = authContext.AccountStaff;
		if (account is null) {
			throw new InvalidOperationException(
				"Staff account not found in auth context. "
				+ "Ensure the endpoint has .WithPermission() middleware."
			);
		}

		var result = await tenantProfileService.SetTenantProfileUserAsync(
			new SetTenantProfileUserArgs(
				TenantId: tenantIdGuid,
				ProfileId: profileIdGuid,
				UserAccountId: userAccountIdGuid,
				IsAssigned: true,
				ActorUserId: account.UserId
			),
			cancellationToken
		);

		if (result is SetTenantProfileUserResult.ProfileNotFound) {
			return TypedProblems.NotFound(
				"Profile not found",
				ResponseKeys.NotFound
			);
		}

		if (result is SetTenantProfileUserResult.MemberNotFound) {
			return TypedProblems.NotFound(
				"Tenant member not found",
				ResponseKeys.NotFound
			);
		}

		if (result is SetTenantProfileUserResult.MaxProfilesPerUserExceeded capExceeded) {
			var errors = new Dictionary<string, string[]> {
				["user_account_id"] = [
					$"Cannot assign more than {capExceeded.MaxProfilesPerUser} profiles"
				]
			};

			return TypedProblems.ValidationProblem(
				"Max profiles per user exceeded",
				ResponseKeys.MaxProfilesPerUserExceeded,
				errors
			);
		}

		if (result is not SetTenantProfileUserResult.Success) {
			throw new InvalidOperationException("Unhandled result type");
		}

		// No audit call here: the service records the assignment in the same transaction as the
		// junction row, so the state change and its only history commit together.
		return TypedResults.NoContent();
	}
}
