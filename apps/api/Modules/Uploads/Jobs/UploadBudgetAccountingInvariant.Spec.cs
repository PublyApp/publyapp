using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Jobs;
using PublyApp.Api.Infrastructure.Storage;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.AuditLogs.Services;
using PublyApp.Api.Modules.Uploads.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Uploads.Jobs;

/// <summary>
/// Budget accounting invariant (#807 round-1 review, MAJOR finding 2):
/// <c>committed_bytes</c> on every budget row must equal Σ <c>size_bytes</c> over
/// that scope's LIVE Stored-or-later asset rows, at rest AND after every lifecycle
/// transition — including reclamation, the only path allowed to decrease
/// committed bytes. Before the upload-orphan-reclaim job existed NOTHING could
/// decrease <c>committed_bytes</c>: every replace permanently inflated both
/// budgets and a lowered ceiling was unrecoverable.
///
/// The check query mirrors the admission predicate's accounting basis
/// (state IN (Stored, Referenced, Orphaned); Reserved rows live in
/// <c>reserved_bytes</c>; Deleted rows are gone from accounting). It runs over a
/// fresh context after each transition so a drift between the budget row and the
/// asset table can never hide inside a shared change tracker or transaction.
/// </summary>
public sealed class UploadBudgetAccountingInvariantSpec : IClassFixture<ApiFixture> {
	private const string Purpose = Infrastructure.Storage.UploadAdmissionService.StaffUploadPurpose;

	private readonly ApiFixture _fixture;

	public UploadBudgetAccountingInvariantSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	[Fact]
	public async Task ItShouldKeepCommittedBytesEqualToLiveAssetBytesAcrossReclamation() {
		var reclaimPath = UniquePath("invariant-reclaimed");
		var survivorPath = UniquePath("invariant-survivor");
		var userId = await SeedUserAsync();
		var reclaimedBytes = 3000L;
		var survivorBytes = 1500L;

		await SeedCommittedAssetAsync(reclaimPath, userId, reclaimedBytes,
			UploadAssetState.Orphaned);
		await SeedCommittedAssetAsync(survivorPath, userId, survivorBytes,
			UploadAssetState.Stored);

		var expected = await ExpectedGlobalCommittedAsync();
		ReadGlobalCommitted(await SnapshotFreshAsync())
			.Should().Be(expected,
				"the seeded fixture must start from an internally consistent state");

		// Age the orphan into its grace window and run the ONLY legitimate
		// decreaser: the reclamation sweep.
		await AgeIntoGraceWindowAsync(reclaimPath);
		await RunReclaimerAsync();

		var after = await SnapshotFreshAsync();
		ReadGlobalCommitted(after).Should().Be(expected - reclaimedBytes,
			"reclamation releases exactly the deleted asset's bytes");
		GlobalInvariant(after).Should().BeTrue(
			"committed_bytes must equal Σ size_bytes over live Stored+ rows after reclaiming"
		);
		CreatorInvariant(after, userId).Should().BeTrue(
			"the creator scope must satisfy the same equality after reclaiming"
		);
	}

	[Fact]
	public async Task ItShouldKeepCreatorBudgetEqualPerCreatorAfterReclamation() {
		var firstUser = await SeedUserAsync();
		var secondUser = await SeedUserAsync();
		var firstPath = UniquePath("creator-invariant-1");
		var secondPath = UniquePath("creator-invariant-2");

		await SeedCommittedAssetAsync(firstPath, firstUser, 1200,
			UploadAssetState.Orphaned);
		await SeedCommittedAssetAsync(secondPath, secondUser, 8000,
			UploadAssetState.Stored);

		await AgeIntoGraceWindowAsync(firstPath);
		await RunReclaimerAsync();

		var after = await SnapshotFreshAsync();
		CreatorInvariant(after, firstUser).Should().BeTrue(
			"each creator's committed_bytes must equal that creator's live Stored+ bytes"
		);
		CreatorInvariant(after, secondUser).Should().BeTrue(
			"a creator whose assets were untouched must keep exact accounting too"
		);
	}

	// ── helpers ─────────────────────────────────────────────────────────────

	private static string UniquePath(string label) {
		return $"uploads/spec-budget-invariant/{label}/{Guid.NewGuid():N}.png";
	}

