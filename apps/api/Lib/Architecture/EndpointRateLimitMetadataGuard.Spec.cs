using FluentAssertions;

using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Lib.RateLimiting;
using PublyApp.Api.Lib.Testing.Fixtures;

using Xunit;

namespace PublyApp.Api.Lib.Architecture;

public sealed class EndpointRateLimitMetadataGuardSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public EndpointRateLimitMetadataGuardSpec(
		ApiFixture fixture
	) {
		_fixture = fixture;
	}

	[Fact]
	public void ItShouldDiscoverRealRouteEndpointsToGuard() {
		var endpoints = GetRouteEndpoints();

		endpoints.Should().HaveCountGreaterThan(
			100,
			"the production route map has more than 100 endpoints"
		);
	}

	[Fact]
	public void ItShouldRequireARateLimitDispositionOnEveryEndpoint() {
		var offenders = new List<string>();

		foreach (var endpoint in GetRouteEndpoints()) {
			var namedPolicy = endpoint.Metadata
				.GetMetadata<EnableRateLimitingAttribute>();
			var globalOnly = endpoint.Metadata
				.GetMetadata<GlobalRateLimitOnlyMetadata>();
			var optOut = endpoint.Metadata
				.GetMetadata<RateLimitOptOutMetadata>();
			var disabled = endpoint.Metadata
				.GetMetadata<DisableRateLimitingAttribute>();

			if (namedPolicy is not null || globalOnly is not null) {
				continue;
			}

			if (
				optOut is not null
				&& !string.IsNullOrWhiteSpace(optOut.Reason)
				&& disabled is not null
			) {
				continue;
			}

			offenders.Add(
				$"{endpoint.RoutePattern.RawText} "
					+ $"({endpoint.DisplayName})"
			);
		}

		offenders.Should().BeEmpty(
			"every route must use a named policy, explicitly rely "
				+ "on the global floor, or opt out with a reason"
		);
	}

	[Fact]
	public void ItShouldObserveRealRouteGroupPolicyInheritance() {
		var endpoint = GetRouteEndpoints()
			.Single(route =>
				route.Metadata
					.GetMetadata<IEndpointNameMetadata>()
					?.EndpointName
					== "GetStaffUserById"
			);
		var policy = endpoint.Metadata
			.GetMetadata<EnableRateLimitingAttribute>();

		policy.Should().NotBeNull();
		Assert.NotNull(policy);
		policy.PolicyName.Should().Be(
			ApiRateLimitPolicies.AuthenticatedDefault
		);
	}

	private IReadOnlyList<RouteEndpoint> GetRouteEndpoints() {
		return _fixture.Factory.Services
			.GetRequiredService<EndpointDataSource>()
			.Endpoints
			.OfType<RouteEndpoint>()
			.ToArray();
	}
}
