using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Extensions;
using PublyApp.Api.Lib.Filters;
using PublyApp.Api.Lib.RateLimiting;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Modules.Users.Handlers.Staff;

namespace PublyApp.Api.Modules.Users.Endpoints;

public static class UserEndpointsForTenantAsStaff {
	public static IEndpointRouteBuilder MapUserEndpointsForTenantAsStaff(
		this IEndpointRouteBuilder routes
	) {
		var group = routes.MapGroup(Routes.Users.ForTenantAsStaff.Root)
			.RequireRateLimiting(
				ApiRateLimitPolicies.AuthenticatedDefault
			)
			.WithTags("Tenant Users (Staff View)");

		group.MapGet(
			Routes.Users.ForTenantAsStaff.Find,
			FindTenantUsersAsStaff.Handle
		)
			.WithName("FindTenantUsersAsStaff")
			.RequireRateLimiting(
				ApiRateLimitPolicies.HeavySearchList
			)
			.WithSummary("Find users for a tenant")
			.WithPermission([AppPermissions.Staff.Users.LIST_FOR_TENANT])
			.WithReqQueryValidation<FindTenantUsersAsStaffQuery>();

		group.MapGet(
			Routes.Users.ForTenantAsStaff.GetById,
			GetTenantUserAsStaff.Handle
		)
			.WithName("GetTenantUserAsStaff")
			.WithSummary("Get a tenant user")
			.WithPermission([AppPermissions.Staff.Users.GET_FOR_TENANT]);

		group.MapPost(
			Routes.Users.ForTenantAsStaff.Invite,
			CreateInvitationForTenantAsStaff.Handle
		)
			.WithName("CreateInvitationForTenantAsStaff")
			.RequireRateLimiting(
				ApiRateLimitPolicies.TenantEmailOperation
			)
			.WithSummary("Invite a user to a tenant")
			.WithPermission([AppPermissions.Staff.Users.CREATE_FOR_TENANT])
			.WithReqBodyValidation<CreateInvitationForTenantAsStaffBody>();

		group.MapPost(
			Routes.Users.ForTenantAsStaff.BulkInvite,
			BulkCreateInvitationsForTenantAsStaff.Handle
		)
			.WithName("BulkCreateInvitationsForTenantAsStaff")
			.RequireRateLimiting(
				ApiRateLimitPolicies.TenantEmailOperation
			)
			.WithSummary("Invite multiple users to a tenant")
			.WithPermission([AppPermissions.Staff.Users.CREATE_FOR_TENANT])
			.WithReqBodyValidation<BulkCreateTenantInvitationsForTenantAsStaffBody>()
			.WithRecipientWeightedRateLimit<
				BulkCreateTenantInvitationsForTenantAsStaffBody
			>(
				ApiRateLimitPolicies.TenantEmailOperation,
				body => body.GetInvitations().Count
			);

		group.MapDelete(
			Routes.Users.ForTenantAsStaff.Delete,
			RemoveUserFromTenantAsStaff.Handle
		)
			.WithName("RemoveUserFromTenantAsStaff")
			.WithSummary("Remove a user from a tenant")
			.WithPermission([AppPermissions.Staff.Users.DELETE_FOR_TENANT]);

		group.MapPost(
			Routes.Users.ForTenantAsStaff.BulkRemove,
			BulkRemoveTenantUsersAsStaff.Handle
		)
			.WithName("BulkRemoveTenantUsersAsStaff")
			.RequireRateLimiting(
				ApiRateLimitPolicies.TenantBulkOperation
			)
			.WithSummary("Remove multiple users from a tenant")
			.WithPermission([AppPermissions.Staff.Users.DELETE_FOR_TENANT])
			.WithReqBodyValidation<BulkRemoveTenantUsersBody>();

		group.MapGet(
			Routes.Users.ForTenantAsStaff.Export,
			ExportTenantUsersAsStaff.Handle
		)
			.WithName("ExportTenantUsersAsStaff")
			.RequireRateLimiting(
				ApiRateLimitPolicies.TenantExport
			)
			.WithSummary("Export tenant users as CSV")
			// The handler streams CSV directly to Response.Body; this metadata
			// exists only to document the response shape in OpenAPI.
			.Produces<byte[]>(StatusCodes.Status200OK, "text/csv")
			.ProducesAppProblem(StatusCodes.Status400BadRequest)
			.WithPermission([AppPermissions.Staff.Users.LIST_FOR_TENANT])
			.WithReqQueryValidation<ExportTenantUsersAsStaffQuery>();

		group.MapPatch(
			Routes.Users.ForTenantAsStaff.Update,
			UpdateTenantUserAsStaff.Handle
		)
			.WithName("UpdateTenantUserAsStaff")
			.WithSummary("Update a tenant user's profile or account level")
			.WithPermission([AppPermissions.Staff.Users.UPDATE_FOR_TENANT])
			.WithReqBodyValidation<UpdateTenantUserAsStaffBody>();

		group.MapPost(
			Routes.Users.ForTenantAsStaff.Suspend,
			SuspendTenantUserAsStaff.Handle
		)
			.WithName("SuspendTenantUserAsStaff")
			.WithSummary("Suspend a tenant user")
			.WithPermission([AppPermissions.Staff.Users.UPDATE_FOR_TENANT]);

		group.MapPost(
			Routes.Users.ForTenantAsStaff.Reactivate,
			ReactivateTenantUserAsStaff.Handle
		)
			.WithName("ReactivateTenantUserAsStaff")
			.WithSummary("Reactivate a suspended tenant user")
			.WithPermission([AppPermissions.Staff.Users.UPDATE_FOR_TENANT]);

		return routes;
	}
}
