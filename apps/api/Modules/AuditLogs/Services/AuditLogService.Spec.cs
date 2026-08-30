using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.AuditLogs.Services;

/// <summary>
/// #1507 — does the audit line REALLY share the transaction of the write it
/// documents? The feature-flags plan (#1051, T6) promises the override write and
/// its audit row commit atomically: "assert both row + audit exist or neither".
/// This spec pins the enlistment contract of <see cref="AuditLogService"/>:
/// with the service resolved from the SAME request scope as the caller (both get
/// the one scoped <see cref="AppDbContext"/>), a transaction the caller opens on
/// that shared context also covers the audit save — rollback discards the audit
/// row, commit keeps it.
///
/// An audit writer that opened its OWN scope/context per call would silently
/// break the contract: the audit row would commit even when the caller's write
/// rolled back, leaving a trace of a change that never applied.
/// </summary>
public sealed class AuditLogServiceSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public AuditLogServiceSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	[Fact]
	public async Task ItShouldRollBackTheAuditRowWithTheCallerTransaction() {
		var userId = await SeedUserAsync();

		// One request scope: the caller's AppDbContext and the audit service's
		// AppDbContext are the SAME scoped instance (DI wiring, [Scoped] on both).
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var service = scope.ServiceProvider.GetRequiredService<IAuditLogService>();

		await using var transaction =
			await dbContext.Database.BeginTransactionAsync();

		// The write being audited is staged (not yet saved) inside the caller
		// transaction, then the audit call runs within the same scope.
		var victim = new User {
			Email = $"txn-victim-{Guid.NewGuid():N}@example.com",
			Password = "unused",
			IsVerified = true,
		};
		dbContext.User.Add(victim);
		await service.LogAsync(new CreateAuditLogArgs(
			UserId: userId,
			Action: AuditActions.TenantUserRemoved,
			TargetId: null,
			Details: new { Staged = true }
		));

		// The caller's write fails; the whole unit of work rolls back.
		await transaction.RollbackAsync();

		// Durability trap (#1507): re-read from a NEW connection — proving the row
		// really was discarded by the rollback, not merely hidden in the same scope.
		await using var verify = CreateDbContext();
		(await verify.AuditLog.CountAsync(a =>
			a.UserId == userId
			&& a.Action == AuditActions.TenantUserRemoved
		)).Should().Be(
			0,
			"[#1507] the audit row must ride the caller transaction; a rolled-back "
			+ "override write must leave NO audit row (traced-without-applied would "
			+ "be a lie)"
		);
		(await verify.User.AnyAsync(u => u.Id == victim.Id)).Should().BeFalse(
			"the staged write itself must also be gone"
		);
	}

	[Fact]
	public async Task ItShouldKeepTheAuditRowWhenTheCallerCommits() {
		var userId = await SeedUserAsync();

		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var service = scope.ServiceProvider.GetRequiredService<IAuditLogService>();

		await using var transaction =
			await dbContext.Database.BeginTransactionAsync();

		await service.LogAsync(new CreateAuditLogArgs(
			UserId: userId,
			Action: AuditActions.TenantUserRemoved,
			TargetId: null,
			Details: new { Committed = true }
		));

		await transaction.CommitAsync();

		// New connection: the audit row survived the commit.
		await using var verify = CreateDbContext();
		(await verify.AuditLog.CountAsync(a =>
			a.UserId == userId
			&& a.Action == AuditActions.TenantUserRemoved
		)).Should().Be(1, "a committed caller transaction must keep its audit row");
	}

	private async Task<Guid> SeedUserAsync() {
		await using var db = CreateDbContext();
		var user = new User {
			Email = $"audit-actor-{Guid.NewGuid():N}@example.com",
			Password = "unused",
			IsVerified = true,
		};
		db.User.Add(user);
		await db.SaveChangesAsync();
		return user.GetRequiredId();
	}

	private AppDbContext CreateDbContext() {
		using var scope = _fixture.Factory.Services.CreateScope();
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
