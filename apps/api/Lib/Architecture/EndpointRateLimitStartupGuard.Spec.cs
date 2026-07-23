using FluentAssertions;

using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.Routing;
using Microsoft.AspNetCore.Routing.Patterns;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Lib.RateLimiting;
using PublyApp.Api.Lib.Testing.Fixtures;

using Xunit;

namespace PublyApp.Api.Lib.Architecture;

public sealed class EndpointRateLimitStartupGuardSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public EndpointRateLimitStartupGuardSpec(
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
		var act = () =>
			EndpointRateLimitStartupGuard.Validate(
				GetRouteEndpoints()
			);

		act.Should().NotThrow(
			"every route must have a valid rate-limit disposition"
		);
	}

	[Fact]
	public void ItShouldRejectAnUnknownNamedPolicyInTheRuntimeGuard() {
		var builder = new RouteEndpointBuilder(
			_ => Task.CompletedTask,
			RoutePatternFactory.Parse("/unknown-policy"),
			0
		);
		builder.Metadata.Add(
			new EnableRateLimitingAttribute(
				"authenitcated-default"
			)
		);

		EndpointRateLimitStartupGuard
			.HasValidDisposition(builder.Build()).Should()
			.BeFalse();
	}

	[Fact]
	public void
	ItShouldRejectDisableOverridingAnInheritedNamedPolicyInTheRuntimeGuard() {
		var builder = new RouteEndpointBuilder(
			_ => Task.CompletedTask,
			RoutePatternFactory.Parse("/disabled-policy"),
			0
		);
		builder.Metadata.Add(
			new EnableRateLimitingAttribute(
				ApiRateLimitPolicies.AuthenticatedDefault
			)
		);
		builder.Metadata.Add(
			new DisableRateLimitingAttribute()
		);

		EndpointRateLimitStartupGuard
			.HasValidDisposition(builder.Build()).Should()
			.BeFalse();
	}

	[Fact]
	public void
	ItShouldFailStartupForAnEndpointWithoutADisposition() {
		var builder = new RouteEndpointBuilder(
			_ => Task.CompletedTask,
			RoutePatternFactory.Parse("/unprotected"),
			0
		);

		var act = () =>
			EndpointRateLimitStartupGuard.Validate([
				builder.Build(),
			]);

		act.Should().Throw<InvalidOperationException>()
			.WithMessage(
				"*Rate-limit startup guard*"
					+ "*/unprotected*"
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
