using System.Net;
using System.Net.Http.Json;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib.ProblemResults;
using PublyApp.Api.Lib.Routes;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Lib.Testing.Helpers;
using PublyApp.Api.Lib.Utils;
using PublyApp.Api.Localization;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.Invitations.Entities;
using PublyApp.Api.Modules.Profiles.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Invitations.Handlers.Staff;

public sealed class BulkRevokeStaffInvitationsSpec : IClassFixture<ApiFixture> {
	private const string BulkRevokeRoute = "/bulk-revoke";

	private readonly ApiFixture _fixture;
	private readonly HttpClient _http;
	private readonly TestAuthClient _authClient;

	public BulkRevokeStaffInvitationsSpec(ApiFixture fixture) {
		_fixture = fixture;
		_http = fixture.HttpClient;
		_authClient = new TestAuthClient(_http);
	}

	[Fact]
	public async Task ItShouldReturnValidationProblemForMalformedBulkRevokeBody() {
		string staffToken = await _authClient.LoginAsStaffAdminAsync();

		using HttpResponseMessage response = await BulkRevokeAsync(
			staffToken,
			["not-a-guid"]
		);

		_ = response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);

		ValidationProblemDetails? problem = await response.Content
			.ReadFromJsonAsync<ValidationProblemDetails>();
		_ = problem.Should().NotBeNull();
		_ = problem?.TranslationKey
			.Should()
			.Be(ResponseKeys.RequestBodyValidationFailed);
		_ = problem?.Errors.Values
			.SelectMany(errors => errors)
			.Should()
			.Contain(error => error.Contains("valid GUID"));
	}

	[Fact]
	public async Task ItShouldReturnPartialSuccessWhenBulkRevokingMixedTargets() {
		string staffToken = await _authClient.LoginAsStaffAdminAsync();
		Guid pendingInvitationId = await CreateStaffInvitationAsync(
			$"bulk-revoke-pending-{Guid.NewGuid():N}@example.com"
		);
		Guid acceptedInvitationId = await CreateStaffInvitationAsync(
			$"bulk-revoke-accepted-{Guid.NewGuid():N}@example.com"
		);
		Guid missingInvitationId = Guid.NewGuid();

		await MarkStaffInvitationAcceptedAsync(acceptedInvitationId);

		using HttpResponseMessage response = await BulkRevokeAsync(
			staffToken,
			pendingInvitationId,
			acceptedInvitationId,
			missingInvitationId
		);

		_ = response.StatusCode.Should().Be(HttpStatusCode.OK);

		BulkStaffInvitationActionResponse? result = await response.Content
			.ReadFromJsonAsync<BulkStaffInvitationActionResponse>();
		_ = result.Should().NotBeNull();
		_ = result?.SucceededCount.Should().Be(1);
		_ = result?.FailedCount.Should().Be(2);
		_ = result?.FailedItems.Should().ContainSingle(item =>
			item.InvitationId == acceptedInvitationId
			&& item.Reason == "already_accepted"
		);
		_ = result?.FailedItems.Should().ContainSingle(item =>
			item.InvitationId == missingInvitationId
			&& item.Reason == "not_found"
		);

		await AssertInvitationStatusAsync(pendingInvitationId, InvitationStatus.Revoked);
		await AssertInvitationStatusAsync(acceptedInvitationId, InvitationStatus.Accepted);
		await AssertInvitationRevokeAuditLogAsync(pendingInvitationId);
	}

	[Fact]
	public async Task ItShouldRevokeAllPendingInvitationsOnBulkRevokeHappyPath() {
		string staffToken = await _authClient.LoginAsStaffAdminAsync();
		List<Guid> pendingIds = [];
		for (int i = 0; i < 3; i++) {
			pendingIds.Add(await CreateStaffInvitationAsync(
				$"bulk-revoke-happy-{i}-{Guid.NewGuid():N}@example.com"
			));
		}

		using HttpResponseMessage response = await BulkRevokeAsync(
			staffToken,
			[.. pendingIds]
		);

		_ = response.StatusCode.Should().Be(HttpStatusCode.OK);

		BulkStaffInvitationActionResponse? result = await response.Content
			.ReadFromJsonAsync<BulkStaffInvitationActionResponse>();
		_ = result.Should().NotBeNull();
		_ = result?.SucceededCount.Should().Be(pendingIds.Count);
		_ = result?.FailedCount.Should().Be(0);
		_ = result?.FailedItems.Should().BeEmpty();

		foreach (Guid invitationId in pendingIds) {
			await AssertInvitationStatusAsync(invitationId, InvitationStatus.Revoked);
			await AssertInvitationRevokeAuditLogAsync(invitationId);
		}
	}

	[Fact]
	public async Task ItShouldReturnValidationProblemWhenBulkRevokeBodyIsEmptyArray() {
		string staffToken = await _authClient.LoginAsStaffAdminAsync();

		using HttpResponseMessage response = await BulkRevokeAsync(
			staffToken,
			Array.Empty<string>()
		);

		_ = response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);

		ValidationProblemDetails? problem = await response.Content
			.ReadFromJsonAsync<ValidationProblemDetails>();
		_ = problem.Should().NotBeNull();
		_ = problem?.TranslationKey
			.Should()
			.Be(ResponseKeys.RequestBodyValidationFailed);
	}

	[Fact]
	public async Task ItShouldDedupeDuplicateInvitationIdsInBulkRevoke() {
		string staffToken = await _authClient.LoginAsStaffAdminAsync();
		Guid firstId = await CreateStaffInvitationAsync(
			$"bulk-revoke-dup-a-{Guid.NewGuid():N}@example.com"
		);
		Guid secondId = await CreateStaffInvitationAsync(
			$"bulk-revoke-dup-b-{Guid.NewGuid():N}@example.com"
		);

		// [a, a, b] — duplicates must be deduped before service call.
		using HttpResponseMessage response = await BulkRevokeAsync(
			staffToken,
			firstId,
			firstId,
			secondId
		);

		_ = response.StatusCode.Should().Be(HttpStatusCode.OK);

		BulkStaffInvitationActionResponse? result = await response.Content
			.ReadFromJsonAsync<BulkStaffInvitationActionResponse>();
		_ = result.Should().NotBeNull();
		_ = result?.SucceededCount.Should().Be(2);
		_ = result?.FailedCount.Should().Be(0);
		_ = result?.FailedItems.Should().BeEmpty();

		await AssertInvitationStatusAsync(firstId, InvitationStatus.Revoked);
		await AssertInvitationStatusAsync(secondId, InvitationStatus.Revoked);

		// Only one audit-log row per id (no double-write from the dedupe).
		await AssertInvitationRevokeAuditLogCountAsync(firstId, expectedCount: 1);
		await AssertInvitationRevokeAuditLogCountAsync(secondId, expectedCount: 1);
	}

	[Fact]
	public async Task ItShouldReturnValidationProblemWhenBulkRevokeExceedsMaxCount() {
		string staffToken = await _authClient.LoginAsStaffAdminAsync();
		// Validator caps the array at 100; 101 valid GUIDs must trip maxCount.
		Guid[] tooManyIds = Enumerable.Range(0, 101)
			.Select(_ => Guid.NewGuid())
			.ToArray();

		using HttpResponseMessage response = await BulkRevokeAsync(
			staffToken,
			tooManyIds
		);

		_ = response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);

		ValidationProblemDetails? problem = await response.Content
			.ReadFromJsonAsync<ValidationProblemDetails>();
		_ = problem.Should().NotBeNull();
		_ = problem?.Errors.Values
			.SelectMany(errors => errors)
			.Should()
			.Contain(error =>
				error.Contains("Maximum 100", StringComparison.OrdinalIgnoreCase)
			);
	}

	[Fact]
	public async Task
	ItShouldCountAlreadyRevokedInvitationsAsSucceededOnBulkRevoke() {
		string staffToken = await _authClient.LoginAsStaffAdminAsync();
		Guid alreadyRevokedId = await CreateStaffInvitationAsync(
			$"bulk-revoke-already-{Guid.NewGuid():N}@example.com"
		);
		await MarkStaffInvitationRevokedAsync(alreadyRevokedId);

		using HttpResponseMessage response = await BulkRevokeAsync(
			staffToken,
			alreadyRevokedId
		);

		_ = response.StatusCode.Should().Be(HttpStatusCode.OK);

		BulkStaffInvitationActionResponse? result = await response.Content
			.ReadFromJsonAsync<BulkStaffInvitationActionResponse>();
		_ = result.Should().NotBeNull();
		// Service treats already-revoked as a success no-op (mirrors the
		// per-item RevokeInvitationForStaffAsync semantics).
		_ = result?.SucceededCount.Should().Be(1);
		_ = result?.FailedCount.Should().Be(0);
		_ = result?.FailedItems.Should().BeEmpty();

		await AssertInvitationStatusAsync(alreadyRevokedId, InvitationStatus.Revoked);
	}

	[Fact]
	public async Task ItShouldRevokeExpiredInvitationsOnBulkRevoke() {
		string staffToken = await _authClient.LoginAsStaffAdminAsync();
		// Expired invitations are still Status=Pending with a past ExpiresAt;
		// the service revokes them since IsRevoked()/IsAccepted() are both false.
		Guid expiredId = await CreateExpiredStaffInvitationAsync(
			$"bulk-revoke-expired-{Guid.NewGuid():N}@example.com"
		);

		using HttpResponseMessage response = await BulkRevokeAsync(
			staffToken,
			expiredId
		);

		_ = response.StatusCode.Should().Be(HttpStatusCode.OK);

		BulkStaffInvitationActionResponse? result = await response.Content
			.ReadFromJsonAsync<BulkStaffInvitationActionResponse>();
		_ = result.Should().NotBeNull();
		_ = result?.SucceededCount.Should().Be(1);
		_ = result?.FailedCount.Should().Be(0);
		_ = result?.FailedItems.Should().BeEmpty();

		await AssertInvitationStatusAsync(expiredId, InvitationStatus.Revoked);
		await AssertInvitationRevokeAuditLogAsync(expiredId);
	}

	[Fact]
	public async Task ItShouldReturnForbiddenForTenantUserOnBulkRevoke() {
		// Pre-create the invitation directly so the request body is valid.
		Guid invitationId = await CreateStaffInvitationAsync(
			$"bulk-revoke-tenant-user-{Guid.NewGuid():N}@example.com"
		);

		string tenantToken = await _authClient.LoginAsync(
			TestConstants.AcmeAdminEmail,
			TestConstants.SeedPassword
		);

		using HttpResponseMessage response = await BulkRevokeAsync(
			tenantToken,
			invitationId
		);

		_ = response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
		await AssertInvitationStatusAsync(invitationId, InvitationStatus.Pending);
	}

	[Fact]
	public async Task ItShouldReturnUnauthorizedWithoutSessionOnBulkRevoke() {
		Guid invitationId = await CreateStaffInvitationAsync(
			$"bulk-revoke-no-session-{Guid.NewGuid():N}@example.com"
		);

		HttpRequestMessage request = new HttpRequestMessage(
			HttpMethod.Post,
			GetBulkRevokeUrl()
		);
		request.Content = JsonContent.Create(new {
			invitationIds = new[] { invitationId.ToString() }
		});

		using HttpResponseMessage response = await _http.SendAsync(request);

		_ = response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
		await AssertInvitationStatusAsync(invitationId, InvitationStatus.Pending);
	}

	[Fact]
	public async Task ItShouldWriteAuditLogsForEverySucceededBulkRevoke() {
		string staffToken = await _authClient.LoginAsStaffAdminAsync();
		Guid pendingA = await CreateStaffInvitationAsync(
			$"bulk-revoke-audit-a-{Guid.NewGuid():N}@example.com"
		);
		Guid pendingB = await CreateStaffInvitationAsync(
			$"bulk-revoke-audit-b-{Guid.NewGuid():N}@example.com"
		);
		Guid missingId = Guid.NewGuid();
		Guid staffAdminUserId = await GetStaffAdminUserIdAsync();

		using HttpResponseMessage response = await BulkRevokeAsync(
			staffToken,
			pendingA,
			pendingB,
			missingId
		);
		_ = response.StatusCode.Should().Be(HttpStatusCode.OK);

		// One audit-log row per succeeded id: correct user, action, target.
		await AssertInvitationRevokeAuditLogContentAsync(pendingA, staffAdminUserId);
		await AssertInvitationRevokeAuditLogContentAsync(pendingB, staffAdminUserId);

		// No audit-log row for the not-found id.
		using IServiceScope scope = _fixture.Factory.Services.CreateScope();
		AppDbContext dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();
		bool missingHasLog = await dbContext.AuditLog
			.AnyAsync(log =>
				log.TargetId == missingId
				&& log.Action == AuditActions.InvitationRevoked
			);
		_ = missingHasLog.Should().BeFalse();
	}

	private async Task<HttpResponseMessage> BulkRevokeAsync(
		string staffToken,
		params Guid[] invitationIds
	) {
		return await BulkRevokeAsync(
			staffToken,
			invitationIds.Select(invitationId => invitationId.ToString()).ToArray()
		);
	}

	private async Task<HttpResponseMessage> BulkRevokeAsync(
		string staffToken,
		string[] invitationIds
	) {
		HttpRequestMessage request = new HttpRequestMessage(
			HttpMethod.Post,
			GetBulkRevokeUrl()
		).WithSessionToken(staffToken);

		request.Content = JsonContent.Create(new {
			invitationIds
		});

		return await _http.SendAsync(request);
	}

	private static string GetBulkRevokeUrl() {
		return PathUtils.Join(
			Routes.Staff.Root,
			Routes.Invitations.ForStaff.Root,
			BulkRevokeRoute
		);
	}

	private async Task<Guid> CreateStaffInvitationAsync(string email) {
		using IServiceScope scope = _fixture.Factory.Services.CreateScope();
		AppDbContext dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		Profile staffProfile = await dbContext.Profile
			.Where(profile =>
				profile.Scope == ProfileScope.Staff
				&& !profile.IsDeleted
			)
			.OrderBy(profile => profile.Name)
			.FirstAsync();
		User staffUser = await dbContext.User
			.Where(user => user.Email == SeedConstants.Staff.AdminEmail)
			.FirstAsync();

		Invitation invitation = Invitation.CreateStaffInvitationWithProfiles(
			email,
			[staffProfile.GetRequiredId()],
			staffUser.GetRequiredId(),
			DateTime.UtcNow.AddDays(7),
			Guid.NewGuid().ToString("N")[..32]
		);

		_ = await dbContext.Invitation.AddAsync(invitation);
		_ = await dbContext.SaveChangesAsync();

		return invitation.GetRequiredId();
	}

	private async Task MarkStaffInvitationAcceptedAsync(Guid invitationId) {
		using IServiceScope scope = _fixture.Factory.Services.CreateScope();
		AppDbContext dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		Invitation? invitation = await dbContext.Invitation
			.Where(inv => inv.Id == invitationId)
			.FirstOrDefaultAsync();
		_ = invitation.Should().NotBeNull();
		if (invitation is null) {
			return;
		}

		invitation.Status = InvitationStatus.Accepted;
		invitation.AcceptedAt = DateTime.UtcNow;

		_ = await dbContext.SaveChangesAsync();
	}

	private async Task MarkStaffInvitationRevokedAsync(Guid invitationId) {
		using IServiceScope scope = _fixture.Factory.Services.CreateScope();
		AppDbContext dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		Invitation? invitation = await dbContext.Invitation
			.Where(inv => inv.Id == invitationId)
			.FirstOrDefaultAsync();
		_ = invitation.Should().NotBeNull();
		if (invitation is null) {
			return;
		}

		invitation.Status = InvitationStatus.Revoked;
		invitation.RevokedAt = DateTime.UtcNow;

		_ = await dbContext.SaveChangesAsync();
	}

	private async Task<Guid> CreateExpiredStaffInvitationAsync(string email) {
		using IServiceScope scope = _fixture.Factory.Services.CreateScope();
		AppDbContext dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		Profile staffProfile = await dbContext.Profile
			.Where(profile =>
				profile.Scope == ProfileScope.Staff
				&& !profile.IsDeleted
			)
			.OrderBy(profile => profile.Name)
			.FirstAsync();
		User staffUser = await dbContext.User
			.Where(user => user.Email == SeedConstants.Staff.AdminEmail)
			.FirstAsync();

		Invitation invitation = Invitation.CreateStaffInvitationWithProfiles(
			email,
			[staffProfile.GetRequiredId()],
			staffUser.GetRequiredId(),
			DateTime.UtcNow.AddDays(-1),
			Guid.NewGuid().ToString("N")[..32]
		);

		_ = await dbContext.Invitation.AddAsync(invitation);
		_ = await dbContext.SaveChangesAsync();

		return invitation.GetRequiredId();
	}

	private async Task<Guid> GetStaffAdminUserIdAsync() {
		using IServiceScope scope = _fixture.Factory.Services.CreateScope();
		AppDbContext dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		User staffUser = await dbContext.User
			.Where(user => user.Email == SeedConstants.Staff.AdminEmail)
			.FirstAsync();
		return staffUser.GetRequiredId();
	}

	private async Task AssertInvitationStatusAsync(
		Guid invitationId,
		InvitationStatus status
	) {
		using IServiceScope scope = _fixture.Factory.Services.CreateScope();
		AppDbContext dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		Invitation? invitation = await dbContext.Invitation
			.Where(inv => inv.Id == invitationId)
			.FirstOrDefaultAsync();
		_ = invitation.Should().NotBeNull();
		_ = invitation?.Status.Should().Be(status);
	}

	private async Task AssertInvitationRevokeAuditLogAsync(Guid invitationId) {
		using IServiceScope scope = _fixture.Factory.Services.CreateScope();
		AppDbContext dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var auditLog =
			await (
				from log in dbContext.AuditLog
				where log.TargetId == invitationId
					&& log.Action == AuditActions.InvitationRevoked
				orderby log.CreatedAt descending
				select log
			).FirstOrDefaultAsync();

		_ = auditLog.Should().NotBeNull();
	}

	private async Task AssertInvitationRevokeAuditLogCountAsync(
		Guid invitationId,
		int expectedCount
	) {
		using IServiceScope scope = _fixture.Factory.Services.CreateScope();
		AppDbContext dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		int count = await dbContext.AuditLog
			.Where(log =>
				log.TargetId == invitationId
				&& log.Action == AuditActions.InvitationRevoked
			)
			.CountAsync();

		_ = count.Should().Be(expectedCount);
	}

	private async Task AssertInvitationRevokeAuditLogContentAsync(
		Guid invitationId,
		Guid expectedUserId
	) {
		using IServiceScope scope = _fixture.Factory.Services.CreateScope();
		AppDbContext dbContext = scope.ServiceProvider
			.GetRequiredService<AppDbContext>();

		var auditLog = await dbContext.AuditLog
			.Where(log =>
				log.TargetId == invitationId
				&& log.Action == AuditActions.InvitationRevoked
			)
			.OrderByDescending(log => log.CreatedAt)
			.FirstOrDefaultAsync();

		_ = auditLog.Should().NotBeNull();
		Assert.NotNull(auditLog);
		_ = auditLog.UserId.Should().Be(expectedUserId);
		_ = auditLog.Action.Should().Be(AuditActions.InvitationRevoked);
		_ = auditLog.TargetId.Should().Be(invitationId);
	}

	private sealed record BulkStaffInvitationActionResponse {
		public int SucceededCount { get; init; }
		public int FailedCount { get; init; }
		public List<BulkStaffInvitationActionFailedItemResponse> FailedItems { get; init; } =
			[];
	}

	private sealed record BulkStaffInvitationActionFailedItemResponse {
		public Guid InvitationId { get; init; }
		public string Reason { get; init; } = string.Empty;
	}
}
