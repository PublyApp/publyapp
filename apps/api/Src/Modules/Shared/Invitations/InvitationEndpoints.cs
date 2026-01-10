using MainApi.Src.Lib;
using MainApi.Src.Lib.Extensions;
using MainApi.Src.Lib.Filters;
using MainApi.Src.Lib.Utils;
using MainApi.Src.Modules.Shared.Invitations.Handlers;

namespace MainApi.Src.Modules.Shared.Invitations;

public static class InvitationEndpoints {
	public static IEndpointRouteBuilder MapInvitationAnonymousEndpoints(
	this IEndpointRouteBuilder app
) {
		var group = app.MapGroup(PathUtils.GetLastSegment(RoutePath.Invitations.Root))
			.WithTags("Invitations (Anonymous)");

		group.MapGet(
				PathUtils.GetLastSegment(RoutePath.Invitations.DetailsByToken, 2),
				GetInvitationDetails.HandleGetInvitationDetails
			)
			.WithName("GetInvitationDetails")
			.WithSummary("Get invitation details by token")
			.ProducesAppProblem(StatusCodes.Status500InternalServerError);

		group.MapPost(
				PathUtils.GetLastSegment(RoutePath.Invitations.AcceptByToken, 2),
				AcceptInvitation.HandleAcceptInvitation
			)
			.WithName("AcceptInvitation")
			.WithSummary("Accept invitation and create account + session")
			.WithReqBodyValidation<AcceptInvitationBody>()
			.ProducesAppProblem(StatusCodes.Status500InternalServerError);

		group.MapGet(
		PathUtils.GetLastSegment(RoutePath.Invitations.Check),
		CheckInvitationToken.HandleCheckInvitationToken
	)
		.WithName("CheckInvitationToken")
		.WithSummary("Check Invitation Token")
		.WithReqQueryValidation<CheckInvitationTokenQuery>()
		.ProducesAppProblem(StatusCodes.Status500InternalServerError);

		return app;
	}
}
