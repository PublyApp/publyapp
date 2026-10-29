using System.Text.Json;

using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Extensions;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Validation;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.AuditLogs.Services;
using PublyApp.Api.Modules.Publishing.Services;
using PublyApp.Api.Modules.SocialAccounts.Providers.Mastodon;
using PublyApp.Api.Modules.SocialAccounts.Services;

namespace PublyApp.Api.Modules.SocialAccounts.Handlers.Tenant;

public record CompleteMastodonConnectBody {
	public required JsonElement Code { get; init; }
	public required JsonElement State { get; init; }

	public string GetCode() {
		return this.Code.GetValueAsString();
	}

	public string GetState() {
		return this.State.GetValueAsString();
	}
}

public class CompleteMastodonConnectBodyValidator : AbstractValidator<CompleteMastodonConnectBody> {
	public CompleteMastodonConnectBodyValidator() {
		this.RuleFor(x => x.Code).MustBeRequiredStringWithLength("Code", 1, 2048);
		this.RuleFor(x => x.State).MustBeRequiredStringWithLength("State", 1, 256);
	}
}

public sealed class CompleteMastodonConnectForTenant {
	public static async Task<Results<
		Ok<SocialAccountCreated>,
		AppProviderUnavailableHttpResult,
		AppValidationProblemHttpResult
	>> Handle(
		[FromBody] CompleteMastodonConnectBody body,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] MastodonOAuthService oauthService,
		[FromServices] IAuditLogService auditLogService,
		[FromServices] IPublicationQueueService publicationQueueService,
		[FromServices] IPublicationStatusTransitionService transitions,
		CancellationToken cancellationToken = default
	) {
		if (!Guid.TryParse(authContext.TenantId, out var tenantId)) {
			throw new InvalidOperationException($"{nameof(authContext.TenantId)} is not a GUID");
		}

		var account = authContext.GetRequiredTenantAccount();

		var code = body.GetCode();
		var state = body.GetState();
		var result = await oauthService.CompleteAsync(tenantId, account.UserId, code, state, cancellationToken);

		if (result is CompleteMastodonConnectResult.InvalidState) {
			const string reason = "This authorization link is invalid, expired or was already used. Start the connection again.";
			return TypedProblems.ValidationProblem(
				reason,
				ResponseKeys.MastodonOauthStateInvalid,
				new Dictionary<string, string[]> { ["state"] = [reason] }
			);
		}

		if (result is CompleteMastodonConnectResult.Refused refused) {
			return TypedProblems.ValidationProblem(
				refused.Reason,
				ResponseKeys.MastodonAuthorizationRefused,
				new Dictionary<string, string[]> { ["code"] = [refused.Reason] }
			);
		}

		if (result is CompleteMastodonConnectResult.Connected connected) {
			var item = SocialAccountService.ToListItem(connected.Account);
			if (connected.WasKnown) {
				// Same resume rules as a Bluesky reconnect.
				await ReconnectSocialAccountForTenant.ResumeQueueAsync(
					publicationQueueService, transitions, tenantId, item.Id, cancellationToken
				);
			}

			await auditLogService.LogAsync(
				new CreateAuditLogArgs(
					UserId: account.UserId,
					Action: connected.WasKnown
						? AuditActions.SocialAccountReconnected
						: AuditActions.SocialAccountConnected,
					TargetId: item.Id,
					Details: new {
						TenantId = tenantId,
						item.DisplayHandle,
						item.ExternalAccountId,
					}
				),
				cancellationToken
			);

			return TypedResults.Ok(new SocialAccountCreated {
				Id = item.Id,
				Provider = item.Provider,
				ExternalAccountId = item.ExternalAccountId,
				DisplayHandle = item.DisplayHandle,
				Status = item.Status,
				CredentialType = item.CredentialType,
				LastSuccessAt = item.LastSuccessAt,
				LastError = item.LastError,
				ProjectIds = item.ProjectIds,
			});
		}

		return TypedProblems.ProviderUnavailable(
			"That server could not be reached. Nothing was stored; try again shortly.",
			ResponseKeys.ProviderUnreachable
		);
	}
}
