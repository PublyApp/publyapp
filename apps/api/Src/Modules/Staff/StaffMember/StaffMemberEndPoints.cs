using MainApi.Src.Lib;
using MainApi.Src.Lib.Extensions;
using MainApi.Src.Lib.Filters;
using MainApi.Src.Lib.Utils;
using MainApi.Src.Modules.Staff.StaffMember.Handlers;

namespace MainApi.Src.Modules.Staff.StaffMember;

public static class StaffMemberEndpoints {
	public static IEndpointRouteBuilder MapStaffMemberEndpoints(this IEndpointRouteBuilder routes) {
		var group = routes.MapGroup(PathUtils.GetLastSegment(RoutePath.Staff.StaffMember.Root))
			.WithTags("Staff Members");

		group.MapPost(
			PathUtils.GetLastSegment(RoutePath.Staff.StaffMember.Create),
			CreateStaffMember.HandleCreateStaffMember
		)
			.WithName("CreateStaffMember")
			.WithSummary("Create a new staff member")
			.WithReqBodyValidation<CreateStaffMemberBody>()
			.WithPermission([AppPermissions.Staff.StaffMembers.CREATE])
			.ProducesApiResponses(StatusCodes.Status500InternalServerError);

		group.MapGet(
			PathUtils.GetLastSegment(RoutePath.Staff.StaffMember.GetById),
			GetStaffMemberById.HandleGetStaffMemberById
		)
			.WithName("GetStaffMemberById")
			.WithSummary("Get a staff member by id")
			.WithPermission([AppPermissions.Staff.StaffMembers.GET])
			.ProducesApiResponses(StatusCodes.Status500InternalServerError);

		group.MapGet(
			PathUtils.GetLastSegment(RoutePath.Staff.StaffMember.Find),
			FindStaffMembers.HandleFindStaffMembers
		)
			.WithName("FindStaffMembers")
			.WithSummary("Find staff members")
			.WithReqQueryValidation<FindStaffMembersQuery>()
			.WithPermission([AppPermissions.Staff.StaffMembers.LIST])
			.ProducesApiResponses(StatusCodes.Status500InternalServerError);

		group.MapPatch(
			PathUtils.GetLastSegment(RoutePath.Staff.StaffMember.Update),
			UpdateStaffMember.HandleUpdateStaffMember
		)
			.WithName("UpdateStaffMember")
			.WithSummary("Update a staff member")
			.WithReqBodyValidation<UpdateStaffMemberBody>()
			.WithPermission([AppPermissions.Staff.StaffMembers.UPDATE])
			.ProducesApiResponses(StatusCodes.Status500InternalServerError);

		return routes;
	}
}
