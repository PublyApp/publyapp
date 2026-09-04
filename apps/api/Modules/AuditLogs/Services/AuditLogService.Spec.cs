using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.AuditLogs.Services;

// #1507: IAuditLogService is [Scoped] and shares the caller's AppDbContext, so a
// transaction the caller opens on that shared context covers the audit
// SaveChanges: a rollback discards the audit row, a commit keeps it. That is the
// atomic pair the feature-flags plan (T6) promises — "both row + audit exist or
// neither" — but nothing pinned it. A past-lane singleton rewrite would have made
// the audit commit in its own scope per call, leaving a false 'traced but never
// applied' audit row when the override write rolled back.
//
// Both tests resolve the audit service from the SAME request scope as the caller
// (real DI wiring) and re-read through a NEW DbContext/connection after
// rollback/commit, so the assertion is durability — not same-connection visibility.
public sealed class AuditLogServiceSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public AuditLogServiceSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	[Fact]
	public async Task ItShouldRollBackTheAuditRowWithTheCallerTransaction() {
		var userId = await SeedUserAsync();

		await using (var scope = _fixture.Factory.Services.CreateAsyncScope()) {
			var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
			var auditLog = scope.ServiceProvider.GetRequiredService<IAuditLogService>();

			// The caller's transaction, on the shared scoped AppDbContext — this is the
			// shape the feature-flags override handler uses (#1051 T6).
			await using var transaction = await db.Database.BeginTransactionAsync();

			await auditLog.LogAsync(
				new CreateAuditLogArgs(
					UserId: userId,
					Action: "feature_flag.override.reverted",
					TargetId: null,
					Details: new { Flag = "demo_flag", Applied = false }
				)
			);

			// Caller rolls back — under a [Scoped] service that shares this DbContext
			// the audit row goes with it. Under a singleton + own-scope-per-call rewrite
			// the audit row would already be committed on a different context.
			await transaction.RollbackAsync();
		}

		await using var verify = CreateDbContext();
		(await verify.AuditLog.AsNoTracking()
			.CountAsync(entry => entry.UserId == userId
				&& entry.Action == "feature_flag.override.reverted"))
			.Should().Be(
				0,
				"[#1507] the audit row must ride the caller transaction; a rolled-back " +
				"override write must leave NO audit row (traced-without-applied would be a lie)."
			);
	}

	[Fact]
	public async Task ItShouldKeepTheAuditRowWhenTheCallerCommits() {
		var userId = await SeedUserAsync();
		const string action = "feature_flag.override.applied";

		await using (var scope = _fixture.Factory.Services.CreateAsyncScope()) {
			var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
			var auditLog = scope.ServiceProvider.GetRequiredService<IAuditLogService>();

			await using var transaction = await db.Database.BeginTransactionAsync();

			await auditLog.LogAsync(
				new CreateAuditLogArgs(
					UserId: userId,
					Action: action,
					TargetId: null,
					Details: new { Flag = "demo_flag", Applied = true }
				)
			);

			// Caller commits — the audit row must persist with the override write.
			await transaction.CommitAsync();
		}

		await using var verify = CreateDbContext();
		var row = await verify.AuditLog.AsNoTracking()
			.SingleAsync(entry => entry.UserId == userId && entry.Action == action);
		row.UserId.Should().Be(userId);
		row.Action.Should().Be(action);
	}

	// --- construction helpers -----------------------------------------------------

	private async Task<Guid> SeedUserAsync() {
		await using var db = CreateDbContext();
		var user = new User {
			Email = $"audit-tx-{Guid.NewGuid():N}@example.com",
			Password = "unused",
			IsVerified = true
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
