using MainApi.Src.Lib;
using MainApi.Src.Lib.Filters;
using MainApi.Src.Lib.Routes;
using MainApi.Src.Modules.Users.Handlers.Staff;

namespace MainApi.Src.Modules.Users.Endpoints;

public static class UserEndpointsForStaff {
	public static IEndpointRouteBuilder MapUserEndpointsForStaff(this IEndpointRouteBuilder routes) {
		var group = routes.MapGroup(Routes.Users.ForStaff.Root)
			.WithTags("Staff Users");

		group.MapPost(
				Routes.Users.ForStaff.Create,
				CreateStaffUser.HandleCreateStaffUser
			)
			.WithName("CreateStaffUser")
			.WithSummary("Create a new staff user")
			.WithReqBodyValidation<CreateStaffUserBody>()
			.WithPermission([AppPermissions.Staff.Users.CREATE_FOR_STAFF]);

		group.MapGet(
				Routes.Users.ForStaff.GetById,
				GetStaffUserById.HandleGetStaffUserById
			)
			.WithName("GetStaffUserById")
			.WithSummary("Get a staff user by id")
			.WithPermission([AppPermissions.Staff.Users.GET_FOR_STAFF]);

		group.MapGet(
				Routes.Users.ForStaff.Find,
				FindStaffUsers.HandleFindStaffUsers
			)
			.WithName("FindStaffUsers")
			.WithSummary("Find staff users")
			.WithReqQueryValidation<FindStaffUsersQuery>()
			.WithPermission([AppPermissions.Staff.Users.LIST_FOR_STAFF]);

		group.MapPatch(
				Routes.Users.ForStaff.Update,
				UpdateStaffUser.HandleUpdateStaffUser
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
				UpdateStaffUserEmail.HandleUpdateStaffUserEmail
			)
			.WithName("UpdateStaffUserEmail")
			.WithSummary("Update a staff user's email")
			.WithReqBodyValidation<UpdateStaffUserEmailBody>()
			.WithPermission([AppPermissions.Staff.Users.UPDATE_EMAIL_FOR_STAFF]);

		group.MapPost(
				Routes.Users.ForStaff.Suspend,
				SuspendStaffUser.HandleSuspendStaffUser
			)
			.WithName("SuspendStaffUser")
			.WithSummary("Suspend a staff user")
			.WithPermission([AppPermissions.Staff.Users.SUSPEND_FOR_STAFF]);

		group.MapPost(
				Routes.Users.ForStaff.Reactivate,
				ReactivateStaffUser.HandleReactivateStaffUser
			)
			.WithName("ReactivateStaffUser")
			.WithSummary("Reactivate a staff user")
			.WithPermission([AppPermissions.Staff.Users.REACTIVATE_FOR_STAFF]);

		group.MapPost(
				Routes.Users.ForStaff.BulkSuspend,
				BulkSuspendStaffUsers.HandleBulkSuspendStaffUsers
			)
			.WithName("BulkSuspendStaffUsers")
			.WithSummary("Bulk suspend staff users")
			.WithReqBodyValidation<BulkSuspendStaffUsersBody>()
			.WithPermission([AppPermissions.Staff.Users.SUSPEND_FOR_STAFF]);

		group.MapPost(
				Routes.Users.ForStaff.BulkReactivate,
				BulkReactivateStaffUsers.HandleBulkReactivateStaffUsers
			)
			.WithName("BulkReactivateStaffUsers")
			.WithSummary("Bulk reactivate staff users")
			.WithReqBodyValidation<BulkReactivateStaffUsersBody>()
			.WithPermission([AppPermissions.Staff.Users.REACTIVATE_FOR_STAFF]);

		group.MapPost(
				Routes.Users.ForStaff.BulkDelete,
				BulkDeleteStaffUsers.HandleBulkDeleteStaffUsers
			)
			.WithName("BulkDeleteStaffUsers")
			.WithSummary("Bulk delete staff users")
			.WithReqBodyValidation<BulkDeleteStaffUsersBody>()
			.WithPermission([AppPermissions.Staff.Users.DELETE_FOR_STAFF]);

		group.MapDelete(
				Routes.Users.ForStaff.Delete,
				DeleteStaffUser.HandleDeleteStaffUser
			)
			.WithName("DeleteStaffUser")
			.WithSummary("Soft-delete a suspended staff user")
			.WithPermission([AppPermissions.Staff.Users.DELETE_FOR_STAFF]);

		group.MapGet(
				Routes.Users.ForStaff.Profiles.Get,
				GetStaffUserProfiles.HandleGetStaffUserProfiles
			)
			.WithName("GetStaffUserProfiles")
			.WithSummary("Get profiles assigned to a staff user")
			.WithPermission([AppPermissions.Staff.Users.GET_PROFILES_FOR_STAFF]);

		group.MapPut(
				Routes.Users.ForStaff.Profiles.Update,
				UpdateStaffUserProfiles.HandleUpdateStaffUserProfiles
			)
			.WithName("UpdateStaffUserProfiles")
			.WithSummary("Update profiles assigned to a staff user")
			.WithReqBodyValidation<UpdateStaffUserProfilesBody>()
			.WithPermission([AppPermissions.Staff.Users.UPDATE_PROFILES_FOR_STAFF]);

		return routes;
	}
}
