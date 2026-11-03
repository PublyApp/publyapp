using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Invitations.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Invitations.Handlers.Staff;

// GET /staff/invitations/{invitationId}/link was never hit by the integration
// suite (see docs/records/2026-10-28-analysis-endpoint-coverage.md). The link is a
// bearer credential, so the success path and the "only a pending invitation exposes
// a link" guard are both pinned here, along with the scope guard and authorizations.
public sealed class GetStaffInvitationLinkSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public GetStaffInvitationLinkSpec(ApiFixture fixture) {
		this._Fixture = fixture;
		this._Http = fixture.HttpClient;
		this._AuthClient = new TestAuthClient(this._Http);
	}

	[Fact]
	public async Task ItShouldReturnTheAcceptLinkForAPendingInvitation() {
		var seeded = await InvitationTestHelper.SeedStaffInvitationAsync(this._Fixture);
		var token = await this._AuthClient.LoginAsStaffAdminAsync();

		using var response = await this._SendAsync(token, seeded.Id);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var result = await response.Content
			.ReadFromJsonAsync<GetStaffInvitationLinkResult>();
		result.Should().NotBeNull();
		Assert.NotNull(result);
		var frontUrl = AppEnvironment.Instance.FRONT_URL.TrimEnd('/');
		result.Link.Should().StartWith($"{frontUrl}/accept-invitation?");
		result.Link.Should().Contain($"token={seeded.Token}");
		result.Link.Should().Contain(
			"id=",
			"the encrypted email rides along so the accept screen can greet the invitee"
		);
	}

	// Accepted, revoked and derived-expired invitations must never hand out a usable
	// link again — the token would resurrect a dead invitation.
	[Theory]
	[InlineData(InvitationStatus.Accepted, false)]
	[InlineData(InvitationStatus.Revoked, false)]
	[InlineData(InvitationStatus.Pending, true)]
	public async Task ItShouldRefuseTheLinkWhenTheInvitationIsNoLongerPending(
		InvitationStatus status,
		bool isExpired
	) {
		var seeded = await InvitationTestHelper.SeedStaffInvitationAsync(
			this._Fixture,
			status,
			isExpired ? DateTime.UtcNow.AddDays(-1) : DateTime.UtcNow.AddDays(7)
		);
		var token = await this._AuthClient.LoginAsStaffAdminAsync();

		using var response = await this._SendAsync(token, seeded.Id);

		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
		await GetStaffInvitationLinkSpec._AssertProblemKeyAsync(response, "bad-request");
	}

	[Fact]
	public async Task ItShouldReturnNotFoundForATenantScopedInvitation() {
		var tenantInvitationId =
			await InvitationTestHelper.SeedTenantInvitationAsync(this._Fixture);
		var token = await this._AuthClient.LoginAsStaffAdminAsync();

		using var response = await this._SendAsync(token, tenantInvitationId);

		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
		await GetStaffInvitationLinkSpec._AssertProblemKeyAsync(response, "not-found");
	}

	[Fact]
	public async Task ItShouldReturnNotFoundForAnUnknownId() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();

		using var response = await this._SendAsync(token, Guid.NewGuid());

		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForAMalformedId() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetStaffInvitationLinkSpec._GetUrl("not-a-guid")
		).WithSessionToken(token);
		using var response = await this._Http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
		await GetStaffInvitationLinkSpec._AssertProblemKeyAsync(response, "malformed-id");
	}

	[Fact]
	public async Task ItShouldReturnUnauthorizedWithoutASession() {
		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetStaffInvitationLinkSpec._GetUrl(Guid.NewGuid().ToString())
		);
		using var response = await this._Http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForATenantUser() {
		var token = await this._AuthClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		using var response = await this._SendAsync(token, Guid.NewGuid());

		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForAStaffUserWithoutThePermission() {
		var token = await this._AuthClient.LoginAsync(
			TestConstants.StaffUserEmail,
			TestConstants.SeedPassword
		);

		using var response = await this._SendAsync(token, Guid.NewGuid());

		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
		await GetStaffInvitationLinkSpec._AssertProblemKeyAsync(
			response,
			"user-does-not-have-the-necessary-permissions"
		);
	}

	private static string _GetUrl(string invitationId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Invitations.ForStaff.Root,
			Routes.Invitations.ForStaff.GetLinkByIdFn(invitationId)
		);
	}

	private async Task<HttpResponseMessage> _SendAsync(string token, Guid invitationId) {
		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetStaffInvitationLinkSpec._GetUrl(invitationId.ToString())
		).WithSessionToken(token);
		return await this._Http.SendAsync(request);
	}

	private static async Task _AssertProblemKeyAsync(
		HttpResponseMessage response,
		string expectedKey
	) {
		var problem = await response.Content.ReadFromJsonAsync<AppProblemDetails>();
		problem.Should().NotBeNull();
		Assert.NotNull(problem);
		problem.TranslationKey.Should().Be(expectedKey);
	}
}
