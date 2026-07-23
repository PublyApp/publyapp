using Microsoft.AspNetCore.RateLimiting;

namespace PublyApp.Api.Lib.RateLimiting;

public static class EndpointRateLimitStartupGuard {
	public static WebApplication
		ValidateEndpointRateLimitCoverage(
			this WebApplication app
		) {
		var endpoints = app.Services
			.GetRequiredService<EndpointDataSource>()
			.Endpoints;
		Validate(endpoints);
		return app;
	}

	internal static void Validate(
		IEnumerable<Endpoint> endpoints
	) {
		var offenders = endpoints
			.OfType<RouteEndpoint>()
			.Where(endpoint =>
				!HasValidDisposition(endpoint)
			)
			.Select(endpoint =>
				$"{endpoint.RoutePattern.RawText} "
					+ $"({endpoint.DisplayName})"
			)
			.ToArray();
		if (offenders.Length == 0) {
			return;
		}

		throw new InvalidOperationException(
			"Rate-limit startup guard rejected endpoints "
				+ "without a valid disposition:"
				+ Environment.NewLine
				+ string.Join(
					Environment.NewLine,
					offenders.Select(
						offender => $"- {offender}"
					)
				)
		);
	}

	internal static bool HasValidDisposition(
		Endpoint endpoint
	) {
		var disabled = endpoint.Metadata
			.GetMetadata<DisableRateLimitingAttribute>();
		if (disabled is not null) {
			var optOut = endpoint.Metadata
				.GetMetadata<RateLimitOptOutMetadata>();
			return optOut is not null
				&& !string.IsNullOrWhiteSpace(
					optOut.Reason
				);
		}

		var namedPolicy = endpoint.Metadata
			.GetMetadata<EnableRateLimitingAttribute>();
		if (namedPolicy is not null) {
			return ApiRateLimitPolicies.IsKnown(
					namedPolicy.PolicyName
				)
				|| AnonymousAuthRateLimitPolicies
					.IsKnown(namedPolicy.PolicyName);
		}

		return endpoint.Metadata
			.GetMetadata<GlobalRateLimitOnlyMetadata>()
			is not null;
	}
}