	private sealed record BudgetSnapshot(
		long GlobalCommitted,
		IReadOnlyDictionary<Guid, long> CreatorCommitted,
		IReadOnlyList<(string Path, Guid Creator, long Size)> LiveStoredAssets
	);

	private static long ReadGlobalCommitted(BudgetSnapshot snapshot) {
		return snapshot.GlobalCommitted;
	}

	// THE check query: global committed_bytes == Σ size_bytes over live assets in
	// Stored/Referenced/Orphaned. Reserved rows account in reserved_bytes; Deleted
	// rows are out of accounting entirely.
	private static bool GlobalInvariant(BudgetSnapshot snapshot) {
		var expected = snapshot.LiveStoredAssets.Sum(asset => asset.Size);
		return snapshot.GlobalCommitted == expected;
	}

	private static bool CreatorInvariant(BudgetSnapshot snapshot, Guid creatorUserId) {
		var expected = snapshot.LiveStoredAssets
			.Where(asset => asset.Creator == creatorUserId)
			.Sum(asset => asset.Size);
		return snapshot.CreatorCommitted.GetValueOrDefault(creatorUserId) == expected;
	}

	private static BudgetSnapshot Snapshot(AppDbContext dbContext) {
		var budgets = ReadBudgetRows(dbContext);
		var assets = ReadLiveStoredAssets(dbContext);
		return new BudgetSnapshot(
			budgets.GlobalCommitted,
			budgets.Creators,
			assets
		);
	}

	// Reads every budget row's accounting into memory; fresh contexts only, so the
	// numbers can never come from a stale change tracker.
	private static (long GlobalCommitted, IReadOnlyDictionary<Guid, long> Creators)
		ReadBudgetRows(AppDbContext dbContext) {
		var global = dbContext.Database
			.SqlQuery<long?>($"""
				SELECT committed_bytes AS "Value"
				FROM upload_budgets
				WHERE scope_kind = {(int)UploadBudgetScope.Global} AND scope_key IS NULL
				LIMIT 1
				""")
			.FirstOrDefaultAsync()
			.GetAwaiter()
			.GetResult() ?? 0;
		var creatorRows = dbContext.Database
			.SqlQuery<CreatorBudgetRow>($"""
				SELECT scope_key AS "ScopeKey", committed_bytes AS "CommittedBytes"
				FROM upload_budgets
				WHERE scope_kind = {(int)UploadBudgetScope.CreatorUser}
					AND scope_key IS NOT NULL
				""")
			.ToListAsync()
			.GetAwaiter()
			.GetResult();
		var creators = creatorRows.ToDictionary(
			row => Guid.Parse(row.ScopeKey), row => row.CommittedBytes
		);
		return (global, creators);
	}

	private static IReadOnlyList<(string Path, Guid Creator, long Size)>
		ReadLiveStoredAssets(AppDbContext dbContext) {
		var rows = dbContext.Database
			.SqlQuery<LiveAssetRow>($"""
				SELECT relative_path AS "RelativePath",
					created_by_user_id AS "CreatedByUserId",
					size_bytes AS "SizeBytes"
				FROM upload_assets
				WHERE is_deleted = false
					AND state IN (
						{(int)UploadAssetState.Stored},
						{(int)UploadAssetState.Referenced},
						{(int)UploadAssetState.Orphaned}
					)
				""")
			.ToListAsync()
			.GetAwaiter()
			.GetResult();
		return rows
			.Select(row => (row.RelativePath, row.CreatedByUserId, row.SizeBytes))
			.ToList();
	}

	private sealed class CreatorBudgetRow {
		public string ScopeKey { get; set; } = string.Empty;
		public long CommittedBytes { get; set; }
	}

	private sealed class LiveAssetRow {
		public string RelativePath { get; set; } = string.Empty;
		public Guid CreatedByUserId { get; set; }
		public long SizeBytes { get; set; }
	}

	private async Task<long> ExpectedGlobalCommittedAsync() {
		await using var dbContext = await CreateDbContextAsync();
		var total = await dbContext.Database
			.SqlQuery<long?>($"""
				SELECT COALESCE(SUM(size_bytes), 0)::bigint AS "Value"
				FROM upload_assets
				WHERE is_deleted = false
					AND state IN (
						{(int)UploadAssetState.Stored},
						{(int)UploadAssetState.Referenced},
						{(int)UploadAssetState.Orphaned}
					)
				""")
			.FirstOrDefaultAsync();
		return total ?? 0;
	}

