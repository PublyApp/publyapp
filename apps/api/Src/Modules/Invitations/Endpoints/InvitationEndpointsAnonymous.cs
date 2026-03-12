using MainApi.Src.Lib.Extensions;
using MainApi.Src.Lib.Filters;
using MainApi.Src.Lib.Routes;
using MainApi.Src.Lib.Utils;
using MainApi.Src.Modules.Invitations.Handlers.Anonymous;

namespace MainApi.Src.Modules.Invitations.Endpoints;

public static class InvitationEndpointsAnonymous {
	public static IEndpointRouteBuilder MapInvitationEndpointsAnonymous(
	this IEndpointRouteBuilder app
) {
		var group = app.MapGroup(PathUtils.GetLastSegment(Routes.Invitations.Anonymous.Root))
			.WithTags("Invitations (Anonymous)");

		group.MapGet(
				PathUtils.GetLastSegment(Routes.Invitations.Anonymous.DetailsByToken, 2),
				GetInvitationDetails.HandleGetInvitationDetails
			)
			.WithName("GetInvitationDetails")
			.WithSummary("Get invitation details by token")
			.ProducesAppProblem(StatusCodes.Status500InternalServerError);

		group.MapPost(
				PathUtils.GetLastSegment(Routes.Invitations.Anonymous.AcceptByToken, 2),
				AcceptInvitation.HandleAcceptInvitation
			)
			.WithName("AcceptInvitation")
			.WithSummary("Accept invitation with a new or existing account")
			.WithReqBodyValidation<AcceptInvitationBody>()
			.ProducesAppProblem(StatusCodes.Status500InternalServerError);

		group.MapGet(
			PathUtils.GetLastSegment(Routes.Invitations.Anonymous.Check),
			CheckInvitationToken.HandleCheckInvitationToken
		)
		.WithName("CheckInvitationToken")
		.WithSummary("Check Invitation Token")
		.WithReqQueryValidation<CheckInvitationTokenQuery>()
		.ProducesAppProblem(StatusCodes.Status500InternalServerError);

		return app;
	}
}
