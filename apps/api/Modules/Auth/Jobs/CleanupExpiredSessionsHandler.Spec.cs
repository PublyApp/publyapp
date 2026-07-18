using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Jobs;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Auth.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Auth.Jobs;

// Direct-invocation specs (design §9 public-methods-for-determinism): the handler is
// constructed against the test connection and HandleAsync is driven directly. Isolation:
// every session carries a Guid-suffixed token unique to the test, and assertions check
// ONLY those tokens — the sweep is global (DELETE ... WHERE expires_at <= now), so we
// never assert global counts, and each test cleans up its own rows.
public sealed class CleanupExpiredSessionsHandlerSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public CleanupExpiredSessionsHandlerSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	[Fact]
	public async Task ItShouldDeleteExpiredSessionsWhilePreservingLiveOnes() {
		var marker = $"cleanup-{Guid.NewGuid():N}";
		await using var dbContext = await CreateDbContextAsync();
		var userId = await GetSeedUserIdAsync(dbContext);

		try {
			var expired = new Guid?[] {
				await InsertSessionAsync(dbContext, userId, marker, minutesToExpiry: -60),
				await InsertSessionAsync(dbContext, userId, marker, minutesToExpiry: -5),
				await InsertSessionAsync(dbContext, userId, marker, minutesToExpiry: -1),
			};
			var live = new Guid?[] {
				await InsertSessionAsync(dbContext, userId, marker, minutesToExpiry: 5),
				await InsertSessionAsync(dbContext, userId, marker, minutesToExpiry: 120),
			};

			var result = await RunAsync(dbContext);
			result.Should().BeOfType<JobOutcome.Success>();

			await using var verify = await CreateDbContextAsync();
			var survivingExpired = await verify.Session
				.CountAsync(s => expired.Contains(s.Id));
			survivingExpired.Should().Be(0, "every expired session must be swept");

			var survivingLive = await verify.Session
				.Where(s => live.Contains(s.Id))
				.Select(s => s.Id)
				.ToListAsync();
			survivingLive.Should().BeEquivalentTo(live, "live sessions must be untouched");
		} finally {
			await CleanupAsync(marker);
		}
	}

	[Fact]
	public async Task ItShouldBeIdempotentWhenRunTwice() {
		var marker = $"cleanup-idem-{Guid.NewGuid():N}";
		await using var dbContext = await CreateDbContextAsync();
		var userId = await GetSeedUserIdAsync(dbContext);

		try {
			await InsertSessionAsync(dbContext, userId, marker, minutesToExpiry: -30);
			var liveId = await InsertSessionAsync(dbContext, userId, marker, minutesToExpiry: 60);

			await RunAsync(dbContext);
			// A second run must be a provably harmless no-op (the DELETE predicate matches
			// nothing new): the domain outcome marker is the deletion itself (F13).
			var secondOutcome = await RunAsync(dbContext);
			secondOutcome.Should().BeOfType<JobOutcome.Success>();

			await using var verify = await CreateDbContextAsync();
			var withMarker = await verify.Session.CountAsync(s => s.Token.StartsWith(marker));
			withMarker.Should().Be(1, "only the live session remains after either run");

			var liveStillThere = await verify.Session.AnyAsync(s => s.Id == liveId);
			liveStillThere.Should().BeTrue();
		} finally {
			await CleanupAsync(marker);
		}
	}

	[Fact]
	public async Task ItShouldNoOpWhenNothingIsExpired() {
		var marker = $"cleanup-noop-{Guid.NewGuid():N}";
		await using var dbContext = await CreateDbContextAsync();
		var userId = await GetSeedUserIdAsync(dbContext);

		try {
			var ids = new Guid?[] {
				await InsertSessionAsync(dbContext, userId, marker, minutesToExpiry: 10),
				await InsertSessionAsync(dbContext, userId, marker, minutesToExpiry: 240),
			};

			var result = await RunAsync(dbContext);
			result.Should().BeOfType<JobOutcome.Success>();

			await using var verify = await CreateDbContextAsync();
			var surviving = await verify.Session
				.Where(s => ids.Contains(s.Id))
				.Select(s => s.Id)
				.ToListAsync();
			surviving.Should().BeEquivalentTo(ids);
		} finally {
			await CleanupAsync(marker);
		}
	}

	[Fact]
	public async Task ItShouldContinuePastTheFiveHundredRowBatchBoundary() {
		var marker = $"cleanup-batch-{Guid.NewGuid():N}";
		await using var dbContext = await CreateDbContextAsync();
		var userId = await GetSeedUserIdAsync(dbContext);

		try {
			await dbContext.Database.ExecuteSqlAsync(
				$"""
				INSERT INTO sessions (
					user_id, token, expires_at, created_at, updated_at, is_impersonation
				)
				SELECT
					{userId},
					{marker} || '-' || sequence::text,
					now() - interval '1 hour',
					now(),
					now(),
					false
				FROM generate_series(1, 501) AS sequence
				"""
			);

			var result = await RunAsync(dbContext);
			result.Should().BeOfType<JobOutcome.Success>();

			await using var verify = await CreateDbContextAsync();
			(await verify.Session.CountAsync(s => s.Token.StartsWith(marker)))
				.Should().Be(0, "the handler must run a second delete batch");
		} finally {
			await CleanupAsync(marker);
		}
	}

	[Fact]
	public async Task ItShouldDeleteASessionExpiringAtExactlyDatabaseNow() {
		var marker = $"cleanup-exact-{Guid.NewGuid():N}";
		await using var dbContext = await CreateDbContextAsync();
		var userId = await GetSeedUserIdAsync(dbContext);

		// PostgreSQL now() is frozen at transaction start. Seeding and sweeping in this
		// transaction proves the inclusive expires_at <= now() boundary exactly.
		await using var transaction = await dbContext.Database.BeginTransactionAsync();
		try {
			await dbContext.Database.ExecuteSqlAsync(
				$"""
				INSERT INTO sessions (
					user_id, token, expires_at, created_at, updated_at, is_impersonation
				)
				VALUES ({userId}, {marker}, now(), now(), now(), false)
				"""
			);

			var result = await RunAsync(dbContext);
			result.Should().BeOfType<JobOutcome.Success>();
			(await dbContext.Session.AnyAsync(s => s.Token == marker))
				.Should().BeFalse("the cleanup boundary is inclusive");
		} finally {
			await transaction.RollbackAsync();
		}
	}

	// --- helpers ------------------------------------------------------------------------

	private static async Task<JobOutcome> RunAsync(AppDbContext dbContext) {
		var handler = new CleanupExpiredSessionsHandler(
			dbContext, NullLogger<CleanupExpiredSessionsHandler>.Instance
		);
		return await handler.HandleAsync(FakeContext(handler.JobType), CancellationToken.None);
	}

	private static JobContext FakeContext(string jobType) {
		return new JobContext {
			JobId = Guid.NewGuid(),
			JobType = jobType,
			Payload = "{}",
			Attempts = 0,
			MaxAttempts = 10,
		};
	}

	private static async Task<Guid> GetSeedUserIdAsync(AppDbContext dbContext) {
		var user = await dbContext.User.FirstAsync(u => u.Email == TestConstants.StaffAdminEmail);
		return user.GetRequiredId();
	}

	private static async Task<Guid> InsertSessionAsync(
		AppDbContext dbContext,
		Guid userId,
		string marker,
		int minutesToExpiry
	) {
		var session = new Session {
			UserId = userId,
			Token = $"{marker}-{Guid.NewGuid():N}",
			ExpiresAt = DateTime.UtcNow.AddMinutes(minutesToExpiry),
		};

		await dbContext.Session.AddAsync(session);
		await dbContext.SaveChangesAsync();

		return session.Id.GetValueOrDefault();
	}

	private async Task CleanupAsync(string marker) {
		await using var dbContext = await CreateDbContextAsync();
		await dbContext.Database.ExecuteSqlAsync(
			$"DELETE FROM sessions WHERE token LIKE {marker + "%"}"
		);
	}

	private async Task<AppDbContext> CreateDbContextAsync() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var connectionString = scope.ServiceProvider
			.GetRequiredService<AppDbContext>()
			.Database.GetConnectionString();

		if (connectionString is null) {
			throw new InvalidOperationException("Test database connection string was null.");
		}

		return new AppDbContext(
			new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(connectionString).Options
		);
	}
}
