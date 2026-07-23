using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Filters;
using PublyApp.Api.Lib.RateLimiting;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Modules.Invitations.Handlers.Staff;

namespace PublyApp.Api.Modules.Invitations.Endpoints;

public static class InvitationEndpointsForTenantAsStaff {
	public static IEndpointRouteBuilder MapInvitationEndpointsForTenantAsStaff(
		this IEndpointRouteBuilder routes
	) {
		var group = routes.MapGroup(Routes.Invitations.ForTenantAsStaff.Root)
			.RequireRateLimiting(
				ApiRateLimitPolicies.AuthenticatedDefault
			)
			.WithTags("Tenant Invitations (Staff View)");

		group.MapGet(
				Routes.Invitations.ForTenantAsStaff.Find,
				FindInvitationsForTenantAsStaff.Handle
			)
			.WithName("FindInvitationsForTenantAsStaff")
			.RequireRateLimiting(
				ApiRateLimitPolicies.HeavySearchList
			)
			.WithSummary("Find invitations for a tenant")
			.WithPermission([AppPermissions.Staff.Invitations.LIST_FOR_TENANT])
			.WithReqQueryValidation<FindInvitationsForTenantAsStaffQuery>();

		group.MapDelete(
				Routes.Invitations.ForTenantAsStaff.RevokeById,
				RevokeInvitationForTenantAsStaff.Handle
			)
			.WithName("RevokeInvitationForTenantAsStaff")
			.WithSummary("Revoke a tenant invitation")
			.WithPermission([AppPermissions.Staff.Invitations.REVOKE_FOR_TENANT]);

		return routes;
	}
}
