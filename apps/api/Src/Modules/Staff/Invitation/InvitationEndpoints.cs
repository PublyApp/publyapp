using MainApi.Src.Modules.Staff.Invitation.Handlers;
using MainApi.Src.Lib;
using MainApi.Src.Lib.Extensions;
using MainApi.Src.Lib.Filters;
using MainApi.Src.Lib.Utils;

namespace MainApi.Src.Modules.Staff.Invitation;

public static class InvitationEndpoints {
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
