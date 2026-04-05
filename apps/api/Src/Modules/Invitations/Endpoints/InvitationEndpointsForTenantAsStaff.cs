using MainApi.Src.Lib;
using MainApi.Src.Lib.Filters;
using MainApi.Src.Lib.Routes;
using MainApi.Src.Modules.Invitations.Handlers.Staff;

namespace MainApi.Src.Modules.Invitations.Endpoints;

public static class InvitationEndpointsForTenantAsStaff {
	public static IEndpointRouteBuilder MapInvitationEndpointsForTenantAsStaff(
		this IEndpointRouteBuilder routes
	) {
		var group = routes.MapGroup(Routes.Invitations.ForTenantAsStaff.Root)
			.WithTags("Tenant Invitations (Staff View)");

		group.MapGet(
				Routes.Invitations.ForTenantAsStaff.Find,
				FindInvitationsForTenantAsStaff.HandleFindInvitationsForTenantAsStaff
			)
			.WithName("FindInvitationsForTenantAsStaff")
			.WithSummary("Find invitations for a tenant")
			.WithPermission([AppPermissions.Staff.Invitations.LIST_FOR_TENANT])
			.WithReqQueryValidation<FindInvitationsForTenantAsStaffQuery>();

		return routes;
	}
}
