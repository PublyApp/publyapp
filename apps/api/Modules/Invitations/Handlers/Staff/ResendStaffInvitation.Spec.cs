using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Modules.Invitations.Entities;
using PublyApp.Api.Modules.Invitations.Jobs;
using PublyApp.Api.Modules.Jobs.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Invitations.Handlers.Staff;

// POST /staff/invitations/{invitationId}/resend was never hit by the integration
// suite (see docs/records/2026-10-28-analysis-endpoint-coverage.md). The only
// durable effect is the email job, so the success test asserts the job row (type,
// payload, provenance) — not just the 200. The refusal test asserts the silent
// branch too: a dead invitation must enqueue nothing.
public sealed class ResendStaffInvitationSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public ResendStaffInvitationSpec(ApiFixture fixture) {
		this._Fixture = fixture;
		this._Http = fixture.HttpClient;
		this._AuthClient = new TestAuthClient(this._Http);
	}

	[Fact]
	public async Task ItShouldEnqueueTheInvitationEmailForAPendingInvitation() {
		var seeded = await InvitationTestHelper.SeedStaffInvitationAsync(this._Fixture);
		var token = await this._AuthClient.LoginAsStaffAdminAsync();

		using var first = await this._SendAsync(token, seeded.Id);

		first.StatusCode.Should().Be(HttpStatusCode.OK);

		var payload = await first.Content.ReadFromJsonAsync<ApiResponse>();
		payload.Should().NotBeNull();
		Assert.NotNull(payload);
		payload.Key.Should().Be("invitation-resent");
		payload.Message.Should().NotBeNullOrWhiteSpace();

		var jobs = await this._LoadJobsAsync(seeded.Id);
		jobs.Should().ContainSingle(
			"one resend enqueues exactly one email job"
		);
		jobs[0].JobType.Should().Be(InvitationEmailJobs.StaffInvitationV1.JobType);
		jobs[0].Payload.Should().Contain(seeded.Id.ToString());
		jobs[0].ActorUserId.Should().NotBeNull(
			"the requester is recorded for the audit trail"
		);
		jobs[0].TenantId.Should().BeNull(
			"a staff invitation belongs to no tenant"
		);

		// Resending is an explicit action, not an idempotent one: the user may
		// legitimately want a second email, so a second call enqueues a second job.
		using var second = await this._SendAsync(token, seeded.Id);

		second.StatusCode.Should().Be(HttpStatusCode.OK);
		(await this._LoadJobsAsync(seeded.Id)).Should().HaveCount(2);
	}

	// Accepted, revoked and derived-expired invitations must be refused, and the
	// refusal must leave no email job behind (the failure is otherwise silent).
	[Theory]
	[InlineData(InvitationStatus.Accepted, false)]
	[InlineData(InvitationStatus.Revoked, false)]
	[InlineData(InvitationStatus.Pending, true)]
	public async Task ItShouldRefuseResendAndEnqueueNothingWhenTheInvitationIsNoLongerPending(
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
		await ResendStaffInvitationSpec._AssertProblemKeyAsync(response, "bad-request");
		(await this._LoadJobsAsync(seeded.Id)).Should().BeEmpty();
	}

	[Fact]
	public async Task ItShouldReturnNotFoundForATenantScopedInvitation() {
		var tenantInvitationId =
			await InvitationTestHelper.SeedTenantInvitationAsync(this._Fixture);
		var token = await this._AuthClient.LoginAsStaffAdminAsync();

		using var response = await this._SendAsync(token, tenantInvitationId);

		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
		await ResendStaffInvitationSpec._AssertProblemKeyAsync(response, "not-found");
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
			HttpMethod.Post,
			ResendStaffInvitationSpec._GetUrl("not-a-guid")
		).WithSessionToken(token);
		using var response = await this._Http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
		await ResendStaffInvitationSpec._AssertProblemKeyAsync(response, "malformed-id");
	}

	[Fact]
	public async Task ItShouldReturnUnauthorizedWithoutASession() {
		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			ResendStaffInvitationSpec._GetUrl(Guid.NewGuid().ToString())
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
		await ResendStaffInvitationSpec._AssertProblemKeyAsync(
			response,
			"user-does-not-have-the-necessary-permissions"
		);
	}

	private static string _GetUrl(string invitationId) {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Invitations.ForStaff.Root,
			Routes.Invitations.ForStaff.ResendByIdFn(invitationId)
		);
	}

	private async Task<HttpResponseMessage> _SendAsync(string token, Guid invitationId) {
		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			ResendStaffInvitationSpec._GetUrl(invitationId.ToString())
		).WithSessionToken(token);
		return await this._Http.SendAsync(request);
	}

	private async Task<List<JobQueueItem>> _LoadJobsAsync(Guid invitationId) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var jobs = await db.JobQueue
			.AsNoTracking()
			.Where(job => job.JobType == InvitationEmailJobs.StaffInvitationV1.JobType)
			.ToListAsync();

		return jobs
			.Where(job => job.Payload.Contains(invitationId.ToString()))
			.ToList();
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
