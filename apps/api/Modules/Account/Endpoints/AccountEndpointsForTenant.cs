using PublyApp.Api.Lib.Filters;
using PublyApp.Api.Lib.RateLimiting;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Modules.Account.Handlers.Tenant;

namespace PublyApp.Api.Modules.Account.Endpoints;

public static class AccountEndpointsForTenant {
	public static IEndpointRouteBuilder MapAccountEndpointsForTenant(
		this IEndpointRouteBuilder routes
	) {
		var group = routes.MapGroup(Routes.Account.ForTenant.Root)
			.RequireRateLimiting(
				ApiRateLimitPolicies.AuthenticatedDefault
			)
			.WithTags("Account");

		group.MapGet(
			Routes.Account.ForTenant.Profile,
			GetAccountProfileForTenant.Handle
		)
			.WithName("GetAccountProfileForTenant")
			.WithSummary("Get the signed-in user's tenant-scoped profile");

		group.MapPatch(
			Routes.Account.ForTenant.UpdateProfile,
			UpdateAccountProfileForTenant.Handle
		)
			.WithName("UpdateAccountProfileForTenant")
			.WithSummary("Update the signed-in user's tenant-scoped profile")
			.WithReqBodyValidation<UpdateAccountProfileBody>();

		return routes;
	}
}
