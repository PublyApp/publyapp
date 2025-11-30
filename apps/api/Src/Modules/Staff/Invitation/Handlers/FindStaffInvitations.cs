using MainApi.Localization;
using MainApi.Src.Modules.Shared.Users;
using MainApi.Src.Modules.Shared.Invitation;
using MainApi.Src.Lib;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.Staff.Invitation.Handlers;

public static class FindStaffInvitations {
	public static async Task<Results<
		Ok<List<InvitationListItem>>,
		JsonHttpResult<ApiResponse>
	>> HandleFindStaffInvitations(
		[FromServices] IAuthContext authContext,
		[FromServices] IInvitationService invitationService,
		CancellationToken cancellationToken = default
	) {
		// Authorization check
		var account = authContext.AccountStaff;
		if (account is null || account.Scope != AccountScope.Staff) {
			return TypedResults.Json(
				ApiResponse.Create(
					"User does not have the necessary permissions",
					ResponseKeys.UserDoesNotHaveTheNecessaryPermissions
				),
				statusCode: StatusCodes.Status403Forbidden
			);
		}

		var invitations = await invitationService.FindStaffInvitationsAsync(
			cancellationToken
		);

		return TypedResults.Ok(invitations);
	}
}
