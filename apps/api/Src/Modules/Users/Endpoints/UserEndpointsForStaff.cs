using MainApi.Src.Lib;
using MainApi.Src.Lib.Filters;
using MainApi.Src.Lib.Routes;
using MainApi.Src.Lib.Utils;
using MainApi.Src.Modules.Users.Handlers.Staff;

namespace MainApi.Src.Modules.Users.Endpoints;

public static class StaffUseEndpoints {
	public static IEndpointRouteBuilder MapUserEndpointsForStaff(this IEndpointRouteBuilder routes) {
		var group = routes.MapGroup(PathUtils.GetLastSegment(Routes.Users.Base))
			.WithTags("Staff Users");

		group.MapPost(
				PathUtils.GetLastSegment(Routes.Users.ForStaff.Create),
				CreateStaffUser.HandleCreateStaffUser
			)
			.WithName("CreateStaffUser")
			.WithSummary("Create a new staff user")
			.WithReqBodyValidation<CreateStaffUserBody>()
			.WithPermission([AppPermissions.Staff.Users.CREATE_FOR_STAFF]);

		group.MapGet(
				PathUtils.GetLastSegment(Routes.Users.ForStaff.GetById),
				GetStaffUserById.HandleGetStaffUserById
			)
			.WithName("GetStaffUserById")
			.WithSummary("Get a staff user by id")
			.WithPermission([AppPermissions.Staff.Users.GET_FOR_STAFF]);

		group.MapGet(
				PathUtils.GetLastSegment(Routes.Users.ForStaff.Find),
				FindStaffUsers.HandleFindStaffUsers
			)
			.WithName("FindStaffUsers")
			.WithSummary("Find staff users")
			.WithReqQueryValidation<FindStaffUsersQuery>()
			.WithPermission([AppPermissions.Staff.Users.LIST_FOR_STAFF]);

		group.MapPatch(
				PathUtils.GetLastSegment(Routes.Users.ForStaff.Update),
				UpdateStaffUser.HandleUpdateStaffUser
			)
			.WithName("UpdateStaffUser")
			.WithSummary("Update a staff user")
			.WithReqBodyValidation<UpdateStaffUserBody>()
			.WithPermission([AppPermissions.Staff.Users.UPDATE_FOR_STAFF]);

		return routes;
	}
}
