using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Invitations.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Invitations.Handlers.Staff;

// GET /staff/invitations/{invitationId} was never hit by the integration suite
// (see docs/records/2026-10-28-analysis-endpoint-coverage.md). This spec pins the
// full success body, every effective status the read model can derive, the
// scope guard (a tenant invitation is invisible to the staff read), and the four
// authorization outcomes.
public sealed class GetStaffInvitationSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public GetStaffInvitationSpec(ApiFixture fixture) {
		this._Fixture = fixture;
		this._Http = fixture.HttpClient;
		this._AuthClient = new TestAuthClient(this._Http);
	}

	[Fact]
	public async Task ItShouldReturnThePendingInvitationDetails() {
		var seeded = await InvitationTestHelper.SeedStaffInvitationAsync(this._Fixture);
		var token = await this._AuthClient.LoginAsStaffAdminAsync();

		using var response = await this._SendAsync(token, seeded.Id);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var details = await response.Content
			.ReadFromJsonAsync<StaffInvitationDetails>();
		details.Should().NotBeNull();
		Assert.NotNull(details);
		details.Id.Should().Be(seeded.Id);
		details.Email.Should().Be(seeded.Email);
		details.Status.Should().Be(InvitationEffectiveStatus.Pending);
		details.ExpiresAt.Should().BeCloseTo(seeded.ExpiresAt, TimeSpan.FromSeconds(1));
		details.CreatedAt.Should().BeAfter(DateTime.UtcNow.AddMinutes(-5));
		details.AcceptedAt.Should().BeNull();
		details.RevokedAt.Should().BeNull();
		details.InvitedByUserId.Should().Be(seeded.InvitedByUserId);
		details.InvitedByName.Should().NotBeNullOrWhiteSpace(
			"the read model resolves the inviter for the staff detail panel"
		);
		details.Profiles.Should().ContainSingle(profile => profile.Id == seeded.ProfileId);
		details.Profiles[0].Name.Should().Be(seeded.ProfileName);
	}

	// The persisted status is Pending/Accepted/Revoked; "Expired" is derived from
	// Pending + past ExpiresAt. All four must surface on the wire, because the staff
	// detail screen branches on the effective status.
	[Theory]
	[InlineData(InvitationStatus.Pending, false, InvitationEffectiveStatus.Pending)]
	[InlineData(InvitationStatus.Pending, true, InvitationEffectiveStatus.Expired)]
	[InlineData(InvitationStatus.Accepted, false, InvitationEffectiveStatus.Accepted)]
	[InlineData(InvitationStatus.Revoked, false, InvitationEffectiveStatus.Revoked)]
	public async Task ItShouldExposeTheEffectiveStatus(
		InvitationStatus persistedStatus,
		bool isExpired,
		InvitationEffectiveStatus expected
	) {
		var seeded = await InvitationTestHelper.SeedStaffInvitationAsync(
			this._Fixture,
			persistedStatus,
			isExpired ? DateTime.UtcNow.AddDays(-1) : DateTime.UtcNow.AddDays(7)
		);
		var token = await this._AuthClient.LoginAsStaffAdminAsync();

		using var response = await this._SendAsync(token, seeded.Id);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var details = await response.Content
			.ReadFromJsonAsync<StaffInvitationDetails>();
		details.Should().NotBeNull();
		Assert.NotNull(details);
		details.Status.Should().Be(expected);
		if (persistedStatus == InvitationStatus.Accepted) {
			details.AcceptedAt.Should().BeCloseTo(
				seeded.ChangedAt,
				TimeSpan.FromMilliseconds(1)
			);
			details.RevokedAt.Should().BeNull();
		} else if (persistedStatus == InvitationStatus.Revoked) {
			details.RevokedAt.Should().BeCloseTo(
				seeded.ChangedAt,
				TimeSpan.FromMilliseconds(1)
			);
			details.AcceptedAt.Should().BeNull();
		} else {
			details.AcceptedAt.Should().BeNull();
			details.RevokedAt.Should().BeNull();
		}
	}

	// SECURITY: the read model is scoped to Staff invitations. A tenant invitation id
	// must be indistinguishable from an unknown one.
	[Fact]
	public async Task ItShouldReturnNotFoundForATenantScopedInvitation() {
		var tenantInvitationId =
			await InvitationTestHelper.SeedTenantInvitationAsync(this._Fixture);
		var token = await this._AuthClient.LoginAsStaffAdminAsync();

		using var response = await this._SendAsync(token, tenantInvitationId);

		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
		await GetStaffInvitationSpec._AssertProblemKeyAsync(response, "not-found");
	}

	[Fact]
	public async Task ItShouldReturnNotFoundForAnUnknownId() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();

		using var response = await this._SendAsync(token, Guid.NewGuid());

		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
		await GetStaffInvitationSpec._AssertProblemKeyAsync(response, "not-found");
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForAMalformedId() {
		var token = await this._AuthClient.LoginAsStaffAdminAsync();

		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetStaffInvitationSpec._GetUrl("not-a-guid")
		).WithSessionToken(token);
		using var response = await this._Http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
		await GetStaffInvitationSpec._AssertProblemKeyAsync(response, "malformed-id");
	}

	[Fact]
	public async Task ItShouldReturnUnauthorizedWithoutASession() {
		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetStaffInvitationSpec._GetUrl(Guid.NewGuid().ToString())
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
		await GetStaffInvitationSpec._AssertProblemKeyAsync(
			response,
			"user-does-not-have-the-necessary-permissions"
		);
	}

	private static string _GetUrl(string invitationId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Invitations.ForStaff.Root,
			Routes.Invitations.ForStaff.GetByIdFn(invitationId)
		);
	}

	private async Task<HttpResponseMessage> _SendAsync(string token, Guid invitationId) {
		using var request = new HttpRequestMessage(
			HttpMethod.Get,
			GetStaffInvitationSpec._GetUrl(invitationId.ToString())
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
