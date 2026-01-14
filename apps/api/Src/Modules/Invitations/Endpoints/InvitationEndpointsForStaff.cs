using MainApi.Src.Lib;
using MainApi.Src.Lib.Filters;
using MainApi.Src.Lib.Routes;
using MainApi.Src.Lib.Utils;
using MainApi.Src.Modules.Invitations.Handlers.Staff;

namespace MainApi.Src.Modules.Invitations.Endpoints;

public static class InvitationEndpointsForStaff {
	public static IEndpointRouteBuilder MapInvitationEndpointsForStaff(
		this IEndpointRouteBuilder routes
	) {
		var group = routes.MapGroup(PathUtils.GetLastSegment(Routes.Invitations.Base))
			.WithTags("Staff Invitations");

		group.MapPost(
				PathUtils.GetLastSegment(Routes.Invitations.ForStaff.Create),
				CreateStaffInvitation.HandleCreateStaffInvitation
			)
			.WithName("CreateStaffInvitation")
			.WithSummary("Create a staff invitation (Admin only)")
			.WithReqBodyValidation<CreateStaffInvitationBody>()
			.WithPermission([AppPermissions.Staff.Invitations.CREATE_FOR_STAFF]);

		group.MapPost(
				PathUtils.GetLastSegment(Routes.Invitations.ForStaff.BulkCreate),
				BulkCreateStaffInvitations.HandleBulkCreateStaffInvitations
			)
			.WithName("BulkCreateStaffInvitations")
			.WithSummary("Bulk create staff invitations (Admin only)")
			.WithReqBodyValidation<BulkCreateStaffInvitationsBody>()
			.WithPermission([AppPermissions.Staff.Invitations.CREATE_FOR_STAFF]);

		group.MapGet(
				PathUtils.GetLastSegment(Routes.Invitations.ForStaff.Find),
				FindStaffInvitations.HandleFindStaffInvitations
			)
			.WithName("FindStaffInvitations")
			.WithSummary("Find staff invitations")
			.WithPermission([AppPermissions.Staff.Invitations.LIST_FOR_STAFF]);

		group.MapDelete(
				PathUtils.GetLastSegment(Routes.Invitations.ForStaff.RevokeById),
				RevokeStaffInvitation.HandleRevokeStaffInvitation
			)
			.WithName("RevokeStaffInvitation")
			.WithSummary("Revoke a staff invitation (Admin only)")
			.WithPermission([AppPermissions.Staff.Invitations.REVOKE_FOR_STAFF]);

		return routes;
	}
}
