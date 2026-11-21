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

/// <summary>Removes the key: the encrypted value is erased; no history is deleted.</summary>
public sealed class DeleteAggregatorConnectionForTenant {
	public static async Task<Results<Ok<ApiResponse>, AppNotFoundHttpResult>> Handle(
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

		if (!await connectionService.RemoveAsync(aggregatorKind, cancellationToken)) {
			return TypedProblems.NotFound("No key saved for this aggregator", ResponseKeys.AggregatorConnectionNotFound);
		}

		await auditLogService.LogAsync(
			new CreateAuditLogArgs(
				UserId: account.UserId,
				Action: AuditActions.AggregatorConnectionRemoved,
				TargetId: null,
				Details: new { TenantId = tenantId, Kind = kind }
			),
			cancellationToken
		);

		return TypedResults.Ok(
			ApiResponse.Create("Aggregator key removed", ResponseKeys.AggregatorConnectionRemovedSuccess)
		);
	}
}
