using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Filters;
using PublyApp.Api.Lib.RateLimiting;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Modules.Users.Handlers.Staff;

namespace PublyApp.Api.Modules.Users.Endpoints;

public static class UserEndpointsForStaff {
	public static IEndpointRouteBuilder MapUserEndpointsForStaff(this IEndpointRouteBuilder routes) {
		var group = routes.MapGroup(Routes.Users.ForStaff.Root)
			.RequireRateLimiting(
				ApiRateLimitPolicies.AuthenticatedDefault
			)
			.WithTags("Staff Users");

		// Direct staff-user creation is intentionally not mapped: onboarding must flow
		// through invitations so expiry, revocation, acceptance metadata, and profile
		// assignment intent remain owned by the invitation lifecycle. Keep the handler
		// code for now while we confirm no internal/bootstrap path still needs it.
		// group.MapPost(
		// 		Routes.Users.ForStaff.Create,
		// 		CreateStaffUser.Handle
		// 	)
		// 	.WithName("CreateStaffUser")
		// 	.WithSummary("Create a new staff user")
		// 	.WithReqBodyValidation<CreateStaffUserBody>()
		// 	.WithPermission([AppPermissions.Staff.Users.CREATE_FOR_STAFF]);

		group.MapGet(
				Routes.Users.ForStaff.GetById,
				GetStaffUserById.Handle
			)
			.WithName("GetStaffUserById")
			.WithSummary("Get a staff user by id")
			.WithPermission([AppPermissions.Staff.Users.GET_FOR_STAFF]);

		group.MapGet(
				Routes.Users.ForStaff.Find,
				FindStaffUsers.Handle
			)
			.WithName("FindStaffUsers")
			.RequireRateLimiting(
				ApiRateLimitPolicies.HeavySearchList
			)
			.WithSummary("Find staff users")
			.WithReqQueryValidation<FindStaffUsersQuery>()
			.WithPermission([AppPermissions.Staff.Users.LIST_FOR_STAFF]);

		group.MapPatch(
				Routes.Users.ForStaff.Update,
				UpdateStaffUser.Handle
			)
			.WithName("UpdateStaffUser")
			.WithSummary("Update a staff user")
			.WithReqBodyValidation<UpdateStaffUserBody>()
			.WithPermission([AppPermissions.Staff.Users.UPDATE_FOR_STAFF]);

		// High-risk identity operation:
		// keep it behind a dedicated route + permission so it cannot be updated accidentally
		// via the generic "update staff user" PATCH.
		group.MapPatch(
				Routes.Users.ForStaff.UpdateEmail,
				UpdateStaffUserEmail.Handle
			)
			.WithName("UpdateStaffUserEmail")
			.WithSummary("Update a staff user's email")
			.WithReqBodyValidation<UpdateStaffUserEmailBody>()
			.WithPermission([AppPermissions.Staff.Users.UPDATE_EMAIL_FOR_STAFF]);

		group.MapPost(
				Routes.Users.ForStaff.Suspend,
				SuspendStaffUser.Handle
			)
			.WithName("SuspendStaffUser")
			.WithSummary("Suspend a staff user")
			.WithPermission([AppPermissions.Staff.Users.SUSPEND_FOR_STAFF]);

		group.MapPost(
				Routes.Users.ForStaff.Reactivate,
				ReactivateStaffUser.Handle
			)
			.WithName("ReactivateStaffUser")
			.WithSummary("Reactivate a staff user")
			.WithPermission([AppPermissions.Staff.Users.REACTIVATE_FOR_STAFF]);

		group.MapPost(
				Routes.Users.ForStaff.BulkSuspend,
				BulkSuspendStaffUsers.Handle
			)
			.WithName("BulkSuspendStaffUsers")
			.RequireRateLimiting(
				ApiRateLimitPolicies.BulkOperation
			)
			.WithSummary("Bulk suspend staff users")
			.WithReqBodyValidation<BulkSuspendStaffUsersBody>()
			.WithPermission([AppPermissions.Staff.Users.SUSPEND_FOR_STAFF]);

		group.MapPost(
				Routes.Users.ForStaff.BulkReactivate,
				BulkReactivateStaffUsers.Handle
			)
			.WithName("BulkReactivateStaffUsers")
			.RequireRateLimiting(
				ApiRateLimitPolicies.BulkOperation
			)
			.WithSummary("Bulk reactivate staff users")
			.WithReqBodyValidation<BulkReactivateStaffUsersBody>()
			.WithPermission([AppPermissions.Staff.Users.REACTIVATE_FOR_STAFF]);

		group.MapPost(
				Routes.Users.ForStaff.BulkDelete,
				BulkDeleteStaffUsers.Handle
			)
			.WithName("BulkDeleteStaffUsers")
			.RequireRateLimiting(
				ApiRateLimitPolicies.BulkOperation
			)
			.WithSummary("Bulk delete staff users")
			.WithReqBodyValidation<BulkDeleteStaffUsersBody>()
			.WithPermission([AppPermissions.Staff.Users.DELETE_FOR_STAFF]);

		group.MapDelete(
				Routes.Users.ForStaff.Delete,
				DeleteStaffUser.Handle
			)
			.WithName("DeleteStaffUser")
			.WithSummary("Soft-delete a suspended staff user")
			.WithPermission([AppPermissions.Staff.Users.DELETE_FOR_STAFF]);

		group.MapGet(
				Routes.Users.ForStaff.Profiles.Get,
				GetStaffUserProfiles.Handle
			)
			.WithName("GetStaffUserProfiles")
			.WithSummary("Get profiles assigned to a staff user")
			.WithPermission([AppPermissions.Staff.Users.GET_PROFILES_FOR_STAFF]);

		group.MapPut(
				Routes.Users.ForStaff.Profiles.Update,
				UpdateStaffUserProfiles.Handle
			)
			.WithName("UpdateStaffUserProfiles")
			.WithSummary("Update profiles assigned to a staff user")
			.WithReqBodyValidation<UpdateStaffUserProfilesBody>()
			.WithPermission([AppPermissions.Staff.Users.UPDATE_PROFILES_FOR_STAFF]);

		return routes;
	}
}
