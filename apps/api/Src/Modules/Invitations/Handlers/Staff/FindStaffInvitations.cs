using MainApi.Src.Lib.ProblemResults;
using MainApi.Src.Modules.Invitations.Services;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

namespace MainApi.Src.Modules.Invitations.Handlers.Staff;

public static class FindStaffInvitations {
	public static async Task<Results<
		Ok<List<InvitationListItem>>,
		AppForbiddenHttpResult
	>> HandleFindStaffInvitations(
		[FromServices] IInvitationService invitationService,
		CancellationToken cancellationToken = default
	) {
		var invitations = await invitationService.FindStaffInvitationsAsync(
			cancellationToken
		);

		return TypedResults.Ok(invitations);
	}
}
