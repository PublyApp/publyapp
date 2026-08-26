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
