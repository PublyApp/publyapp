using MainApi.Src.Lib;
using MainApi.Src.Lib.Filters;
using MainApi.Src.Lib.Utils;
using MainApi.Src.Modules.Staff.InvitationsAsStaff.Handlers;

namespace MainApi.Src.Modules.Staff.InvitationsAsStaff;

public static class InvitationEndpoints {
	public static IEndpointRouteBuilder MapInvitationAsStaffEndpoints(
		this IEndpointRouteBuilder routes
	) {
		var group = routes.MapGroup(PathUtils.GetLastSegment(RoutePath.Staff.Invitations.Root))
			.WithTags("Staff Invitations");

		group.MapPost(
				PathUtils.GetLastSegment(RoutePath.Staff.Invitations.Create),
				CreateStaffInvitation.HandleCreateStaffInvitation
			)
			.WithName("CreateStaffInvitation")
			.WithSummary("Create a staff invitation (Admin only)")
			.WithReqBodyValidation<CreateStaffInvitationBody>();

		group.MapPost(
				PathUtils.GetLastSegment(RoutePath.Staff.Invitations.BulkCreate),
				BulkCreateStaffInvitations.HandleBulkCreateStaffInvitations
			)
			.WithName("BulkCreateStaffInvitations")
			.WithSummary("Bulk create staff invitations (Admin only)")
			.WithReqBodyValidation<BulkCreateStaffInvitationsBody>();

		group.MapGet(
				PathUtils.GetLastSegment(RoutePath.Staff.Invitations.Find),
				FindStaffInvitations.HandleFindStaffInvitations
			)
			.WithName("FindStaffInvitations")
			.WithSummary("Find staff invitations");

		group.MapDelete(
				PathUtils.GetLastSegment(RoutePath.Staff.Invitations.RevokeById),
				RevokeInvitation.HandleRevokeInvitation
			)
			.WithName("RevokeInvitation")
			.WithSummary("Revoke a staff invitation (Admin only)");

		return routes;
	}
}
