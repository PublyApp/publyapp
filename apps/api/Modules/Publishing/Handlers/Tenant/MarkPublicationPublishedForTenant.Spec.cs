using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.Posts.Entities;
using PublyApp.Api.Modules.Publishing.Entities;
using PublyApp.Api.Modules.Publishing.Lib;
using PublyApp.Api.Modules.SocialAccounts.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Publishing.Handlers.Tenant;

// POST /posts/publications/{publicationId}/mark-published was never hit by the
// integration suite (see docs/records/2026-10-28-analysis-endpoint-coverage.md).
// It is the user's resolution of a needs-review publication (#2176), so the
// success test asserts the whole state change (status, cleared cause, closed
// journal rows, audit entry) and every refusal path asserts the row was NOT
// touched.
public sealed class MarkPublicationPublishedForTenantSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;
	private readonly HttpClient _Http;
	private readonly TestAuthClient _AuthClient;

	public MarkPublicationPublishedForTenantSpec(ApiFixture fixture) {
		this._Fixture = fixture;
		this._Http = fixture.HttpClient;
		this._AuthClient = new TestAuthClient(this._Http);
	}

	[Fact]
	public async Task ItShouldMarkANeedsReviewPublicationAsPublished() {
		var acmeId = await TenantMemberTestHelper.GetTenantIdAsync(
			this._Fixture,
			SeedConstants.Tenants.AcmeName
		);
		var acmeAdminId = await this._UserIdAsync(TestConstants.AcmeAdminEmail);
		var token = await this._AuthClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);
		var publicationId = await this._SeedPublicationAsync(
			acmeId,
			PublicationStatus.Paused,
			PublicationFailureCategory.NeedsReview
		);
		await this._SeedAttemptAsync(acmeId, publicationId, 0, SubmissionState.NotSent);
		await this._SeedAttemptAsync(acmeId, publicationId, 1, SubmissionState.Unknown);
		await this._SeedAttemptAsync(acmeId, publicationId, 2, SubmissionState.Rejected);

		using var response = await this._SendAsync(token, acmeId, publicationId);

		response.StatusCode.Should().Be(HttpStatusCode.OK);

		var payload = await response.Content.ReadFromJsonAsync<ApiResponse>();
		payload.Should().NotBeNull();
		Assert.NotNull(payload);
		payload.Key.Should().Be("publication-mark-published-success");

		var publication = await this._LoadPublicationAsync(publicationId);
		publication.Status.Should().Be(PublicationStatus.Published);
		publication.FailureCategory.Should().BeNull(
			"the ambiguity is resolved, so the failure cause no longer applies"
		);
		publication.LastError.Should().BeNull();

		var attempts = await this._LoadAttemptsAsync(publicationId);
		attempts.Should().HaveCount(3);
		attempts.Single(attempt => attempt.SegmentPosition == 0).SubmissionState
			.Should().Be(SubmissionState.Accepted);
		attempts.Single(attempt => attempt.SegmentPosition == 1).SubmissionState
			.Should().Be(SubmissionState.Accepted);
		attempts.Single(attempt => attempt.SegmentPosition == 2).SubmissionState
			.Should().Be(
				SubmissionState.Rejected,
				"only the may-have-landed rows are resolved by the confirmation"
			);

		var audit = await this._LoadAuditAsync(publicationId);
		audit.Should().ContainSingle(
			"exactly one confirmation, one audit entry"
		);
		audit[0].Action.Should().Be(AuditActions.PublicationMarkedPublished);
		audit[0].UserId.Should().Be(acmeAdminId);
		audit[0].TargetId.Should().Be(publicationId);
	}

	// Only Paused + NeedsReview is resoluble. Every other status is refused with a
	// conflict (not a silent success) and the row keeps its state.
	[Theory]
	[InlineData(PublicationStatus.Published, null)]
	[InlineData(PublicationStatus.Scheduled, null)]
	[InlineData(PublicationStatus.Failed, PublicationFailureCategory.RetryLater)]
	[InlineData(PublicationStatus.Paused, PublicationFailureCategory.Reconnect)]
	public async Task ItShouldReturnConflictWhenThePublicationIsNotWaitingForReview(
		PublicationStatus status,
		PublicationFailureCategory? category
	) {
		var acmeId = await TenantMemberTestHelper.GetTenantIdAsync(
			this._Fixture,
			SeedConstants.Tenants.AcmeName
		);
		var token = await this._AuthClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);
		var publicationId = await this._SeedPublicationAsync(acmeId, status, category);

		using var response = await this._SendAsync(token, acmeId, publicationId);

		response.StatusCode.Should().Be(HttpStatusCode.Conflict);
		await MarkPublicationPublishedForTenantSpec._AssertProblemKeyAsync(
			response,
			"publication-mark-published-not-allowed"
		);

		var publication = await this._LoadPublicationAsync(publicationId);
		publication.Status.Should().Be(status);
		publication.FailureCategory.Should().Be(category);
	}

	// A double click: the second confirmation finds the row already Published and
	// must conflict instead of writing twice.
	[Fact]
	public async Task ItShouldReturnConflictOnASecondMarkOfTheSamePublication() {
		var acmeId = await TenantMemberTestHelper.GetTenantIdAsync(
			this._Fixture,
			SeedConstants.Tenants.AcmeName
		);
		var token = await this._AuthClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);
		var publicationId = await this._SeedPublicationAsync(
			acmeId,
			PublicationStatus.Paused,
			PublicationFailureCategory.NeedsReview
		);

		using var first = await this._SendAsync(token, acmeId, publicationId);
		using var second = await this._SendAsync(token, acmeId, publicationId);

		first.StatusCode.Should().Be(HttpStatusCode.OK);
		second.StatusCode.Should().Be(HttpStatusCode.Conflict);
		(await this._LoadAuditAsync(publicationId)).Should().ContainSingle();
	}

	// SECURITY: another tenant's publication is indistinguishable from an unknown id,
	// and it must stay untouched.
	[Fact]
	public async Task ItShouldReturnNotFoundForAnotherTenantsPublicationAndAnUnknownId() {
		var acmeId = await TenantMemberTestHelper.GetTenantIdAsync(
			this._Fixture,
			SeedConstants.Tenants.AcmeName
		);
		var techStartId = await TenantMemberTestHelper.GetTenantIdAsync(
			this._Fixture,
			SeedConstants.Tenants.TechStartName
		);
		var token = await this._AuthClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);
		var foreignId = await this._SeedPublicationAsync(
			techStartId,
			PublicationStatus.Paused,
			PublicationFailureCategory.NeedsReview
		);

		using var foreign = await this._SendAsync(token, acmeId, foreignId);
		using var unknown = await this._SendAsync(token, acmeId, Guid.CreateVersion7());

		foreign.StatusCode.Should().Be(HttpStatusCode.NotFound);
		await MarkPublicationPublishedForTenantSpec._AssertProblemKeyAsync(foreign, "not-found");
		unknown.StatusCode.Should().Be(HttpStatusCode.NotFound);
		(await this._LoadPublicationAsync(foreignId)).Status
			.Should().Be(PublicationStatus.Paused);
	}

	[Fact]
	public async Task ItShouldReturnNotFoundForASoftDeletedPublication() {
		var acmeId = await TenantMemberTestHelper.GetTenantIdAsync(
			this._Fixture,
			SeedConstants.Tenants.AcmeName
		);
		var token = await this._AuthClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);
		var publicationId = await this._SeedPublicationAsync(
			acmeId,
			PublicationStatus.Paused,
			PublicationFailureCategory.NeedsReview
		);
		await this._SoftDeleteAsync(publicationId);

		using var response = await this._SendAsync(token, acmeId, publicationId);

		response.StatusCode.Should().Be(HttpStatusCode.NotFound);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestForAMalformedId() {
		var acmeId = await TenantMemberTestHelper.GetTenantIdAsync(
			this._Fixture,
			SeedConstants.Tenants.AcmeName
		);
		var token = await this._AuthClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		using var response = await this._SendAsync(token, acmeId, "not-a-guid");

		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
		await MarkPublicationPublishedForTenantSpec._AssertProblemKeyAsync(
			response,
			"malformed-id"
		);
	}

	[Fact]
	public async Task ItShouldReturnBadRequestWithoutTheTenantHeader() {
		var token = await this._AuthClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			MarkPublicationPublishedForTenantSpec._GetUrl(Guid.CreateVersion7().ToString())
		).WithSessionToken(token);
		using var response = await this._Http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
		await MarkPublicationPublishedForTenantSpec._AssertProblemKeyAsync(
			response,
			"tenant-id-required"
		);
	}

	[Fact]
	public async Task ItShouldReturnUnauthorizedWithoutASession() {
		var acmeId = await TenantMemberTestHelper.GetTenantIdAsync(
			this._Fixture,
			SeedConstants.Tenants.AcmeName
		);

		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			MarkPublicationPublishedForTenantSpec._GetUrl(Guid.CreateVersion7().ToString())
		).WithTenantId(acmeId);
		using var response = await this._Http.SendAsync(request);

		response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForATenantUserWithoutThePublishPermissions() {
		var acmeId = await TenantMemberTestHelper.GetTenantIdAsync(
			this._Fixture,
			SeedConstants.Tenants.AcmeName
		);
		var email = await TenantMemberTestHelper.SeedMemberAsync(this._Fixture, acmeId, []);
		var token = await this._AuthClient.LoginAsync(email, TestConstants.SeedPassword);
		var publicationId = await this._SeedPublicationAsync(
			acmeId,
			PublicationStatus.Paused,
			PublicationFailureCategory.NeedsReview
		);

		using var response = await this._SendAsync(token, acmeId, publicationId);

		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
		await MarkPublicationPublishedForTenantSpec._AssertProblemKeyAsync(
			response,
			"user-does-not-have-the-necessary-permissions"
		);
		(await this._LoadPublicationAsync(publicationId)).Status
			.Should().Be(PublicationStatus.Paused);
	}

	// The route requires BOTH publish verbs (AND semantics). Holding one is not
	// enough, so the partial-permission member must be refused.
	[Fact]
	public async Task ItShouldReturnForbiddenForAMemberHoldingOnlyOneOfTheRequiredPermissions() {
		var acmeId = await TenantMemberTestHelper.GetTenantIdAsync(
			this._Fixture,
			SeedConstants.Tenants.AcmeName
		);
		var email = await TenantMemberTestHelper.SeedMemberAsync(
			this._Fixture,
			acmeId,
			[AppPermissions.Tenant.Posts.PUBLISH.Key]
		);
		var token = await this._AuthClient.LoginAsync(email, TestConstants.SeedPassword);
		var publicationId = await this._SeedPublicationAsync(
			acmeId,
			PublicationStatus.Paused,
			PublicationFailureCategory.NeedsReview
		);

		using var response = await this._SendAsync(token, acmeId, publicationId);

		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
	}

	// A user who is a member of another tenant must not reach this one: the tenant
	// filter answers generically so tenant ids cannot be probed.
	[Fact]
	public async Task ItShouldReturnForbiddenForANonMemberOfTheTenant() {
		var techStartId = await TenantMemberTestHelper.GetTenantIdAsync(
			this._Fixture,
			SeedConstants.Tenants.TechStartName
		);
		var token = await this._AuthClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);
		var publicationId = await this._SeedPublicationAsync(
			techStartId,
			PublicationStatus.Paused,
			PublicationFailureCategory.NeedsReview
		);

		using var response = await this._SendAsync(token, techStartId, publicationId);

		response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
		(await this._LoadPublicationAsync(publicationId)).Status
			.Should().Be(PublicationStatus.Paused);
	}

	private static string _GetUrl(string publicationId) {
		return $"/posts/publications/{publicationId}/mark-published";
	}

	private async Task<HttpResponseMessage> _SendAsync(
		string token,
		Guid tenantId,
		Guid publicationId
	) {
		return await this._SendAsync(token, tenantId, publicationId.ToString());
	}

	private async Task<HttpResponseMessage> _SendAsync(
		string token,
		Guid tenantId,
		string publicationId
	) {
		using var request = new HttpRequestMessage(
			HttpMethod.Post,
			MarkPublicationPublishedForTenantSpec._GetUrl(publicationId)
		).WithSessionToken(token).WithTenantId(tenantId);
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

	private async Task<Guid> _UserIdAsync(string email) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		return await db.User
			.Where(user => user.Email == email)
			.Select(user => user.GetRequiredId())
			.SingleAsync();
	}

	private async Task<Guid> _SeedPublicationAsync(
		Guid tenantId,
		PublicationStatus status,
		PublicationFailureCategory? category
	) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var userId = await db.User
			.Where(user => user.Email == TestConstants.AcmeAdminEmail)
			.Select(user => user.GetRequiredId())
			.SingleAsync();
		var post = new Post {
			TenantId = tenantId,
			Body = $"mark-published spec {Guid.NewGuid():N}",
			CreatedByUserId = userId,
		};
		var account = new SocialAccount {
			TenantId = tenantId,
			ExternalAccountId = $"did:plc:{Guid.NewGuid():N}",
			DisplayHandle = "@mark-published-spec.bsky.social",
			ProtectedCredentials = "enc-spec-blob",
			Status = SocialAccountStatus.Active,
		};
		db.Post.Add(post);
		db.SocialAccount.Add(account);
		await db.SaveChangesAsync();

		var id = Guid.CreateVersion7();
		var publication = new Publication {
			TenantId = tenantId,
			PostId = post.GetRequiredId(),
			SocialAccountId = account.GetRequiredId(),
			Status = status,
			FailureCategory = category,
			LastError = category is null ? null : "the provider did not answer",
			ScheduledAtUtc = DateTime.UtcNow.AddMinutes(-5),
			ScheduledTimeZone = "Etc/UTC",
			IdempotencyKey = PublicationIdempotencyKey.For(id),
		};
		publication.Id = id;
		db.Publication.Add(publication);
		await db.SaveChangesAsync();

		return id;
	}

	private async Task _SeedAttemptAsync(
		Guid tenantId,
		Guid publicationId,
		int segmentPosition,
		SubmissionState state
	) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		await db.PublishAttempt.AddAsync(new PublishAttempt {
			TenantId = tenantId,
			PublicationId = publicationId,
			SegmentPosition = segmentPosition,
			AttemptNumber = 1,
			Operation = segmentPosition == 0 ? "create_post" : "create_reply",
			ContentFingerprint = Guid.NewGuid().ToString("N"),
			IdempotencyKey = $"{publicationId:N}-{segmentPosition}",
			SubmissionState = state,
		});
		await db.SaveChangesAsync();
	}

	private async Task<Publication> _LoadPublicationAsync(Guid publicationId) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		return await db.Publication
			.AsNoTracking()
			.SingleAsync(publication => publication.Id == publicationId);
	}

	private async Task<List<PublishAttempt>> _LoadAttemptsAsync(Guid publicationId) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		return await db.PublishAttempt
			.AsNoTracking()
			.Where(attempt => attempt.PublicationId == publicationId)
			.ToListAsync();
	}

	private async Task<List<AuditLog>> _LoadAuditAsync(Guid publicationId) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		return await db.AuditLog
			.AsNoTracking()
			.Where(entry => entry.Action == AuditActions.PublicationMarkedPublished
				&& entry.TargetId == publicationId)
			.ToListAsync();
	}

	private async Task _SoftDeleteAsync(Guid publicationId) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var publication = await db.Publication.SingleAsync(row => row.Id == publicationId);
		publication.IsDeleted = true;
		publication.DeletedAt = DateTime.UtcNow;
		await db.SaveChangesAsync();
	}
}
