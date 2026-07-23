using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Filters;
using PublyApp.Api.Lib.RateLimiting;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Modules.Invitations.Handlers.Staff;

namespace PublyApp.Api.Modules.Invitations.Endpoints;

public static class InvitationEndpointsForStaff {
	public static IEndpointRouteBuilder MapInvitationEndpointsForStaff(
		this IEndpointRouteBuilder routes
	) {
		var group = routes.MapGroup(Routes.Invitations.ForStaff.Root)
			.RequireRateLimiting(
				ApiRateLimitPolicies.AuthenticatedDefault
			)
			.WithTags("Staff Invitations");

		group.MapPost(
				Routes.Invitations.ForStaff.Create,
				CreateStaffInvitation.Handle
			)
			.WithName("CreateStaffInvitation")
			.RequireRateLimiting(
				ApiRateLimitPolicies.EmailOperation
			)
			.WithSummary("Create a staff invitation (Admin only)")
			.WithReqBodyValidation<CreateStaffInvitationBody>()
			.WithPermission([AppPermissions.Staff.Invitations.CREATE_FOR_STAFF]);

		group.MapPost(
				Routes.Invitations.ForStaff.BulkCreate,
				BulkCreateStaffInvitations.Handle
			)
			.WithName("BulkCreateStaffInvitations")
			.RequireRateLimiting(
				ApiRateLimitPolicies.EmailOperation
			)
			.WithSummary("Bulk create staff invitations (Admin only)")
			.WithReqBodyValidation<BulkCreateStaffInvitationsBody>()
			.WithPermission([AppPermissions.Staff.Invitations.CREATE_FOR_STAFF]);

		group.MapPost(
				Routes.Invitations.ForStaff.BulkRevoke,
				BulkRevokeStaffInvitations.Handle
			)
			.WithName("BulkRevokeStaffInvitations")
			.RequireRateLimiting(
				ApiRateLimitPolicies.BulkOperation
			)
			.WithSummary("Bulk revoke staff invitations")
			.WithReqBodyValidation<BulkRevokeStaffInvitationsBody>()
			.WithPermission([AppPermissions.Staff.Invitations.REVOKE_FOR_STAFF]);

		group.MapGet(
				Routes.Invitations.ForStaff.Find,
				FindStaffInvitations.Handle
			)
			.WithName("FindStaffInvitations")
			.RequireRateLimiting(
				ApiRateLimitPolicies.HeavySearchList
			)
			.WithSummary("Find staff invitations")
			.WithPermission([AppPermissions.Staff.Invitations.LIST_FOR_STAFF])
			// Validate cursor/sort/status query params before hitting the service.
			.WithReqQueryValidation<FindStaffInvitationsQuery>();

		group.MapGet(
				Routes.Invitations.ForStaff.GetById,
				GetStaffInvitation.Handle
			)
			.WithName("GetStaffInvitation")
			.WithSummary("Get staff invitation details")
			.WithPermission([AppPermissions.Staff.Invitations.GET_FOR_STAFF]);

		group.MapGet(
				Routes.Invitations.ForStaff.GetLinkById,
				GetStaffInvitationLink.Handle
			)
			.WithName("GetStaffInvitationLink")
			.WithSummary("Get staff invitation link")
			.WithPermission([AppPermissions.Staff.Invitations.GET_LINK_FOR_STAFF]);

		group.MapPost(
				Routes.Invitations.ForStaff.ResendById,
				ResendStaffInvitation.Handle
			)
			.WithName("ResendStaffInvitation")
			.RequireRateLimiting(
				ApiRateLimitPolicies.EmailOperation
			)
			.WithSummary("Resend staff invitation email")
			.WithPermission([AppPermissions.Staff.Invitations.RESEND_FOR_STAFF]);

		group.MapDelete(
				Routes.Invitations.ForStaff.RevokeById,
				RevokeInvitationForStaff.Handle
			)
			.WithName("RevokeInvitationForStaff")
			.WithSummary("Revoke a staff invitation (Admin only)")
			.WithPermission([AppPermissions.Staff.Invitations.REVOKE_FOR_STAFF]);

		return routes;
	}
}
