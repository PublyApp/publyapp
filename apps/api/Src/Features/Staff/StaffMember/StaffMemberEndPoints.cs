using MainApi.Src.Features.Staff.StaffMember.Handlers;
using MainApi.Src.Lib;
using MainApi.Src.Lib.Filters;
using MainApi.Src.Lib.Utils;
using MainApi.Src.Lib.Extensions;

namespace MainApi.Src.Features.Staff.StaffMember;

public static class StaffMemberEndPoints {
	public static IEndpointRouteBuilder MapStaffMemberEndPoints(this IEndpointRouteBuilder routes) {
		var group = routes.MapGroup(PathUtils.GetLastSegment(RoutePath.Staff.StaffMember.Root))
			.WithTags("Staff Members")
			.WithOpenApi();

		group.MapPost(
			PathUtils.GetLastSegment(RoutePath.Staff.StaffMember.Create),
			CreateStaffMember.HandleCreateStaffMember
		)
			.WithName("CreateStaffMember")
			.WithSummary("Create a new staff member")
			.WithReqBodyValidation<CreateStaffMemberBody>()
			.WithPermission([PermissionEnum.Staff.CAN_CREATE_STAFF_MEMBER])
			.ProducesApiResponses(StatusCodes.Status500InternalServerError);

		group.MapGet(
			PathUtils.GetLastSegment(RoutePath.Staff.StaffMember.GetById),
			GetStaffMemberById.HandleGetStaffMemberById
		)
			.WithName("GetStaffMemberById")
			.WithSummary("Get a staff member by id")
			.WithPermission([PermissionEnum.Staff.CAN_GET_STAFF_MEMBER])
			.ProducesApiResponses(StatusCodes.Status500InternalServerError);

		group.MapGet(
			PathUtils.GetLastSegment(RoutePath.Staff.StaffMember.Find),
			FindStaffMembers.HandleFindStaffMembers
		)
			.WithName("FindStaffMembers")
			.WithSummary("Find staff members")
			.WithReqQueryValidation<FindStaffMembersQuery>()
			.WithPermission([PermissionEnum.Staff.CAN_LIST_STAFF_MEMBERS])
			.ProducesApiResponses(StatusCodes.Status500InternalServerError);

		group.MapPatch(
			PathUtils.GetLastSegment(RoutePath.Staff.StaffMember.Update),
			UpdateStaffMember.HandleUpdateStaffMember
		)
			.WithName("UpdateStaffMember")
			.WithSummary("Update a staff member")
			.WithReqBodyValidation<UpdateStaffMemberBody>()
			.WithPermission([PermissionEnum.Staff.CAN_UPDATE_STAFF_MEMBER])
			.ProducesApiResponses(StatusCodes.Status500InternalServerError);

		return routes;
	}
}
