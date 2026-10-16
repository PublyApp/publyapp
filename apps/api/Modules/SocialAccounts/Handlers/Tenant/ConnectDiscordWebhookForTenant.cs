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
using PublyApp.Api.Modules.SocialAccounts.Providers.Discord;
using PublyApp.Api.Modules.SocialAccounts.Services;

namespace PublyApp.Api.Modules.SocialAccounts.Handlers.Tenant;

public record ConnectDiscordWebhookBody {
	public required JsonElement WebhookUrl { get; init; }

	public string GetWebhookUrl() {
		return this.WebhookUrl.GetValueAsString();
	}
}

public class ConnectDiscordWebhookBodyValidator : AbstractValidator<ConnectDiscordWebhookBody> {
	public ConnectDiscordWebhookBodyValidator() {
		this.RuleFor(x => x.WebhookUrl)
			.MustBeRequiredStringWithLength("WebhookUrl", 1, DiscordWebhookUrl.MaxLength);
	}
}

/// <summary>
/// Connect (or reconnect) a Discord webhook (#2175). The pasted URL is a secret: it is
/// validated, verified with a GET and stored encrypted, and is never echoed back, put
/// in a problem, an audit row or a log.
/// </summary>
public sealed class ConnectDiscordWebhookForTenant {
	public static async Task<Results<
		Ok<SocialAccountCreated>,
		AppProviderUnavailableHttpResult,
		AppValidationProblemHttpResult
	>> Handle(
		[FromBody] ConnectDiscordWebhookBody body,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] DiscordWebhookConnectService connectService,
		[FromServices] IAuditLogService auditLogService,
		[FromServices] IPublicationQueueService publicationQueueService,
		[FromServices] IPublicationStatusTransitionService transitions,
		CancellationToken cancellationToken = default
	) {
		if (!Guid.TryParse(authContext.TenantId, out var tenantId)) {
			throw new InvalidOperationException($"{nameof(authContext.TenantId)} is not a GUID");
		}

		var account = authContext.AccountTenant;
		if (account is null) {
			throw new InvalidOperationException(
				"Tenant account not found in auth context. Ensure the endpoint has .WithTenantPermission(...) middleware."
			);
		}

		var result = await connectService.ConnectAsync(tenantId, body.GetWebhookUrl(), cancellationToken);

		if (result is ConnectDiscordWebhookResult.InvalidUrl) {
			const string reason = "Paste a Discord webhook URL, like https://discord.com/api/webhooks/123/abc.";
			return TypedProblems.ValidationProblem(
				reason,
				ResponseKeys.DiscordWebhookInvalid,
				new Dictionary<string, string[]> { ["webhookUrl"] = [reason] }
			);
		}

		if (result is ConnectDiscordWebhookResult.Refused) {
			const string reason = "Discord does not recognise this webhook; it may have been deleted. Create a new one and paste it.";
			return TypedProblems.ValidationProblem(
				reason,
				ResponseKeys.DiscordWebhookRefused,
				new Dictionary<string, string[]> { ["webhookUrl"] = [reason] }
			);
		}

		if (result is not ConnectDiscordWebhookResult.Connected connected) {
			return TypedProblems.ProviderUnavailable(
				"Discord could not be reached. Nothing was stored; try again shortly.",
				ResponseKeys.ProviderUnreachable
			);
		}

		var item = SocialAccountService.ToListItem(connected.Account);
		if (connected.WasKnown) {
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
}
