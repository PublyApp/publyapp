namespace PublyApp.Api.Modules.Aggregators.Ports;

/// <summary>
/// The aggregators we can route publications through. Stored numerically; validated in
/// code (no DB check), so a second aggregator never widens a constraint. The wire name
/// is the only place a kind is spelled out for clients.
/// </summary>
public enum AggregatorKind {
	Zernio = 1,
}

public static class AggregatorKindWire {
	public static string Format(AggregatorKind kind) {
		return kind switch {
			AggregatorKind.Zernio => "zernio",
			_ => throw new ArgumentOutOfRangeException(nameof(kind), kind, "Unhandled AggregatorKind"),
		};
	}

	public static AggregatorKind? Parse(string? wire) {
		foreach (var kind in Enum.GetValues<AggregatorKind>()) {
			if (string.Equals(AggregatorKindWire.Format(kind), wire, StringComparison.Ordinal)) {
				return kind;
			}
		}

		return null;
	}
}
