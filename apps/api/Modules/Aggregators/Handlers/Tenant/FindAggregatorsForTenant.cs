using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

using PublyApp.Api.Modules.Aggregators.Entities;
using PublyApp.Api.Modules.Aggregators.Ports;
using PublyApp.Api.Modules.Aggregators.Services;

namespace PublyApp.Api.Modules.Aggregators.Handlers.Tenant;

/// <summary>The caller's key for one aggregator: only the last 4 characters, never the key.</summary>
public sealed record AggregatorConnectionItem(
	string Status,
	string KeyHint,
	DateTime? LastCheckedAt,
	string? LastError
) {
	public static AggregatorConnectionItem From(AggregatorConnection connection) {
		return new AggregatorConnectionItem(
			connection.Status == AggregatorConnectionStatus.Active ? "active" : "invalid",
			connection.KeyHint,
			connection.LastCheckedAt,
			connection.LastError
		);
	}
}

public sealed record AggregatorItem(
	string Kind,
	string DisplayName,
	string KeyHelpUrl,
	IReadOnlyList<string> SupportedPlatforms,
	AggregatorConnectionItem? Connection
);

public sealed class FindAggregatorsForTenantResponse {
	public required IReadOnlyList<AggregatorItem> Aggregators { get; init; }
}

/// <summary>The list the generic Integrations UI renders, from each adapter's own description.</summary>
public sealed class FindAggregatorsForTenant {
	public static async Task<Ok<FindAggregatorsForTenantResponse>> Handle(
		[FromServices] AggregatorConnectionService connectionService,
		CancellationToken cancellationToken = default
	) {
		var items = await connectionService.FindAsync(cancellationToken);
		return TypedResults.Ok(new FindAggregatorsForTenantResponse {
			Aggregators = [.. items.Select(item => new AggregatorItem(
				AggregatorKindWire.Format(item.Kind),
				item.Metadata.DisplayName,
				item.Metadata.KeyHelpUrl,
				item.Metadata.SupportedPlatforms,
				item.Connection is null ? null : AggregatorConnectionItem.From(item.Connection)
			))],
		});
	}
}
