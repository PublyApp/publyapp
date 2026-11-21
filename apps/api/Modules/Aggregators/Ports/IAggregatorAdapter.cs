namespace PublyApp.Api.Modules.Aggregators.Ports;

/// <summary>What the generic Integrations UI shows about an aggregator: the ONLY source of its words.</summary>
public sealed record AggregatorMetadata(
	string DisplayName,
	string KeyHelpUrl,
	IReadOnlyList<string> SupportedPlatforms
);

public abstract record KeyCheck {
	public sealed record Valid() : KeyCheck;

	/// <summary>The aggregator refused the key. <paramref name="Cause"/> never contains it.</summary>
	public sealed record Rejected(string Cause) : KeyCheck;

	/// <summary>Transport, timeout, 429 or 5xx: nothing is known about the key.</summary>
	public sealed record Unreachable(string Cause) : KeyCheck;
}

/// <summary>
/// The one port to an aggregator. Slice 1 needs only the key check and the metadata;
/// listing accounts, publishing and webhooks join it in the slices that use them.
/// </summary>
public interface IAggregatorAdapter {
	AggregatorKind Kind { get; }

	AggregatorMetadata Describe();

	Task<KeyCheck> CheckKeyAsync(string apiKey, CancellationToken cancellationToken);
}
