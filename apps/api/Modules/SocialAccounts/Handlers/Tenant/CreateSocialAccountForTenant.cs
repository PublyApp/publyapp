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
using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.SocialAccounts.Services;

namespace PublyApp.Api.Modules.SocialAccounts.Handlers.Tenant;

public record ConnectSocialAccountBody {
	public required JsonElement Identifier { get; init; }
	public required JsonElement AppPassword { get; init; }

	public string GetIdentifier() {
		return Identifier.GetValueAsString();
	}

	public string GetAppPassword() {
		return AppPassword.GetValueAsString();
	}
}

public class ConnectSocialAccountBodyValidator
	: AbstractValidator<ConnectSocialAccountBody> {
	public const int IdentifierMaxLength = 320;
	public const int AppPasswordMaxLength = 128;
	public const int AppPasswordMinLength = 8;

	public ConnectSocialAccountBodyValidator() {
		RuleFor(x => x.Identifier)
			.MustBeRequiredStringWithLength("Identifier", 1, IdentifierMaxLength);

		RuleFor(x => x.AppPassword)
			.MustBeRequiredStringWithLength(
				"AppPassword", AppPasswordMinLength, AppPasswordMaxLength
			);
	}
}

public record SocialAccountCreated {
	public required Guid Id { get; init; }
	public required string Provider { get; init; }
	public required string ExternalAccountId { get; init; }
	public required string DisplayHandle { get; init; }
	public required SocialAccountContractStatus Status { get; init; }
	public required string CredentialType { get; init; }
	public required DateTime? LastSuccessAt { get; init; }
	public required string? LastError { get; init; }
	public required IReadOnlyList<Guid> ProjectIds { get; init; }
}

public sealed class CreateSocialAccountForTenant {
	public static async Task<Results<
		Created<SocialAccountCreated>,
		AppConflictHttpResult,
		AppProviderUnavailableHttpResult,
		AppValidationProblemHttpResult
	>> Handle(
		[FromBody] ConnectSocialAccountBody body,
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

		// Parsing-sensitive getters are cached in locals (PUBLY0006).
		var identifier = body.GetIdentifier().Trim();
		var appPassword = body.GetAppPassword();

		var serviceResult = await socialAccountService.ConnectForTenantAsync(
			tenantId,
			identifier,
			appPassword,
			cancellationToken
		);

		if (serviceResult is ConnectSocialAccountResult.Refused refused) {
			// Nothing was stored — surface Bluesky's sanitised cause only.
			return TypedProblems.ValidationProblem(
				refused.Reason,
				ResponseKeys.CredentialsRefused,
				new Dictionary<string, string[]> {
					["appPassword"] = [refused.Reason],
				}
			);
		}

		if (serviceResult is ConnectSocialAccountResult.Unreachable) {
			return TypedProblems.ProviderUnavailable(
				"Bluesky could not be reached. Nothing was stored; try again shortly.",
				ResponseKeys.ProviderUnreachable
			);
		}

		if (serviceResult is ConnectSocialAccountResult.Connected connected) {
			var item = SocialAccountService.ToListItem(connected.Account);

			await auditLogService.LogAsync(
				new CreateAuditLogArgs(
					UserId: account.UserId,
					Action: AuditActions.SocialAccountConnected,
					TargetId: item.Id,
					Details: new {
						TenantId = tenantId,
						item.DisplayHandle,
						item.ExternalAccountId,
						AlreadyConnected = connected.AlreadyConnected,
					}
				),
				cancellationToken
			);

			return TypedResults.Created(
				(string?)null,
				new SocialAccountCreated {
					Id = item.Id,
					Provider = item.Provider,
					ExternalAccountId = item.ExternalAccountId,
					DisplayHandle = item.DisplayHandle,
					Status = item.Status,
					CredentialType = item.CredentialType,
					LastSuccessAt = item.LastSuccessAt,
					LastError = item.LastError,
					ProjectIds = item.ProjectIds,
				}
			);
		}

		throw new InvalidOperationException(
			"Unhandled result type"
		);
	}
}
