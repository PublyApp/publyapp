using MainApi.Src.Lib;
using MainApi.Src.Lib.Extensions;
using MainApi.Src.Lib.Filters;
using MainApi.Src.Lib.Utils;
using MainApi.Src.Modules.Shared.Invitation.Handlers;

namespace MainApi.Src.Modules.Shared.Invitation;

public static class InvitationEndpoints {
	public static IEndpointRouteBuilder MapInvitationAnonymousEndpoints(
	this IEndpointRouteBuilder app
) {
		var group = app.MapGroup(PathUtils.GetLastSegment(RoutePath.Invitations.Root))
			.WithTags("Invitations (Anonymous)")
			.WithOpenApi();

		group.MapGet(
				PathUtils.GetLastSegment(RoutePath.Invitations.DetailsByToken, 2),
				GetInvitationDetails.HandleGetInvitationDetails
			)
			.WithName("GetInvitationDetails")
			.WithSummary("Get invitation details by token")
			.ProducesApiResponses(
				StatusCodes.Status500InternalServerError,
				StatusCodes.Status404NotFound
			);

		group.MapPost(
				PathUtils.GetLastSegment(RoutePath.Invitations.AcceptByToken, 2),
				AcceptInvitation.HandleAcceptInvitation
			)
			.WithName("AcceptInvitation")
			.WithSummary("Accept invitation and create account + session")
			.WithReqBodyValidation<AcceptInvitationBody>()
			.ProducesApiResponses(
				StatusCodes.Status500InternalServerError,
				StatusCodes.Status404NotFound
			);

		group.MapGet(
		PathUtils.GetLastSegment(RoutePath.Invitations.Check),
		CheckInvitationToken.HandleCheckInvitationToken
	)
		.WithName("CheckInvitationToken")
		.WithSummary("Check Invitation Token")
		.WithReqQueryValidation<CheckInvitationTokenQuery>()
		.ProducesApiResponses(StatusCodes.Status500InternalServerError);

		return app;
	}
}
