using System.Text.Json;

using FluentValidation;

using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Extensions;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Validation;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Aggregators.Ports;
using PublyApp.Api.Modules.Aggregators.Services;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.AuditLogs.Services;

namespace PublyApp.Api.Modules.Aggregators.Handlers.Tenant;

public record SaveAggregatorConnectionBody {
	public required JsonElement ApiKey { get; init; }

	public string GetApiKey() {
		return this.ApiKey.GetValueAsString();
	}
}

public class SaveAggregatorConnectionBodyValidator : AbstractValidator<SaveAggregatorConnectionBody> {
	public const int ApiKeyMinLength = 8;
	public const int ApiKeyMaxLength = 512;

	public SaveAggregatorConnectionBodyValidator() {
		this.RuleFor(x => x.ApiKey)
			.MustBeRequiredStringWithLength(
				"ApiKey",
				SaveAggregatorConnectionBodyValidator.ApiKeyMinLength,
				SaveAggregatorConnectionBodyValidator.ApiKeyMaxLength
			);
	}
}

/// <summary>
/// Save or rotate the organisation's key (PUT). The key is checked with the aggregator
/// first and stored encrypted only when it works; it is never echoed, audited or logged.
/// </summary>
public sealed class SaveAggregatorConnectionForTenant {
	public static async Task<Results<
		Ok<AggregatorConnectionItem>,
		AppNotFoundHttpResult,
		AppProviderUnavailableHttpResult,
		AppValidationProblemHttpResult
	>> Handle(
		[FromRoute] string kind,
		[FromBody] SaveAggregatorConnectionBody body,
		[FromServices] IRequestAuthContext authContext,
		[FromServices] AggregatorConnectionService connectionService,
		[FromServices] IAuditLogService auditLogService,
		CancellationToken cancellationToken = default
	) {
		if (!Guid.TryParse(authContext.TenantId, out var tenantId)) {
			throw new InvalidOperationException($"{nameof(authContext.TenantId)} is not a GUID");
		}

		var account = authContext.GetRequiredTenantAccount();
		var parsedKind = AggregatorKindWire.Parse(kind);
		if (parsedKind is not { } aggregatorKind || !connectionService.IsKnown(aggregatorKind)) {
			return TypedProblems.NotFound("Aggregator not found", ResponseKeys.AggregatorNotFound);
		}

		var result = await connectionService.SaveAsync(
			tenantId, aggregatorKind, body.GetApiKey().Trim(), cancellationToken
		);

		if (result is SaveAggregatorKeyResult.Rejected rejected) {
			return TypedProblems.ValidationProblem(
				rejected.Cause,
				ResponseKeys.AggregatorKeyRefused,
				new Dictionary<string, string[]> { ["apiKey"] = [rejected.Cause] }
			);
		}

		if (result is not SaveAggregatorKeyResult.Saved saved) {
			return TypedProblems.ProviderUnavailable(
				((SaveAggregatorKeyResult.Unreachable)result).Cause,
				ResponseKeys.ProviderUnreachable
			);
		}

		await auditLogService.LogAsync(
			new CreateAuditLogArgs(
				UserId: account.UserId,
				Action: AuditActions.AggregatorConnectionSaved,
				TargetId: saved.Connection.Id,
				Details: new { TenantId = tenantId, Kind = kind, saved.Connection.KeyHint }
			),
			cancellationToken
		);

		return TypedResults.Ok(AggregatorConnectionItem.From(saved.Connection));
	}
}
