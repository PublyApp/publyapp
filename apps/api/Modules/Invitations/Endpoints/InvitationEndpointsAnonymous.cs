using MainApi.Lib.Extensions;
using MainApi.Lib.Filters;
using MainApi.Lib.Routes;
using MainApi.Lib.Utils;
using MainApi.Modules.Invitations.Handlers.Anonymous;

namespace MainApi.Modules.Invitations.Endpoints;

public static class InvitationEndpointsAnonymous {
	public static IEndpointRouteBuilder MapInvitationEndpointsAnonymous(
	this IEndpointRouteBuilder app
) {
		var group = app.MapGroup(PathUtils.GetLastSegment(Routes.Invitations.Anonymous.Root))
			.WithTags("Invitations (Anonymous)");

		group.MapGet(
				PathUtils.GetLastSegment(Routes.Invitations.Anonymous.DetailsByToken, 2),
				GetInvitationDetails.Handle
			)
			.WithName("GetInvitationDetails")
			.WithSummary("Get invitation details by token")
			.ProducesAppProblem(StatusCodes.Status500InternalServerError);

		group.MapPost(
				PathUtils.GetLastSegment(Routes.Invitations.Anonymous.AcceptByToken, 2),
				AcceptInvitation.Handle
			)
			.WithName("AcceptInvitation")
			.WithSummary("Accept invitation with a new or existing account")
			.WithReqBodyValidation<AcceptInvitationBody>()
			.ProducesAppProblem(StatusCodes.Status500InternalServerError);

		group.MapGet(
			PathUtils.GetLastSegment(Routes.Invitations.Anonymous.Check),
			CheckInvitationToken.Handle
		)
		.WithName("CheckInvitationToken")
		.WithSummary("Check Invitation Token")
		.WithReqQueryValidation<CheckInvitationTokenQuery>()
		.ProducesAppProblem(StatusCodes.Status500InternalServerError);

		return app;
	}
}
