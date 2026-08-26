using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.AuditLogs.Services;
using PublyApp.Api.Modules.Publishing.Services;
using PublyApp.Api.Modules.SocialAccounts.Services;

namespace PublyApp.Api.Modules.SocialAccounts.Handlers.Tenant;

public sealed class DisconnectSocialAccountForTenant {
	public static async Task<Results<
		Ok<ApiResponse>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult
	>> Handle(
		[FromRoute] string socialAccountId,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] SocialAccountService socialAccountService,
		[FromServices] IAuditLogService auditLogService,
		[FromServices] IPublicationQueueService publicationQueueService,
		[FromServices] IPublicationStatusTransitionService transitions,
		CancellationToken cancellationToken = default
	) {
		if (!Guid.TryParse(authContext.TenantId, out var tenantId)) {
			throw new InvalidOperationException(
				$"{nameof(authContext.TenantId)} is not a GUID"
			);
		}

		var account = authContext.AccountTenant;
		if (account is null) {
			throw new InvalidOperationException(
				"Tenant account not found in auth context. "
				+ "Ensure the endpoint has "
				+ ".WithTenantPermission(...) middleware."
			);
		}

		if (!Guid.TryParse(socialAccountId, out var accountId)) {
			return TypedProblems.BadRequest(
				"Invalid socialAccountId",
				ResponseKeys.MalformedId
			);
		}

		var serviceResult = await socialAccountService.DisconnectForTenantAsync(
			tenantId, accountId, cancellationToken
		);

		if (serviceResult is DisconnectSocialAccountResult.NotFound) {
			return TypedProblems.NotFound(
				"Social account not found",
				ResponseKeys.SocialAccountNotFound
			);
		}

		if (serviceResult is DisconnectSocialAccountResult.Disconnected disconnected) {
			// C4 pause-on-disconnect: every non-terminal row of the account stops —
			// future and past instants alike — with a plain-word stored cause.
			// Loop of single transactions is acceptable at banner scale.
			var queueRows = await publicationQueueService.FindNonTerminalForAccountAsync(
				new FindPublicationsOfAccountArgs(tenantId, accountId),
				cancellationToken
			);
			foreach (var (publicationId, _, _) in queueRows) {
				await transitions.MarkPausedAsync(
					new MarkPublicationPausedArgs(
						publicationId,
						tenantId,
						"its social account was disconnected"
					),
					cancellationToken
				);
			}

			await auditLogService.LogAsync(
				new CreateAuditLogArgs(
					UserId: account.UserId,
					Action: AuditActions.SocialAccountDisconnected,
					TargetId: accountId,
					Details: new {
						TenantId = tenantId,
						disconnected.Account.DisplayHandle,
						disconnected.Account.ExternalAccountId,
					}
				),
				cancellationToken
			);

			return TypedResults.Ok(
				ApiResponse.Create(
					"Social account disconnected and stored secret erased",
					ResponseKeys.SocialAccountDisconnectedSuccess
				)
			);
		}

		throw new InvalidOperationException(
			"Unhandled result type"
		);
	}
}
