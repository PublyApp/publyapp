using FluentAssertions;

using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Lib.Testing.Fixtures;

using Xunit;

namespace PublyApp.Api.Lib.RateLimiting;

public sealed class EndpointRateLimitAssignmentsSpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public EndpointRateLimitAssignmentsSpec(
		ApiFixture fixture
	) {
		_fixture = fixture;
	}

	[Theory]
	[InlineData(
		"GetVerificationLink",
		AnonymousAuthRateLimitPolicies.PerIp
	)]
	[InlineData(
		"CheckEmailVerificationToken",
		AnonymousAuthRateLimitPolicies.PerIp
	)]
	[InlineData(
		"CheckResetPasswordToken",
		AnonymousAuthRateLimitPolicies.PerIp
	)]
	[InlineData(
		"GetActiveSystemNotices",
		ApiRateLimitPolicies.AnonymousOther
	)]
	[InlineData(
		"GetUserAuthData",
		ApiRateLimitPolicies.AuthenticatedDefault
	)]
	[InlineData(
		"FindAuditLogs",
		ApiRateLimitPolicies.HeavySearchList
	)]
	[InlineData(
		"BulkDeleteStaffUsers",
		ApiRateLimitPolicies.BulkOperation
	)]
	[InlineData(
		"BulkRemoveTenantUsersAsStaff",
		ApiRateLimitPolicies.TenantBulkOperation
	)]
	[InlineData(
		"CreateStaffInvitation",
		ApiRateLimitPolicies.EmailOperation
	)]
	[InlineData(
		"CreateStaffProfile",
		ApiRateLimitPolicies.EmailOperation
	)]
	[InlineData(
		"CreateInvitationForTenantAsStaff",
		ApiRateLimitPolicies.TenantEmailOperation
	)]
	[InlineData(
		"ExportAuditLogs",
		ApiRateLimitPolicies.Export
	)]
	[InlineData(
		"ExportTenantUsersAsStaff",
		ApiRateLimitPolicies.TenantExport
	)]
	[InlineData(
		"CreateStaffUpload",
		ApiRateLimitPolicies.Upload
	)]
	[InlineData(
		"ResolveTenantProfileNamesAsStaff",
		ApiRateLimitPolicies.HeavySearchList
	)]
	public void ItShouldAssignTheApprovedPolicyToEachEndpointClass(
		string endpointName,
		string expectedPolicy
	) {
		var endpoint = GetRouteEndpoint(endpointName);
		var metadata = endpoint.Metadata
			.GetMetadata<EnableRateLimitingAttribute>();

		metadata.Should().NotBeNull();
		Assert.NotNull(metadata);
		metadata.PolicyName.Should().Be(expectedPolicy);
	}

	private RouteEndpoint GetRouteEndpoint(
		string endpointName
	) {
		return _fixture.Factory.Services
			.GetRequiredService<EndpointDataSource>()
			.Endpoints
			.OfType<RouteEndpoint>()
			.Single(endpoint =>
				endpoint.Metadata
					.GetMetadata<IEndpointNameMetadata>()
					?.EndpointName == endpointName
			);
	}
}
