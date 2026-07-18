using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Invitations.Entities;
using PublyApp.Api.Modules.Invitations.Services;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Infrastructure.Messaging.Email;

// Exercises InvitationEmailOutboxDispatcher.SendOneAsync directly on rows scheduled
// far in the future, so the live background dispatcher started by the test host (it
// only picks up rows with NextAttemptAt <= now) never races these assertions.
public sealed class InvitationEmailOutboxDispatcherSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public InvitationEmailOutboxDispatcherSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	[Fact]
	public async Task ItShouldMarkRowSentWhenDeliverySucceeds() {
		var dispatcher = CreateDispatcher();
		await using var dbContext = await CreateDbContextAsync();

		var row = InvitationEmailOutbox.CreateStaffInvitation("succeed@example.com", "tok-succeed");
		row.NextAttemptAt = DateTime.UtcNow.AddDays(1);
		await dbContext.InvitationEmailOutbox.AddAsync(row);
		await dbContext.SaveChangesAsync();

		var emailService = new StubEmailService(shouldThrow: false);

		await dispatcher.SendOneAsync(dbContext, emailService, row, CancellationToken.None);

		row.Status.Should().Be(InvitationEmailOutboxStatus.Sent);
		row.SentAt.Should().NotBeNull();
		row.AttemptCount.Should().Be(0);
		emailService.StaffInvitationsSent.Should().Contain(("succeed@example.com", "tok-succeed"));
	}

	[Fact]
	public async Task ItShouldScheduleBackoffRetryWhenDeliveryFailsAndAttemptsRemain() {
		var dispatcher = CreateDispatcher();
		await using var dbContext = await CreateDbContextAsync();

		var row = InvitationEmailOutbox.CreateStaffInvitation("retry@example.com", "tok-retry");
		row.NextAttemptAt = DateTime.UtcNow.AddDays(1);
		await dbContext.InvitationEmailOutbox.AddAsync(row);
		await dbContext.SaveChangesAsync();

		var emailService = new StubEmailService(shouldThrow: true);
		var beforeAttempt = DateTime.UtcNow;

		await dispatcher.SendOneAsync(dbContext, emailService, row, CancellationToken.None);

		row.Status.Should().Be(InvitationEmailOutboxStatus.Pending);
		row.AttemptCount.Should().Be(1);
		row.LastError.Should().NotBeNullOrWhiteSpace();
		// Backoff for attempt 1 is 2^1 = 2 seconds.
		row.NextAttemptAt.Should().BeAfter(beforeAttempt.AddSeconds(1));
		row.NextAttemptAt.Should().BeBefore(beforeAttempt.AddSeconds(10));
	}

	[Fact]
	public async Task ItShouldMarkRowPermanentlyFailedWhenAttemptsAreExhausted() {
		var dispatcher = CreateDispatcher();
		await using var dbContext = await CreateDbContextAsync();

		var row = InvitationEmailOutbox.CreateStaffInvitation("exhausted@example.com", "tok-exhausted");
		row.NextAttemptAt = DateTime.UtcNow.AddDays(1);
		row.AttemptCount = InvitationEmailOutboxDispatcher.MaxAttempts - 1;
		await dbContext.InvitationEmailOutbox.AddAsync(row);
		await dbContext.SaveChangesAsync();

		var emailService = new StubEmailService(shouldThrow: true);

		await dispatcher.SendOneAsync(dbContext, emailService, row, CancellationToken.None);

		row.Status.Should().Be(InvitationEmailOutboxStatus.Failed);
		row.AttemptCount.Should().Be(InvitationEmailOutboxDispatcher.MaxAttempts);
	}

	[Fact]
	public async Task ItShouldDeliverTenantInvitationWithTenantNameAndAccountLevel() {
		var dispatcher = CreateDispatcher();
		await using var dbContext = await CreateDbContextAsync();

		var row = InvitationEmailOutbox.CreateTenantInvitation(
			"tenant-invite@example.com",
			"Acme Corp",
			"tok-tenant",
			AccountLevel.Admin
		);
		row.NextAttemptAt = DateTime.UtcNow.AddDays(1);
		await dbContext.InvitationEmailOutbox.AddAsync(row);
		await dbContext.SaveChangesAsync();

		var emailService = new StubEmailService(shouldThrow: false);

		await dispatcher.SendOneAsync(dbContext, emailService, row, CancellationToken.None);

		row.Status.Should().Be(InvitationEmailOutboxStatus.Sent);
		emailService.TenantInvitationsSent.Should().ContainSingle(
			e => e.Email == "tenant-invite@example.com"
				&& e.TenantName == "Acme Corp"
				&& e.Token == "tok-tenant"
				&& e.Level == AccountLevel.Admin
		);
	}

	// round-6 API F2: two dispatcher instances (a rolling deployment's old and
	// new replica, or two processes racing a poll tick) must never both claim
	// the same row — that duplicate-claim is exactly what caused the same
	// invitation email to be sent twice. Uses ClaimBatchAsync directly (not
	// ProcessBatchAsync) so the assertion is about claim exclusivity itself,
	// independent of send/email behavior. 50 rows gives generous margin over
	// the live background dispatcher's own BatchSize=20, so even if it also
	// races in and claims some rows first, plenty remain to prove the two
	// explicit claims below never overlap.
	[Fact]
	public async Task ItShouldNeverClaimTheSameRowFromTwoConcurrentDispatchers() {
		await using var seedContext = await CreateDbContextAsync();
		for (var i = 0; i < 50; i++) {
			var row = InvitationEmailOutbox.CreateStaffInvitation(
				$"claim-race-{Guid.NewGuid():N}@example.com",
				$"tok-{Guid.NewGuid():N}"
			);
			row.NextAttemptAt = DateTime.UtcNow;
			await seedContext.InvitationEmailOutbox.AddAsync(row);
		}
		await seedContext.SaveChangesAsync();

		await using var dbContextA = await CreateDbContextAsync();
		await using var dbContextB = await CreateDbContextAsync();

		var claimA = InvitationEmailOutboxDispatcher.ClaimBatchAsync(dbContextA, CancellationToken.None);
		var claimB = InvitationEmailOutboxDispatcher.ClaimBatchAsync(dbContextB, CancellationToken.None);
		var results = await Task.WhenAll(claimA, claimB);

		var claimedByA = results[0];
		var claimedByB = results[1];

		// The property SKIP LOCKED exists to guarantee: no id ever appears in
		// both claim sets, regardless of how many rows either side (or a third
		// racer) actually got.
		claimedByA.Intersect(claimedByB).Should().BeEmpty();

		// Guards against a vacuous pass (e.g. a bug that makes every claim
		// return empty): between the two explicit claimers, something must
		// have been claimed out of the 50 seeded rows.
		(claimedByA.Count + claimedByB.Count).Should().BeGreaterThan(0);
	}

	// Fold §5.4: synchronous outbox cancellation on revoke is RETIRED. Revoke no longer
	// mutates delivery rows; the send-time eligibility recheck (the adjacent
	// ItShouldCancelInsteadOfSendWhenTheLinkedInvitationIsNoLongerEligible test) is the
	// authoritative gate — a revoked invitation's row stays Pending and is cancelled at
	// send. This test now asserts that retirement (the row is NOT eagerly cancelled).
	[Fact]
	public async Task ItShouldNotSynchronouslyCancelTheOutboxRowWhenTheInvitationIsRevoked() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var revokeService = scope.ServiceProvider
			.GetRequiredService<IInvitationRevokeService>();

		var invitation = Invitation
			.CreateStaffInvitationWithProfiles(
				$"revoke-cancel-{Guid.NewGuid():N}@example.com",
				[],
				(await GetAnyStaffUserIdAsync(dbContext)),
				DateTime.UtcNow.AddDays(7),
				$"tok-{Guid.NewGuid():N}"
			);
		invitation.ValidateInvitationType();
		await dbContext.Invitation.AddAsync(invitation);

		var outboxRow = InvitationEmailOutbox.CreateStaffInvitation(invitation.Email, invitation.Token);
		outboxRow.Invitation = invitation;
		outboxRow.NextAttemptAt = DateTime.UtcNow.AddDays(1);
		await dbContext.InvitationEmailOutbox.AddAsync(outboxRow);
		await dbContext.SaveChangesAsync();

		var invitationId = invitation.GetRequiredId();
		var revokeResult = await revokeService.RevokeInvitationForStaffAsync(invitationId);
		revokeResult.Should().BeOfType<
			RevokeInvitationForStaffResult.Success
		>();

		await using var verifyScope = _fixture.Factory.Services.CreateAsyncScope();
		var verifyDbContext = verifyScope.ServiceProvider.GetRequiredService<AppDbContext>();
		var reloadedRow = await verifyDbContext.InvitationEmailOutbox
			.SingleAsync(o => o.Id == outboxRow.Id);

		// Retired: revoke does not eagerly cancel the row anymore (§5.4). It stays Pending
		// and the dispatcher's send-time recheck cancels-instead-of-sends it.
		reloadedRow.Status.Should().Be(InvitationEmailOutboxStatus.Pending);
	}

	// round-6 API F3: a row whose invitation went stale (revoked/accepted/
	// expired) between being written and being picked up must be cancelled
	// instead of sent — this is the delayed-dispatch gap the send-time recheck
	// closes (row written, provider down, invitation revoked before retry).
	[Fact]
	public async Task ItShouldCancelInsteadOfSendWhenTheLinkedInvitationIsNoLongerEligible() {
		var dispatcher = CreateDispatcher();
		await using var dbContext = await CreateDbContextAsync();

		var invitation = Invitation
			.CreateStaffInvitationWithProfiles(
				$"stale-{Guid.NewGuid():N}@example.com",
				[],
				(await GetAnyStaffUserIdAsync(dbContext)),
				DateTime.UtcNow.AddDays(7),
				$"tok-{Guid.NewGuid():N}"
			);
		invitation.ValidateInvitationType();
		invitation.Status = InvitationStatus.Revoked;
		invitation.RevokedAt = DateTime.UtcNow;
		await dbContext.Invitation.AddAsync(invitation);

		var row = InvitationEmailOutbox.CreateStaffInvitation(invitation.Email, invitation.Token);
		row.Invitation = invitation;
		row.NextAttemptAt = DateTime.UtcNow.AddDays(1);
		await dbContext.InvitationEmailOutbox.AddAsync(row);
		await dbContext.SaveChangesAsync();

		var emailService = new StubEmailService(shouldThrow: false);

		await dispatcher.SendOneAsync(dbContext, emailService, row, CancellationToken.None);

		row.Status.Should().Be(InvitationEmailOutboxStatus.Cancelled);
		emailService.StaffInvitationsSent.Should().BeEmpty();
	}

	private static async Task<Guid> GetAnyStaffUserIdAsync(AppDbContext dbContext) {
		var staffUser = await dbContext.User.FirstAsync();
		return staffUser.GetRequiredId();
	}

	private InvitationEmailOutboxDispatcher CreateDispatcher() {
		return new InvitationEmailOutboxDispatcher(
			_fixture.Factory.Services.GetRequiredService<IServiceScopeFactory>(),
			_fixture.Factory.Services.GetRequiredService<IInvitationEmailOutboxSignal>(),
			NullLogger<InvitationEmailOutboxDispatcher>.Instance
		);
	}

	private async Task<AppDbContext> CreateDbContextAsync() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var connectionString = scope.ServiceProvider
			.GetRequiredService<AppDbContext>()
			.Database.GetConnectionString();

		if (connectionString is null) {
			throw new InvalidOperationException("Test database connection string was unexpectedly null.");
		}

		return new AppDbContext(
			new DbContextOptionsBuilder<AppDbContext>()
				.UseNpgsql(connectionString)
				.Options
		);
	}

	private sealed class StubEmailService : IEmailService {
		private readonly bool _shouldThrow;

		public List<(string Email, string Token)> StaffInvitationsSent { get; } = [];
		public List<(string Email, string TenantName, string Token, AccountLevel Level)>
			TenantInvitationsSent { get; } = [];

		public StubEmailService(bool shouldThrow) {
			_shouldThrow = shouldThrow;
		}

		// F3 contract: IEmailService methods now return an EmailSendReceipt and throw a
		// classified exception on failure. This stub records the send and returns a
		// receipt; a simulated failure throws (the dispatcher catches it for retry).
		private static Task<EmailSendReceipt> Receipt() {
			return Task.FromResult(new EmailSendReceipt(Guid.NewGuid().ToString()));
		}

		public Task<EmailSendReceipt> SendWelComeEmailAsync(string email, string token) {
			throw new NotImplementedException();
		}

		public Task<EmailSendReceipt> SendEmailVerificationRequestAsync(string email, string token) {
			throw new NotImplementedException();
		}

		public Task<EmailSendReceipt> SendEmailVerifiedNotificationAsync(string email) {
			throw new NotImplementedException();
		}

		public Task<EmailSendReceipt> SendStaffWelcomeEmailAsync(string email, string token) {
			throw new NotImplementedException();
		}

		public Task<EmailSendReceipt> SendJoinedStaffNotificationEmailAsync(string email) {
			throw new NotImplementedException();
		}

		public Task<EmailSendReceipt> SendResetPasswordRequestEmailAsync(string email, string token) {
			throw new NotImplementedException();
		}

		public Task<EmailSendReceipt> SendPasswordResetNotificationEmailAsync(string email) {
			throw new NotImplementedException();
		}

		public Task<EmailSendReceipt> SendInvitationToJoinStaffEmailAsync(string email, string token) {
			if (_shouldThrow) {
				throw new EmailProviderPermanentException("StubEmailService: simulated send failure");
			}

			StaffInvitationsSent.Add((email, token));
			return Receipt();
		}

		public Task<EmailSendReceipt> SendTenantInvitationEmailAsync(
			string email,
			string tenantName,
			string token,
			AccountLevel level
		) {
			if (_shouldThrow) {
				throw new EmailProviderPermanentException("StubEmailService: simulated send failure");
			}

			TenantInvitationsSent.Add((email, tenantName, token, level));
			return Receipt();
		}
	}
}