	private async Task<BudgetSnapshot> SnapshotFreshAsync() {
		await using var dbContext = await CreateDbContextAsync();
		return Snapshot(dbContext);
	}

	private async Task RunReclaimerAsync() {
		await using var dbContext = await CreateDbContextAsync();
		using var scope = _fixture.Factory.Services.CreateScope();
		var handler = new UploadOrphanReclaimerHandler(
			dbContext,
			scope.ServiceProvider.GetRequiredService<IFileStorage>(),
			scope.ServiceProvider.GetRequiredService<IAuditLogService>(),
			NullLogger<UploadOrphanReclaimerHandler>.Instance
		);
		var outcome = await handler.HandleAsync(FakeContext(handler.JobType),
			CancellationToken.None);
		outcome.Should().BeOfType<JobOutcome.Success>();
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

	private async Task<Guid> SeedUserAsync() {
		using var scope = _fixture.Factory.Services.CreateScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var user = new User {
			Email = $"upload-invariant-spec-{Guid.NewGuid():N}@example.com",
			Password = "unused",
			IsVerified = true,
		};
		db.User.Add(user);
		await db.SaveChangesAsync();
		return user.GetRequiredId();
	}

	private async Task SeedCommittedAssetAsync(
		string path,
		Guid userId,
		long sizeBytes,
		UploadAssetState state
	) {
		using var scope = _fixture.Factory.Services.CreateScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		db.UploadAsset.Add(new UploadAsset {
			RelativePath = path,
			SizeBytes = sizeBytes,
			ContentType = "image/png",
			Purpose = Purpose,
			State = state,
			ReferenceCount = 0,
			DeleteNotBefore = state == UploadAssetState.Orphaned
				? DateTime.UtcNow.AddDays(-7)
				: null,
			CreatedByUserId = userId,
		});
		await db.SaveChangesAsync();

		// Budget rows exist only after the first admission seeds them; mirror that
		// idempotent config seeding before applying the accounting delta.
		var env = Lib.AppEnvironment.Instance;
		await db.Database.ExecuteSqlAsync($"""
			INSERT INTO upload_budgets (id, scope_kind, scope_key, max_bytes, reserved_bytes, committed_bytes)
			VALUES (uuidv7(), {(int)UploadBudgetScope.Global}, NULL, {env.UPLOAD_GLOBAL_MAX_BYTES}, 0, 0)
			ON CONFLICT (scope_kind, scope_key) DO NOTHING
			""");
		await db.Database.ExecuteSqlAsync($"""
			INSERT INTO upload_budgets (id, scope_kind, scope_key, max_bytes, reserved_bytes, committed_bytes)
			VALUES (uuidv7(), {(int)UploadBudgetScope.CreatorUser}, {userId.ToString()}, {env.UPLOAD_PER_STAFF_MAX_BYTES}, 0, 0)
			ON CONFLICT (scope_kind, scope_key) DO NOTHING
			""");
		await db.Database.ExecuteSqlAsync($"""
			UPDATE upload_budgets
			SET committed_bytes = committed_bytes + {sizeBytes}
			WHERE (scope_kind = {(int)UploadBudgetScope.Global} AND scope_key IS NULL)
				OR (scope_kind = {(int)UploadBudgetScope.CreatorUser}
					AND scope_key = {userId.ToString()})
			""");
	}

	private async Task AgeIntoGraceWindowAsync(string path) {
		await using var dbContext = await CreateDbContextAsync();
		await dbContext.Database.ExecuteSqlAsync($"""
			UPDATE upload_assets
			SET updated_at = NOW() - interval '8 days',
				delete_not_before = NOW() - interval '1 day'
			WHERE relative_path = {path}
			""");
	}

	private async Task<AppDbContext> CreateDbContextAsync() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var connectionString = scope.ServiceProvider
			.GetRequiredService<AppDbContext>()
			.Database.GetConnectionString();
		if (connectionString is null) {
			throw new InvalidOperationException(
				"Test database connection string was null."
			);
		}
		return new AppDbContext(
			new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(connectionString).Options
		);
	}
}
