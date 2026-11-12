using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Jobs;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.Auth.Entities;
using PublyApp.Api.Modules.Auth.Jobs;
using PublyApp.Api.Modules.Auth.Utils;
using PublyApp.Api.Modules.Impersonations.Entities;
using PublyApp.Api.Modules.Tenants.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Impersonations.Services;

public sealed class ImpersonationServiceSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;

	public ImpersonationServiceSpec(ApiFixture fixture) {
		this._Fixture = fixture;
	}

	[Fact]
	public async Task ItShouldRollbackSessionAndAuditWhenAuditInsertFails() {
		var (tenantId, sessionUserId) = await this._SeedTenantUserAsync();

		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var service = new ImpersonationService(
			dbContext,
			new Microsoft.AspNetCore.Http.HttpContextAccessor(),
			NullLogger<ImpersonationService>.Instance
		);

		var invalidStaffUserId = Guid.NewGuid();
		var act = async () => await service.CreateImpersonationSessionAsync(
			new CreateImpersonationSessionArgs(
				TenantId: tenantId,
				StaffUserId: invalidStaffUserId,
				Reason: "audit test"
			),
			CancellationToken.None
		);

		await act.Should().ThrowAsync<DbUpdateException>();

		await using var verify = this._CreateDbContext();
		(await verify.Session.AnyAsync(s =>
			s.UserId == sessionUserId
			&& s.IsImpersonation
		)).Should().BeFalse();

		(await verify.AuditLog.AnyAsync(a =>
			a.Action == AuditActions.ImpersonationStarted
			&& a.UserId == invalidStaffUserId
			&& a.TargetId == tenantId
		)).Should().BeFalse();
	}

	[Fact]
	public async Task ItShouldCreateSessionAndAuditOnSuccess() {
		var (tenantId, sessionUserId) = await this._SeedTenantUserAsync();
		var staffUserId = await this._SeedStaffActorAsync();

		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var service = new ImpersonationService(
			dbContext,
			new Microsoft.AspNetCore.Http.HttpContextAccessor(),
			NullLogger<ImpersonationService>.Instance
		);

		var session = await service.CreateImpersonationSessionAsync(
			new CreateImpersonationSessionArgs(
				TenantId: tenantId,
				StaffUserId: staffUserId,
				Reason: "audit pass"
			),
			CancellationToken.None
		);

		session.UserId.Should().Be(sessionUserId);
		session.IsImpersonation.Should().BeTrue();

		await using var verify = this._CreateDbContext();
		(await verify.Session.AnyAsync(s => s.Id == session.Id)).Should().BeTrue();
		(await verify.AuditLog.AnyAsync(a =>
			a.Action == AuditActions.ImpersonationStarted
			&& a.UserId == staffUserId
			&& a.TargetId == tenantId
		)).Should().BeTrue();
	}

	// #1519 — a late end call after the session sweep must answer AlreadyEnded, not
	// NotFound. Red without the tombstone: remove the `tombstones` CTE from
	// CleanupExpiredSessionsHandler and this spec returns NotFound.
	[Fact]
	public async Task ItShouldReportAlreadyEndedWhenEndIsCalledAfterTheSweep() {
		var (tenantId, _) = await this._SeedTenantUserAsync();
		var staffUserId = await this._SeedStaffActorAsync();
		var sessionId = await this._StartExpiredImpersonationAsync(tenantId, staffUserId);

		await this._RunSweepAsync();

		await using var verify = this._CreateDbContext();
		(await verify.Session.AnyAsync(s => s.Id == sessionId)).Should().BeFalse("the sweep removed the row");

		var tombstone = await verify.ImpersonationSessionEnd.SingleAsync(e => e.SessionId == sessionId);
		tombstone.Reason.Should().Be(ImpersonationEndReason.Expired);
		tombstone.EndedAt.Should().BeBefore(DateTime.UtcNow.AddMinutes(-30), "ended_at is the session's expiry");

		var result = await this._EndAsync(sessionId, staffUserId);
		result.Should().Be(ImpersonationEndResult.AlreadyEnded);
	}

	// Red without the sessions delete trigger: the presentation-time delete
	// (SessionService.GetSessionByToken) leaves no tombstone and the end returns NotFound.
	[Fact]
	public async Task ItShouldReportAlreadyEndedWhenTheExpiredRowWasDeletedAtPresentation() {
		var (tenantId, _) = await this._SeedTenantUserAsync();
		var staffUserId = await this._SeedStaffActorAsync();
		var sessionId = await this._StartExpiredImpersonationAsync(tenantId, staffUserId);
		string token;
		await using (var db = this._CreateDbContext()) {
			token = await db.Session.Where(s => s.Id == sessionId).Select(s => s.Token).SingleAsync();
		}

		await using (var scope = this._Fixture.Factory.Services.CreateAsyncScope()) {
			var sessions = scope.ServiceProvider.GetRequiredService<PublyApp.Api.Modules.Auth.Services.ISessionService>();
			(await sessions.GetSessionByToken(token)).Should().BeNull();
		}

		(await this._EndAsync(sessionId, staffUserId)).Should().Be(ImpersonationEndResult.AlreadyEnded);
	}

	// Expired-but-unswept answers AlreadyEnded, and a later removal still leaves the marker.
	[Fact]
	public async Task ItShouldStillReportAlreadyEndedAfterAnUnsweptExpiredRowIsLaterRemoved() {
		var (tenantId, _) = await this._SeedTenantUserAsync();
		var staffUserId = await this._SeedStaffActorAsync();
		var sessionId = await this._StartExpiredImpersonationAsync(tenantId, staffUserId);

		(await this._EndAsync(sessionId, staffUserId)).Should().Be(ImpersonationEndResult.AlreadyEnded);
		await this._RunSweepAsync();
		(await this._EndAsync(sessionId, staffUserId)).Should().Be(ImpersonationEndResult.AlreadyEnded);
	}

	// Red without the trigger: revoke-all deletes a live impersonation row with no marker.
	[Fact]
	public async Task ItShouldReportAlreadyEndedAfterRevokeAllSessionsForTheUser() {
		var (tenantId, userId) = await this._SeedTenantUserAsync();
		var staffUserId = await this._SeedStaffActorAsync();
		var sessionId = await this._StartImpersonationAsync(tenantId, staffUserId);

		await using (var scope = this._Fixture.Factory.Services.CreateAsyncScope()) {
			var sessions = scope.ServiceProvider.GetRequiredService<PublyApp.Api.Modules.Auth.Services.ISessionService>();
			(await sessions.RevokeAllSessionsForUserAsync(userId)).Should().BeGreaterThan(0);
		}

		await using var verify = this._CreateDbContext();
		(await verify.ImpersonationSessionEnd.SingleAsync(e => e.SessionId == sessionId))
			.Reason.Should().Be(ImpersonationEndReason.Revoked);
		(await this._EndAsync(sessionId, staffUserId)).Should().Be(ImpersonationEndResult.AlreadyEnded);
	}

	// Red without the trigger: the sessions.user_id ON DELETE CASCADE removes the row silently.
	[Fact]
	public async Task ItShouldReportAlreadyEndedAfterTheImpersonatedUserIsDeleted() {
		var (tenantId, userId) = await this._SeedTenantUserAsync();
		var staffUserId = await this._SeedStaffActorAsync();
		var sessionId = await this._StartImpersonationAsync(tenantId, staffUserId);

		await using (var db = this._CreateDbContext()) {
			_ = await db.Database.ExecuteSqlAsync($"DELETE FROM user_accounts WHERE user_id = {userId}");
			_ = await db.Database.ExecuteSqlAsync($"DELETE FROM users WHERE id = {userId}");
		}

		(await this._EndAsync(sessionId, staffUserId)).Should().Be(ImpersonationEndResult.AlreadyEnded);
	}

	// Red without the atomic delete claim (and with a naive tombstone insert): a duplicate
	// end used to raise a unique violation (500). Exactly one wins.
	[Fact]
	public async Task ItShouldAnswerOneEndedAndOneAlreadyEndedWhenTwoEndsRace() {
		var (tenantId, _) = await this._SeedTenantUserAsync();
		var staffUserId = await this._SeedStaffActorAsync();
		var sessionId = await this._StartImpersonationAsync(tenantId, staffUserId);

		var results = await Task.WhenAll(
			this._EndAsync(sessionId, staffUserId),
			this._EndAsync(sessionId, staffUserId)
		);

		results.Should().BeEquivalentTo([ImpersonationEndResult.Ended, ImpersonationEndResult.AlreadyEnded]);
		await using var verify = this._CreateDbContext();
		(await verify.ImpersonationSessionEnd.CountAsync(e => e.SessionId == sessionId)).Should().Be(1);
		(await verify.AuditLog.CountAsync(a =>
			a.Action == AuditActions.ImpersonationEnded && a.TargetId == sessionId
		)).Should().Be(1);
	}

	[Fact]
	public async Task ItShouldRollBackTheEndWhenTheAuditInsertFails() {
		var (tenantId, _) = await this._SeedTenantUserAsync();
		var staffUserId = await this._SeedStaffActorAsync();
		var sessionId = await this._StartImpersonationAsync(tenantId, staffUserId);

		var act = async () => await this._EndAsync(sessionId, Guid.NewGuid());
		await act.Should().ThrowAsync<DbUpdateException>();

		await using var verify = this._CreateDbContext();
		(await verify.Session.AnyAsync(s => s.Id == sessionId)).Should().BeTrue("the delete rolled back");
		(await verify.ImpersonationSessionEnd.AnyAsync(e => e.SessionId == sessionId)).Should().BeFalse();
		(await verify.AuditLog.AnyAsync(a =>
			a.Action == AuditActions.ImpersonationEnded && a.TargetId == sessionId
		)).Should().BeFalse();
	}

	[Fact]
	public async Task ItShouldReportNotFoundForAnUnknownSessionId() {
		var staffUserId = await this._SeedStaffActorAsync();

		var result = await this._EndAsync(Guid.NewGuid(), staffUserId);

		result.Should().Be(ImpersonationEndResult.NotFound);
	}

	[Fact]
	public async Task ItShouldReportAlreadyEndedForAnExpiredRowNotYetSwept() {
		var (tenantId, _) = await this._SeedTenantUserAsync();
		var staffUserId = await this._SeedStaffActorAsync();
		var sessionId = await this._StartExpiredImpersonationAsync(tenantId, staffUserId);

		var result = await this._EndAsync(sessionId, staffUserId);

		result.Should().Be(ImpersonationEndResult.AlreadyEnded);
	}

	[Fact]
	public async Task ItShouldEndALiveSessionWithAuditAndTombstoneThenReportAlreadyEnded() {
		var (tenantId, _) = await this._SeedTenantUserAsync();
		var staffUserId = await this._SeedStaffActorAsync();
		var sessionId = await this._StartImpersonationAsync(tenantId, staffUserId);

		(await this._EndAsync(sessionId, staffUserId)).Should().Be(ImpersonationEndResult.Ended);

		await using var verify = this._CreateDbContext();
		(await verify.Session.AnyAsync(s => s.Id == sessionId)).Should().BeFalse();
		var tombstone = await verify.ImpersonationSessionEnd.SingleAsync(e => e.SessionId == sessionId);
		tombstone.Reason.Should().Be(ImpersonationEndReason.Revoked);
		(await verify.AuditLog.AnyAsync(a =>
			a.Action == AuditActions.ImpersonationEnded
			&& a.UserId == staffUserId
			&& a.TargetId == sessionId
		)).Should().BeTrue();

		(await this._EndAsync(sessionId, staffUserId)).Should().Be(ImpersonationEndResult.AlreadyEnded);
	}

	[Fact]
	public async Task ItShouldNotTombstoneOrdinarySessionsWhenSweeping() {
		var staffUserId = await this._SeedStaffActorAsync();
		var token = $"tombstone-ordinary-{Guid.NewGuid():N}";
		await using var db = this._CreateDbContext();
		var session = new Session {
			UserId = staffUserId,
			Token = token,
			ExpiresAt = DateTime.UtcNow.AddMinutes(-5)
		};
		db.Session.Add(session);
		await db.SaveChangesAsync();

		await this._RunSweepAsync();

		await using var verify = this._CreateDbContext();
		(await verify.Session.AnyAsync(s => s.Token == token)).Should().BeFalse();
		(await verify.ImpersonationSessionEnd.AnyAsync(e => e.SessionId == session.Id)).Should().BeFalse();
	}

	[Fact]
	public async Task ItShouldPurgeOnlyTombstonesPastRetention() {
		await using var db = this._CreateDbContext();
		var oldId = Guid.NewGuid();
		var recentId = Guid.NewGuid();
		db.ImpersonationSessionEnd.AddRange(
			new ImpersonationSessionEnd {
				SessionId = oldId,
				EndedAt = DateTime.UtcNow.AddDays(-(CleanupExpiredSessionsHandler.TombstoneRetentionDays + 1)),
				Reason = ImpersonationEndReason.Expired
			},
			new ImpersonationSessionEnd {
				SessionId = recentId,
				EndedAt = DateTime.UtcNow.AddDays(-1),
				Reason = ImpersonationEndReason.Expired
			}
		);
		await db.SaveChangesAsync();

		try {
			await this._RunSweepAsync();

			await using var verify = this._CreateDbContext();
			(await verify.ImpersonationSessionEnd.AnyAsync(e => e.SessionId == oldId)).Should().BeFalse();
			(await verify.ImpersonationSessionEnd.AnyAsync(e => e.SessionId == recentId)).Should().BeTrue();
		} finally {
			await using var cleanup = this._CreateDbContext();
			_ = await cleanup.Database.ExecuteSqlAsync(
				$"DELETE FROM impersonation_session_ends WHERE session_id IN ({oldId}, {recentId})"
			);
		}

		// Past retention the id is genuinely unknown again.
		var staffUserId = await this._SeedStaffActorAsync();
		(await this._EndAsync(oldId, staffUserId)).Should().Be(ImpersonationEndResult.NotFound);
	}

	private async Task<Guid> _StartImpersonationAsync(Guid tenantId, Guid staffUserId) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var service = new ImpersonationService(
			scope.ServiceProvider.GetRequiredService<AppDbContext>(),
			new Microsoft.AspNetCore.Http.HttpContextAccessor(),
			NullLogger<ImpersonationService>.Instance
		);
		var session = await service.CreateImpersonationSessionAsync(
			new CreateImpersonationSessionArgs(tenantId, staffUserId, "end spec"),
			CancellationToken.None
		);
		return session.Id.GetValueOrDefault();
	}

	private async Task<Guid> _StartExpiredImpersonationAsync(Guid tenantId, Guid staffUserId) {
		var sessionId = await this._StartImpersonationAsync(tenantId, staffUserId);
		await using var db = this._CreateDbContext();
		_ = await db.Database.ExecuteSqlAsync(
			$"UPDATE sessions SET expires_at = now() - interval '1 hour', impersonation_expires_at = now() - interval '1 hour' WHERE id = {sessionId}"
		);
		return sessionId;
	}

	private async Task<ImpersonationEndResult> _EndAsync(Guid sessionId, Guid staffUserId) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var service = new ImpersonationService(
			scope.ServiceProvider.GetRequiredService<AppDbContext>(),
			new Microsoft.AspNetCore.Http.HttpContextAccessor(),
			NullLogger<ImpersonationService>.Instance
		);
		return await service.EndImpersonationSessionForStaffAsync(
			new EndImpersonationSessionArgs(sessionId, staffUserId),
			CancellationToken.None
		);
	}

	private async Task _RunSweepAsync() {
		await using var db = this._CreateDbContext();
		var handler = new CleanupExpiredSessionsHandler(db, NullLogger<CleanupExpiredSessionsHandler>.Instance);
		_ = await handler.HandleAsync(
			new JobContext {
				JobId = Guid.NewGuid(),
				JobType = handler.JobType,
				Payload = "{}",
				Attempts = 0,
				MaxAttempts = 10
			},
			CancellationToken.None
		);
	}

	private async Task<(Guid tenantId, Guid sessionUserId)> _SeedTenantUserAsync() {
		await using var db = this._CreateDbContext();
		var tenant = new Tenant {
			Code = $"tenant-{Guid.NewGuid():N}",
			Name = "Tenant",
			Status = TenantStatus.Active,
			MaxUsers = 100
		};
		db.Tenant.Add(tenant);

		var user = new User {
			Email = $"tenant-user-{Guid.NewGuid():N}@example.com",
			Password = PasswordUtils.HashPassword("unused-password"),
			FirstName = "Tenant",
			LastName = "User",
			Status = UserStatus.Active,
			IsVerified = true
		};
		db.User.Add(user);
		await db.SaveChangesAsync();

		db.UserAccount.Add(UserAccount.CreateTenantAccount(user.GetRequiredId(), tenant.GetRequiredId()));
		await db.SaveChangesAsync();

		return (tenant.GetRequiredId(), user.GetRequiredId());
	}

	private async Task<Guid> _SeedStaffActorAsync() {
		await using var db = this._CreateDbContext();
		var staff = new User {
			Email = $"staff-actor-{Guid.NewGuid():N}@example.com",
			Password = PasswordUtils.HashPassword("unused-password"),
			FirstName = "Staff",
			LastName = "Actor",
			Status = UserStatus.Active,
			IsVerified = true
		};
		db.User.Add(staff);
		await db.SaveChangesAsync();

		return staff.GetRequiredId();
	}

	private AppDbContext _CreateDbContext() {
		using var scope = this._Fixture.Factory.Services.CreateScope();
		var connectionString = scope.ServiceProvider
			.GetRequiredService<AppDbContext>()
			.Database.GetConnectionString();

		if (connectionString is null) {
			throw new InvalidOperationException("Test database connection string was null.");
		}

		return new AppDbContext(
			new DbContextOptionsBuilder<AppDbContext>()
				.UseNpgsql(connectionString)
				.Options
		);
	}
}
