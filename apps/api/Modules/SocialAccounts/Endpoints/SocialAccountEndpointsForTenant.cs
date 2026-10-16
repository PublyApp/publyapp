using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Filters;
using PublyApp.Api.Lib.RateLimiting;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Modules.SocialAccounts.Handlers.Tenant;

namespace PublyApp.Api.Modules.SocialAccounts.Endpoints;

public static class SocialAccountEndpointsForTenant {
	public static IEndpointRouteBuilder MapSocialAccountEndpointsForTenant(
		this IEndpointRouteBuilder routes
	) {
		var group = routes.MapGroup(Routes.SocialAccounts.ForTenant.Root)
			.RequireRateLimiting(
				ApiRateLimitPolicies.AuthenticatedDefault
			)
			.WithTags("SocialAccounts");

		group.MapGet(
			Routes.SocialAccounts.ForTenant.Find,
			FindSocialAccountsForTenant.Handle
		)
			.WithName("FindSocialAccountsForTenant")
			.RequireRateLimiting(
				ApiRateLimitPolicies.HeavySearchList
			)
			.WithSummary("Find social accounts for the current tenant")
			.WithReqQueryValidation<FindSocialAccountsForTenantQuery>()
			.WithTenantPermission(
				[AppPermissions.Tenant.SocialAccounts.VIEW]
			);

		group.MapGet(
			Routes.SocialAccounts.ForTenant.FindNeedsReconnect,
			FindNeedsReconnectAccountsForTenant.Handle
		)
			.WithName("FindNeedsReconnectAccountsForTenant")
			.WithSummary("Accounts of the current tenant that need reconnection")
			.WithTenantPermission(
				[AppPermissions.Tenant.SocialAccounts.VIEW]
			);

		group.MapPost(
			Routes.SocialAccounts.ForTenant.Connect,
			CreateSocialAccountForTenant.Handle
		)
			.WithName("CreateSocialAccountForTenant")
			.RequireRateLimiting(ApiRateLimitPolicies.SocialConnect)
			.WithSummary("Connect a Bluesky account for the current tenant")
			.WithReqBodyValidation<ConnectSocialAccountBody>()
			.WithTenantPermission(
				[AppPermissions.Tenant.SocialAccounts.MANAGE]
			);

		group.MapPost(
			Routes.SocialAccounts.ForTenant.MastodonStart,
			StartMastodonConnectForTenant.Handle
		)
			.WithName("StartMastodonConnectForTenant")
			.RequireRateLimiting(ApiRateLimitPolicies.SocialConnect)
			.WithSummary("Start connecting a Mastodon account: returns the instance's authorize URL")
			.WithReqBodyValidation<StartMastodonConnectBody>()
			.WithTenantPermission(
				[AppPermissions.Tenant.SocialAccounts.MANAGE]
			);

		group.MapPost(
			Routes.SocialAccounts.ForTenant.MastodonCallback,
			CompleteMastodonConnectForTenant.Handle
		)
			.WithName("CompleteMastodonConnectForTenant")
			.RequireRateLimiting(ApiRateLimitPolicies.SocialConnect)
			.WithSummary("Finish connecting a Mastodon account with the code and state the instance returned")
			.WithReqBodyValidation<CompleteMastodonConnectBody>()
			.WithTenantPermission(
				[AppPermissions.Tenant.SocialAccounts.MANAGE]
			);

		group.MapPost(
			Routes.SocialAccounts.ForTenant.DiscordWebhook,
			ConnectDiscordWebhookForTenant.Handle
		)
			.WithName("ConnectDiscordWebhookForTenant")
			.RequireRateLimiting(ApiRateLimitPolicies.SocialConnect)
			.WithSummary("Connect a Discord webhook: verifies the pasted URL and stores it encrypted")
			.WithReqBodyValidation<ConnectDiscordWebhookBody>()
			.WithTenantPermission(
				[AppPermissions.Tenant.SocialAccounts.MANAGE]
			);

		group.MapPost(
			Routes.SocialAccounts.ForTenant.Reconnect,
			ReconnectSocialAccountForTenant.Handle
		)
			.WithName("ReconnectSocialAccountForTenant")
			.RequireRateLimiting(ApiRateLimitPolicies.SocialConnect)
			.WithSummary("Reconnect a Bluesky account with a new app password")
			.WithReqBodyValidation<ReconnectSocialAccountBody>()
			.WithTenantPermission(
				[AppPermissions.Tenant.SocialAccounts.MANAGE]
			);

		group.MapPost(
			Routes.SocialAccounts.ForTenant.Disconnect,
			DisconnectSocialAccountForTenant.Handle
		)
			.WithName("DisconnectSocialAccountForTenant")
			.WithSummary("Disconnect a social account and erase its stored secret")
			.WithTenantPermission(
				[AppPermissions.Tenant.SocialAccounts.MANAGE]
			);

		group.MapPut(
			Routes.SocialAccounts.ForTenant.SetProjects,
			SetSocialAccountProjectsForTenant.Handle
		)
			.WithName("SetSocialAccountProjectsForTenant")
			.WithSummary("Replace the project attachments of a social account")
			.WithReqBodyValidation<SetSocialAccountProjectsBody>()
			.WithTenantPermission(
				[AppPermissions.Tenant.SocialAccounts.MANAGE]
			);

		return routes;
	}
}
