using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Filters;
using PublyApp.Api.Lib.RateLimiting;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Modules.Jobs.Handlers.Staff;

namespace PublyApp.Api.Modules.Jobs.Endpoints;

public static class JobDeadLetterEndpointsForStaff {
	public static IEndpointRouteBuilder MapJobDeadLetterEndpointsForStaff(
		this IEndpointRouteBuilder routes
	) {
		var group = routes.MapGroup(Routes.Jobs.ForStaff.Root)
			.RequireRateLimiting(
				ApiRateLimitPolicies.AuthenticatedDefault
			)
			.WithTags("Staff Jobs");

		group.MapPost(
				Routes.Jobs.ForStaff.ResolveUnclassified,
				ResolveDeadLetterUnclassified.Handle
			)
			.WithName("ResolveDeadLetterUnclassified")
			.WithSummary("Confirm an unclassified dead-letter entry's external effects are absent")
			.WithReqBodyValidation<ResolveDeadLetterUnclassifiedBody>()
			.WithPermission([AppPermissions.Staff.Jobs.RESOLVE]);

		return routes;
	}
}
