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
using PublyApp.Api.Modules.Publishing.Entities;
using PublyApp.Api.Modules.Publishing.Services;
using PublyApp.Api.Modules.SocialAccounts.Services;

namespace PublyApp.Api.Modules.SocialAccounts.Handlers.Tenant;

public record ReconnectSocialAccountBody {
	public required JsonElement AppPassword { get; init; }

	public string GetAppPassword() {
		return AppPassword.GetValueAsString();
	}
}

public class ReconnectSocialAccountBodyValidator
	: AbstractValidator<ReconnectSocialAccountBody> {
	public ReconnectSocialAccountBodyValidator() {
		RuleFor(x => x.AppPassword)
			.MustBeRequiredStringWithLength(
				"AppPassword",
				ConnectSocialAccountBodyValidator.AppPasswordMinLength,
				ConnectSocialAccountBodyValidator.AppPasswordMaxLength
			);
	}
}

public sealed class ReconnectSocialAccountForTenant {
	public static async Task<Results<
		Ok<SocialAccountCreated>,
		AppBadRequestHttpResult,
		AppNotFoundHttpResult,
		AppProviderUnavailableHttpResult,
		AppValidationProblemHttpResult
	>> Handle(
		[FromRoute] string socialAccountId,
		[FromBody] ReconnectSocialAccountBody body,
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

		var appPassword = body.GetAppPassword();

		var serviceResult = await socialAccountService.ReconnectForTenantAsync(
			tenantId,
			accountId,
			appPassword,
			cancellationToken
		);

		if (serviceResult is ReconnectSocialAccountResult.NotFound) {
			return TypedProblems.NotFound(
				"Social account not found",
				ResponseKeys.SocialAccountNotFound
			);
		}

		if (serviceResult is ReconnectSocialAccountResult.Refused refused) {
			return TypedProblems.ValidationProblem(
				refused.Reason,
				ResponseKeys.CredentialsRefused,
				new Dictionary<string, string[]> {
					["appPassword"] = [refused.Reason],
				}
			);
		}

		if (serviceResult is ReconnectSocialAccountResult.Unreachable) {
			return TypedProblems.ProviderUnavailable(
				"Bluesky could not be reached. The stored connection was left untouched.",
				ResponseKeys.ProviderUnreachable
			);
		}

		if (serviceResult is ReconnectSocialAccountResult.Reconnected reconnected) {
			var item = SocialAccountService.ToListItem(reconnected.Account);

			// C4 resume-on-reconnect: future-instant PAUSED rows return to Scheduled
			// keeping their original instant; past-due rows stay Paused with a cause
			// telling the user to pick a new time. Nothing late ever fires. Loop of
			// single transactions is acceptable at banner scale. Already-Scheduled
			// rows are left untouched — MarkScheduledAsync is exclusively the resume
			// move (see PublicationStatusTransitionService).
			var queueRows = await publicationQueueService.FindNonTerminalForAccountAsync(
				new FindPublicationsOfAccountArgs(tenantId, accountId),
				cancellationToken
			);
			foreach (var (publicationId, scheduledAtUtc, status) in queueRows) {
				if (status == PublicationStatus.Paused && scheduledAtUtc > DateTime.UtcNow) {
					await transitions.MarkScheduledAsync(
						new MarkPublicationScheduledArgs(publicationId, tenantId),
						cancellationToken
					);
				} else if (scheduledAtUtc <= DateTime.UtcNow) {
					// Past due (paused or scheduled): keep it stopped, refresh the
					// cause so the user knows to pick a new time. Never fires late.
					await transitions.MarkPausedAsync(
						new MarkPublicationPausedArgs(
							publicationId,
							tenantId,
							"its scheduled time passed while the account needed reconnection"
								+ "; choose a new time to publish it"
						),
						cancellationToken
					);
				}
				// Future scheduled rows are already correct — untouched.
			}

			await auditLogService.LogAsync(
				new CreateAuditLogArgs(
					UserId: account.UserId,
					Action: AuditActions.SocialAccountReconnected,
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

		throw new InvalidOperationException(
			"Unhandled result type"
		);
	}
}
