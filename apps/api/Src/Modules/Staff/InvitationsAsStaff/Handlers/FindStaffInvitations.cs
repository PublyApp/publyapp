using MainApi.Localization;
using MainApi.Src.Lib;
using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Modules.Shared.Invitations;
using MainApi.Src.Modules.Shared.Users;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.Staff.InvitationsAsStaff.Handlers;

public static class FindStaffInvitations {
	public static async Task<Results<
		Ok<List<InvitationListItem>>,
		AppForbiddenHttpResult
	>> HandleFindStaffInvitations(
		[FromServices] IRequestAuthContext authContext,
		[FromServices] IInvitationService invitationService,
		CancellationToken cancellationToken = default
	) {
		// Authorization check
		var account = authContext.AccountStaff;
		if (account is null || account.Scope != AccountScope.Staff) {
			return TypedProblems.Forbidden(
				"User does not have the necessary permissions",
				ResponseKeys.UserDoesNotHaveTheNecessaryPermissions
			);
		}

		var invitations = await invitationService.FindStaffInvitationsAsync(
			cancellationToken
		);

		return TypedResults.Ok(invitations);
	}
}
