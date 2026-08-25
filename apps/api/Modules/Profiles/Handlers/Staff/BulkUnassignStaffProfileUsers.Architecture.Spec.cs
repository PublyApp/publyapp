using FluentAssertions;

using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Lib.Filters;
using PublyApp.Api.Lib.RateLimiting;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Utils;

using Xunit;

namespace PublyApp.Api.Modules.Profiles.Handlers.Staff;

/// <summary>
/// Module-convention architecture spec for the staff profile-users
/// bulk-unassign surface (#1388). The endpoint must stay wired exactly the way
/// every other bulk mutation in the API is: same route family as the module's
/// other user-assignment routes, explicit permission metadata, the shared
/// bulk-operation rate-limit policy, and a POST-only contract. These facts read
/// live route <see cref="EndpointDataSource"/> metadata via the integration
/// fixture — the same metadata the runtime uses when routing a request — so a
/// regression in any of them fails here with the concrete offender instead of
/// surfacing in review.
/// </summary>
public sealed class BulkUnassignStaffProfileUsersArchitectureSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public BulkUnassignStaffProfileUsersArchitectureSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	private IReadOnlyList<RouteEndpoint> GetRouteEndpoints() {
		return _fixture.Factory.Services
			.GetRequiredService<EndpointDataSource>()
			.Endpoints
			.OfType<RouteEndpoint>()
			.ToList();
	}

	private static string BuildEndpointKey(RouteEndpoint endpoint) {
		var httpMethodMetadata = endpoint.Metadata
			.OfType<HttpMethodMetadata>()
			.FirstOrDefault();

		var method = httpMethodMetadata?.HttpMethods.FirstOrDefault() ?? "ANY";
		return $"{method} {endpoint.RoutePattern.RawText}";
	}

	[Fact]
	public void ItShouldExposeExactlyOneBulkUnassignRouteInTheStaffProfilesGroup() {
		var expectedPath = PathUtils.Join(
			Routes.Staff.Root,
			Routes.Profiles.ForStaff.Root,
			Routes.Profiles.ForStaff.Users.Unassign
		);

		var matches = GetRouteEndpoints()
			.Where(endpoint =>
				endpoint.RoutePattern.RawText?.EndsWith(
					"/{profileId}/users/unassign",
					StringComparison.Ordinal
				) is true
			)
			.ToList();

		_ = matches.Should().ContainSingle(
			endpoint => endpoint.RoutePattern.RawText == expectedPath,
			"the module owns exactly one bulk-unassign endpoint at {0}",
			expectedPath
		);
	}

	[Fact]
	public void ItShouldKeepTheBulkUnassignRoutePostOnly() {
		var expectedPath = PathUtils.Join(
			Routes.Staff.Root,
			Routes.Profiles.ForStaff.Root,
			Routes.Profiles.ForStaff.Users.Unassign
		);

		var methods = GetRouteEndpoints()
			.Where(endpoint => endpoint.RoutePattern.RawText == expectedPath)
			.SelectMany(endpoint =>
				endpoint.Metadata
					.OfType<HttpMethodMetadata>()
					.SelectMany(metadata => metadata.HttpMethods)
			)
			.ToList();

		_ = methods.Should().BeEquivalentTo(["POST"],
			"unassignment mutates membership; only POST is part of the contract"
		);
	}

	[Fact]
	public void ItShouldRequirePermissionMetadataOnBulkUnassign() {
		var expectedPath = PathUtils.Join(
			Routes.Staff.Root,
			Routes.Profiles.ForStaff.Root,
			Routes.Profiles.ForStaff.Users.Unassign
		);

		var endpoint = GetRouteEndpoints()
			.Single(candidate =>
				candidate.RoutePattern.RawText == expectedPath
				&& candidate.Metadata.OfType<HttpMethodMetadata>()
					.Any(metadata => metadata.HttpMethods.Contains("POST"))
			);

		// Mirrors UnassignStaffProfileUsers's UPDATE_FOR_STAFF permission: the
		// PermissionFilter attaches this marker at registration time, so its
		// presence proves permission enforcement did not silently drop off.
		_ = endpoint.Metadata
			.OfType<HasPermissionMetadata>()
			.Should()
			.NotBeEmpty(
				"{0} must declare .WithPermission(…) — an unprotected staff "
				+ "bulk mutation would fail the EndpointPermissionMetadataGuard",
				BuildEndpointKey(endpoint)
			);
	}

	[Fact]
	public void ItShouldUseTheSharedBulkOperationRateLimitPolicy() {
		var expectedPath = PathUtils.Join(
			Routes.Staff.Root,
			Routes.Profiles.ForStaff.Root,
			Routes.Profiles.ForStaff.Users.Unassign
		);

		var endpoint = GetRouteEndpoints()
			.Single(candidate =>
				candidate.RoutePattern.RawText == expectedPath
				&& candidate.Metadata.OfType<HttpMethodMetadata>()
					.Any(metadata => metadata.HttpMethods.Contains("POST"))
			);

		var policy = endpoint.Metadata
			.GetMetadata<EnableRateLimitingAttribute>();

		policy.Should().NotBeNull();
		Assert.NotNull(policy);
		policy.PolicyName.Should().Be(
			ApiRateLimitPolicies.BulkOperation,
			"bulk mutations share the bulk-operation policy like every other "
			+ "staff bulk endpoint (rate-limit guide)"
		);
	}
}
