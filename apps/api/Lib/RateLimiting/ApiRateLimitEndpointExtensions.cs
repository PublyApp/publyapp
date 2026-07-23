namespace PublyApp.Api.Lib.RateLimiting;

public sealed record GlobalRateLimitOnlyMetadata;

public sealed record RateLimitOptOutMetadata(
	string Reason
);

public static class ApiRateLimitEndpointExtensions {
	public static TBuilder WithGlobalRateLimitOnly<
		TBuilder
	>(
		this TBuilder builder
	) where TBuilder : IEndpointConventionBuilder {
		builder.WithMetadata(
			new GlobalRateLimitOnlyMetadata()
		);
		return builder;
	}

	public static TBuilder WithRateLimitOptOut<
		TBuilder
	>(
		this TBuilder builder,
		string reason
	) where TBuilder : IEndpointConventionBuilder {
		if (string.IsNullOrWhiteSpace(reason)) {
			throw new ArgumentException(
				"Rate-limit opt-out reason is required",
				nameof(reason)
			);
		}

		builder.WithMetadata(
			new RateLimitOptOutMetadata(
				reason.Trim()
			)
		);
		builder.DisableRateLimiting();
		return builder;
	}
}
