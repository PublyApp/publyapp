using MainApi.Src.Modules.Staff.Invitations.Handlers;
using MainApi.Src.Lib;
using MainApi.Src.Lib.Extensions;
using MainApi.Src.Lib.Filters;
using MainApi.Src.Lib.Utils;

namespace MainApi.Src.Modules.Staff.Invitations;

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

		return app;
	}

	public static IEndpointRouteBuilder MapInvitationAsStaffEndpoints(
		this IEndpointRouteBuilder routes
	) {
		var group = routes.MapGroup(PathUtils.GetLastSegment(RoutePath.Staff.Invitations.Root))
			.WithTags("Staff Invitations")
			.WithOpenApi();

		group.MapPost(
				PathUtils.GetLastSegment(RoutePath.Staff.Invitations.Create),
				CreateStaffInvitation.HandleCreateStaffInvitation
			)
			.WithName("CreateStaffInvitation")
			.WithSummary("Create a staff invitation (Admin only)")
			.WithReqBodyValidation<CreateStaffInvitationBody>()
			.ProducesApiResponses(
				StatusCodes.Status500InternalServerError,
				StatusCodes.Status403Forbidden
			);

		group.MapPost(
				PathUtils.GetLastSegment(RoutePath.Staff.Invitations.BulkCreate),
				BulkCreateStaffInvitations.HandleBulkCreateStaffInvitations
			)
			.WithName("BulkCreateStaffInvitations")
			.WithSummary("Bulk create staff invitations (Admin only)")
			.WithReqBodyValidation<BulkCreateStaffInvitationsBody>()
			.ProducesApiResponses(
				StatusCodes.Status500InternalServerError,
				StatusCodes.Status403Forbidden
			);

		group.MapGet(
				PathUtils.GetLastSegment(RoutePath.Staff.Invitations.Find),
				FindStaffInvitations.HandleFindStaffInvitations
			)
			.WithName("FindStaffInvitations")
			.WithSummary("Find staff invitations")
			.ProducesApiResponses(
				StatusCodes.Status500InternalServerError,
				StatusCodes.Status403Forbidden
			);

		group.MapDelete(
				PathUtils.GetLastSegment(RoutePath.Staff.Invitations.RevokeById),
				RevokeInvitation.HandleRevokeInvitation
			)
			.WithName("RevokeInvitation")
			.WithSummary("Revoke a staff invitation (Admin only)")
			.ProducesApiResponses(
				StatusCodes.Status500InternalServerError,
				StatusCodes.Status403Forbidden,
				StatusCodes.Status404NotFound
			);

		return routes;
	}
}
