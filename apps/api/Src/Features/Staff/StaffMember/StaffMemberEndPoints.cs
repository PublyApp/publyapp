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
			.Produces500ApiResponse();

		group.MapGet(
			PathUtils.GetLastSegment(RoutePath.Staff.StaffMember.GetById),
			GetStaffMemberById.HandleGetStaffMemberById
		)
			.WithName("GetStaffMemberById")
			.WithSummary("Get a staff member by id")
			.Produces500ApiResponse();

		group.MapGet(
			PathUtils.GetLastSegment(RoutePath.Staff.StaffMember.Find),
			FindStaffMembers.HandleFindStaffMembers
		)
			.WithName("FindStaffMembers")
			.WithSummary("Find staff members")
			.Produces500ApiResponse();

		return routes;
	}
}
