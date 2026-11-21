using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.Aggregators.Ports;
using PublyApp.Api.Modules.Aggregators.Services;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.AuditLogs.Services;

namespace PublyApp.Api.Modules.Aggregators.Handlers.Tenant;

/// <summary>Re-checks the stored key; a refused key answers 200 with status "invalid" and its cause.</summary>
public sealed class TestAggregatorConnectionForTenant {
	public static async Task<Results<
		Ok<AggregatorConnectionItem>,
		AppNotFoundHttpResult,
		AppProviderUnavailableHttpResult
	>> Handle(
		[FromRoute] string kind,
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

		var result = await connectionService.TestAsync(aggregatorKind, cancellationToken);
		if (result is TestAggregatorKeyResult.NotFound) {
			return TypedProblems.NotFound("No key saved for this aggregator", ResponseKeys.AggregatorConnectionNotFound);
		}

		if (result is not TestAggregatorKeyResult.Checked checkedResult) {
			return TypedProblems.ProviderUnavailable(
				((TestAggregatorKeyResult.Unreachable)result).Cause,
				ResponseKeys.ProviderUnreachable
			);
		}

		await auditLogService.LogAsync(
			new CreateAuditLogArgs(
				UserId: account.UserId,
				Action: AuditActions.AggregatorConnectionTested,
				TargetId: checkedResult.Connection.Id,
				Details: new { TenantId = tenantId, Kind = kind, Status = checkedResult.Connection.Status.ToString() }
			),
			cancellationToken
		);

		return TypedResults.Ok(AggregatorConnectionItem.From(checkedResult.Connection));
	}
}
