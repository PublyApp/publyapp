using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Filters;
using PublyApp.Api.Lib.RateLimiting;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Modules.Dashboard.Handlers.Staff;

namespace PublyApp.Api.Modules.Dashboard.Endpoints;

public static class DashboardEndpointsForStaff {
	public static IEndpointRouteBuilder
		MapDashboardEndpointsForStaff(
		this IEndpointRouteBuilder routes
	) {
		var group = routes
			.MapGroup(
				Routes.Dashboard.ForStaff.Root
			)
			.RequireRateLimiting(
				ApiRateLimitPolicies.AuthenticatedDefault
			)
			.WithTags("Staff Dashboard")
			.WithPermission([
				AppPermissions.Staff.AuditLogs.LIST
			]);

		group.MapGet(
				Routes.Dashboard.ForStaff.Series,
				GetDashboardSeriesForStaff.Handle
			)
			.WithName("GetDashboardSeries")
			.RequireRateLimiting(
				ApiRateLimitPolicies.HeavySearchList
			)
			.WithSummary(
				"Get a daily staff dashboard series"
			)
			.WithReqQueryValidation<
				GetDashboardSeriesForStaffQuery>();

		group.MapGet(
				Routes.Dashboard.ForStaff.TopOrganisations,
				FindTopOrganisationsForStaff.Handle
			)
			.WithName("FindTopOrganisations")
			.RequireRateLimiting(
				ApiRateLimitPolicies.HeavySearchList
			)
			.WithSummary(
				"Rank organisations by audit events"
				+ " in a window"
			)
			.WithReqQueryValidation<
				FindTopOrganisationsForStaffQuery>();

		return routes;
	}
}
