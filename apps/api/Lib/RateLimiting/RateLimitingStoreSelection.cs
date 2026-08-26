namespace PublyApp.Api.Lib.RateLimiting;

public enum RateLimitCounterStoreKind {
	Postgres,
	Memory,
}

/// <summary>
/// Parses RATE_LIMIT_COUNTER_STORE and registers the matching
/// <see cref="IRateLimitCounterStore"/>. Optional variable, default
/// <c>postgres</c>: scaling to a second replica without reading docs still yields
/// one fleet-wide budget per partition, closing the silent-regression trap the
/// lane brief names. <c>memory</c> is the explicit operator escape hatch.
/// </summary>
public static class RateLimitCounterStoreSelection {
	public const string VariableName =
		"RATE_LIMIT_COUNTER_STORE";

	public static RateLimitCounterStoreKind FromEnvironment(
		AppEnvironment environment
	) {
		return Parse(environment.RATE_LIMIT_COUNTER_STORE);
	}

	public static RateLimitCounterStoreKind Parse(string value) {
		if (
			value.Equals(
				"postgres",
				StringComparison.OrdinalIgnoreCase
			)
		) {
			return RateLimitCounterStoreKind.Postgres;
		}

		if (
			value.Equals(
				"memory",
				StringComparison.OrdinalIgnoreCase
			)
		) {
			return RateLimitCounterStoreKind.Memory;
		}

		throw new InvalidOperationException(
			$"Environment variable '{VariableName}' must be "
				+ "'postgres' or 'memory', got '" + value + "'"
		);
	}
}

internal static class RateLimitCounterStoreRegistration {
	public static IServiceCollection AddRateLimitCounterStore(
		this IServiceCollection services,
		RateLimitCounterStoreKind kind
	) {
		switch (kind) {
			case RateLimitCounterStoreKind.Memory:
				services.AddSingleton<
					IRateLimitCounterStore,
					MemoryRateLimitCounterStore
				>();
				break;
			case RateLimitCounterStoreKind.Postgres:
			default:
				services.AddSingleton<
					IRateLimitCounterStore,
					PostgresRateLimitCounterStore
				>();
				break;
		}

		return services;
	}
}
