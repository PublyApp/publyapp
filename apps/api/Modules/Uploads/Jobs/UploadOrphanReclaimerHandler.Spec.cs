using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Jobs;
using PublyApp.Api.Infrastructure.Storage;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.AuditLogs.Services;
using PublyApp.Api.Modules.Uploads.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Uploads.Jobs;

// Direct-invocation specs against REAL Postgres (Testcontainers): the guarantees under
// test — the locked final zero-reference recheck and the same-statement budget
// release — only exist inside the database. Isolation follows the retention-sweep
// convention: every asset carries a Guid-unique path owned by the test, assertions
// read only those rows/budget DELTAS (before → after around HandleAsync), and each
// test removes its own rows in finally.
public sealed class UploadOrphanReclaimerHandlerSpec : IClassFixture<ApiFixture> {
	private const string Purpose = Infrastructure.Storage.UploadAdmissionService.StaffUploadPurpose;

	private readonly ApiFixture _fixture;

	public UploadOrphanReclaimerHandlerSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	[Fact]
	public async Task ItShouldReclaimAnOrphanPastItsGraceWindowAndReleaseBothBudgetScopes() {
		var path = UniquePath("reclaim");
		var userId = await SeedUserAsync();
		var sizeBytes = 4096L;
		await SeedLiveAssetAsync(path, userId, sizeBytes, UploadAssetState.Orphaned);
		await MakeOrphanEligibleAsync(path);
		await SeedBlobFileAsync(path);
		var globalBefore = await ReadGlobalBudgetAsync();
		var creatorBefore = await ReadCreatorBudgetAsync(userId);

		var outcome = await RunHandlerAsync();

		outcome.Should().BeOfType<JobOutcome.Success>();
		await using var verify = await CreateDbContextAsync();
		var asset = await verify.UploadAsset.AsNoTracking()
			.SingleAsync(a => a.RelativePath == path);
		asset.State.Should().Be(UploadAssetState.Deleted,
			"the sweeper performs the documented Orphaned → Deleted transition");
		BlobExists(path).Should().BeFalse(
			"the blob must be physically removed before the row is flipped");
		(await ReadGlobalBudgetAsync()).Should().Be(globalBefore - sizeBytes,
			"committed_bytes must drop by the reclaimed bytes in the same statement");
		(await ReadCreatorBudgetAsync(userId)).Should().Be(creatorBefore - sizeBytes,
			"the creator scope must be debited together with the global scope");

		await CleanupAsync(path);
	}

	[Fact]
	public async Task ItShouldWriteADurableAuditEntryWithTheCauseOfTheDeletion() {
		var path = UniquePath("audit");
		var userId = await SeedUserAsync();
		await SeedLiveAssetAsync(path, userId, 1024, UploadAssetState.Orphaned);
		await MakeOrphanEligibleAsync(path);

		await RunHandlerAsync();

		await using var verify = await CreateDbContextAsync();
		var audits = await verify.AuditLog.AsNoTracking()
			.Where(a => a.Action == AuditActions.UploadAssetDeleted
				&& a.Details != null && a.Details.Contains(path))
			.ToListAsync();
		audits.Should().HaveCount(1,
			"the asset row survives as history but the audit trail records the physical deletion");
		audits[0].UserId.Should().Be(userId);

		await CleanupAsync(path);
	}

	[Fact]
	public async Task ItShouldNeverReclaimAnOrphanInsideItsGraceWindow() {
		var path = UniquePath("inside-window");
		var userId = await SeedUserAsync();
		await SeedLiveAssetAsync(path, userId, 1024, UploadAssetState.Orphaned);
		await SetInsideGraceWindowAsync(path);
		var globalBefore = await ReadGlobalBudgetAsync();

		await RunHandlerAsync();

		await using var verify = await CreateDbContextAsync();
		var asset = await verify.UploadAsset.AsNoTracking()
			.SingleAsync(a => a.RelativePath == path);
		asset.State.Should().Be(UploadAssetState.Orphaned,
			"delete_not_before has not passed; the sweeper must wait");
		(await ReadGlobalBudgetAsync()).Should().Be(globalBefore);

		await CleanupAsync(path);
	}

	[Fact]
	public async Task ItShouldNeverReclaimAReferencedAssetEvenWhenItsWindowHasPassed() {
		// The final TOCTOU recheck: a row that LOOKS eligible by its timestamps but
		// carries references (or left the Orphaned state) must survive the sweep.
		// Under the row lock the DELETE-side predicate restates state = Orphaned and
		// reference_count = 0, so a late acquire can never lose its blob.
		var path = UniquePath("referenced-guard");
		var userId = await SeedUserAsync();
		await SeedLiveAssetAsync(path, userId, 1024, UploadAssetState.Referenced);
		await ForceStaleTimestampsAsync(path);
		var globalBefore = await ReadGlobalBudgetAsync();

		await RunHandlerAsync();

		await using var verify = await CreateDbContextAsync();
		var asset = await verify.UploadAsset.AsNoTracking()
			.SingleAsync(a => a.RelativePath == path);
		asset.State.Should().Be(UploadAssetState.Referenced,
			"a referenced asset is never reclaimable, whatever its timestamps say");
		asset.ReferenceCount.Should().BeGreaterThan(0);
		(await ReadGlobalBudgetAsync()).Should().Be(globalBefore);

		await CleanupAsync(path);
	}

	[Fact]
	public async Task ItShouldDeleteAStaleReservedRowAndReleaseItsReservedBytes() {
		var path = UniquePath("stale-reserved");
		var userId = await SeedUserAsync();
		var sizeBytes = 2048L;
		await SeedLiveAssetAsync(path, userId, sizeBytes, UploadAssetState.Reserved);
		await BackdateUpdatedAtAsync(path, minutes: 10_000);
		var globalReservedBefore = await ReadGlobalReservedAsync();
		var creatorReservedBefore = await ReadCreatorReservedAsync(userId);
		var globalCommittedBefore = await ReadGlobalBudgetAsync();

		await RunHandlerAsync();

		await using var verify = await CreateDbContextAsync();
		(await verify.UploadAsset.AsNoTracking().AnyAsync(a => a.RelativePath == path))
			.Should().BeFalse(
				"a stale reservation vanishes entirely, exactly like a rolled-back one");
		(await ReadGlobalReservedAsync()).Should().Be(globalReservedBefore - sizeBytes,
			"the abandoned hold on the global pool must return");
		(await ReadCreatorReservedAsync(userId)).Should().Be(creatorReservedBefore - sizeBytes,
			"the abandoned hold on the creator pool must return");
		(await ReadGlobalBudgetAsync()).Should().Be(globalCommittedBefore,
			"releasing a reservation never touches committed bytes");

		await CleanupAsync(path);
	}

	[Fact]
	public async Task ItShouldNotTouchAFreshReservedRow() {
		var path = UniquePath("fresh-reserved");
		var userId = await SeedUserAsync();
		await SeedLiveAssetAsync(path, userId, 1024, UploadAssetState.Reserved);
		var globalBefore = await ReadGlobalBudgetAsync();

		await RunHandlerAsync();

		await using var verify = await CreateDbContextAsync();
		var asset = await verify.UploadAsset.AsNoTracking()
			.SingleAsync(a => a.RelativePath == path);
		asset.State.Should().Be(UploadAssetState.Reserved,
			"an in-flight upload attempt is nobody's garbage");
		(await ReadGlobalBudgetAsync()).Should().Be(globalBefore);

		await CleanupAsync(path);
	}

	[Fact]
	public async Task ItShouldBeIdempotentWhenRunTwice() {
		var path = UniquePath("idempotent");
		var userId = await SeedUserAsync();
		await SeedLiveAssetAsync(path, userId, 1024, UploadAssetState.Orphaned);
		await MakeOrphanEligibleAsync(path);
		var globalBefore = await ReadGlobalBudgetAsync();

		await RunHandlerAsync();
		await RunHandlerAsync();

		var globalAfterSecondRun = await ReadGlobalBudgetAsync();
		globalAfterSecondRun.Should().Be(globalBefore - 1024,
			"the second pass must find nothing eligible and debit nothing further");
		await using var verify = await CreateDbContextAsync();
		(await verify.AuditLog.AsNoTracking().CountAsync(a =>
				a.Action == AuditActions.UploadAssetDeleted && a.Details != null
				&& a.Details.Contains(path)))
			.Should().Be(1, "one physical deletion, one audit entry");

		await CleanupAsync(path);
	}

	[Fact]
	public async Task ItShouldKeepARowAccountedWhenItsBlobCannotBeRemoved() {
		// A storage layer that cannot delete must never cause unaccounted bytes: the
		// handler skips the row (leaving it Orphaned and fully budgeted) and bumps
		// updated_at so the retry spaces out instead of starving later candidates.
		var path = UniquePath("blob-failure");
		var userId = await SeedUserAsync();
		await SeedLiveAssetAsync(path, userId, 1024, UploadAssetState.Orphaned);
		await MakeOrphanEligibleAsync(path);
		var globalBefore = await ReadGlobalBudgetAsync();

		var outcome = await RunHandlerAsync(storage: new BlobSurvivesFileStorage());

		outcome.Should().BeOfType<JobOutcome.Success>(
			"one stuck blob is a postponed row, not a failed sweep");
		await using var verify = await CreateDbContextAsync();
		var asset = await verify.UploadAsset.AsNoTracking()
			.SingleAsync(a => a.RelativePath == path);
		asset.State.Should().Be(UploadAssetState.Orphaned,
			"the row must stay in its eligible state for a later pass");
		(await ReadGlobalBudgetAsync()).Should().Be(globalBefore,
			"bytes still on disk stay fully accounted for");
		asset.UpdatedAt.Should().BeAfter(DateTime.UtcNow.AddMinutes(-1),
			"the failed candidate's updated_at is bumped as a retry backoff");

		await CleanupAsync(path);
	}

	[Fact]
	public async Task ItShouldReclaimAStoredOrphanPastItsRetentionTtl() {
		// The fail-soft path keeps bytes accounted as a Stored row nobody
		// references (a blob MAY exist). Past UPLOAD_STORED_ORPHAN_TTL_MINUTES the
		// sweeper closes that last unbounded-growth path.
		var userId = await SeedUserAsync();
		var relativePath = await WriteCommittedUploadAsync(userId, 1500);
		BlobExists(relativePath).Should().BeTrue(
			"precondition: this flow wrote a REAL blob that the sweep must remove"
		);
		await BackdateUpdatedAtAsync(relativePath, minutes: 10_000);
		var globalBefore = await ReadGlobalBudgetAsync();

		await RunHandlerAsync();

		await using var verify = await CreateDbContextAsync();
		var asset = await verify.UploadAsset.AsNoTracking()
			.SingleAsync(a => a.RelativePath == relativePath);
		asset.State.Should().Be(UploadAssetState.Deleted,
			"a Stored orphan past its retention TTL is reclaimable");
		BlobExists(relativePath).Should().BeFalse(
			"the physical blob must be removed with the row transition"
		);
		(await ReadGlobalBudgetAsync()).Should().Be(globalBefore - 1500,
			"its bytes must leave committed_bytes when the row flips to Deleted");

		await CleanupAsync(relativePath);
	}

	[Fact]
	public async Task ItShouldReclaimAStoredOrphanOnlyAfterItsRetentionTtl() {
		var userId = await SeedUserAsync();
		var relativePath = await WriteCommittedUploadAsync(userId, 1200);
		var globalBefore = await ReadGlobalBudgetAsync();

		await RunHandlerAsync();

		await using var verify = await CreateDbContextAsync();
		var asset = await verify.UploadAsset.AsNoTracking()
			.SingleAsync(a => a.RelativePath == relativePath);
		asset.State.Should().Be(UploadAssetState.Stored,
			"a fresh Stored orphan is inside its retention window");
		(await ReadGlobalBudgetAsync()).Should().Be(globalBefore,
			"its bytes stay fully accounted while the window runs");

		await CleanupAsync(relativePath);
	}

	[Fact]
	public async Task ItShouldMakeALoweredCeilingAdmissibleAgainAfterReclaiming() {
		// The round-1 review scenario: an operator lowers a budget ceiling below
		// current committed bytes. Admission must fail closed NOW and recover
		// AFTER the sweeper releases the orphan's bytes — no permanent stall.
		var userId = await SeedUserAsync();
		var claimedBytes = 3000L;
		var probeBytes = 1000L;
		var relativePath = await WriteCommittedUploadAsync(userId, claimedBytes);

		// Drop THIS creator's ceiling below its (solely-owned) committed bytes.
		await using (var lower = await CreateDbContextAsync()) {
			await lower.Database.ExecuteSqlAsync($"""
				UPDATE upload_budgets
				SET max_bytes = {claimedBytes - 100}
				WHERE scope_kind = {(int)UploadBudgetScope.CreatorUser}
					AND scope_key = {userId.ToString()}
				""");
		}

		using (var refusedScope = _fixture.Factory.Services.CreateScope()) {
			var admission = refusedScope.ServiceProvider
				.GetRequiredService<IUploadAdmissionService>();
			var refused = await admission.BeginReservationAsync(
				userId, probeBytes, Purpose
			);
			refused.Admission.Should().BeOfType<UploadAdmissionResult.Rejected>()
				.Which.ExhaustedScope.Should().Be(UploadBudgetScope.CreatorUser,
					"the lowered ceiling must refuse new admissions fail-closed");
			await refused.DisposeAsync();
		}

		// A Stored orphan past its retention TTL holds exactly those bytes; the
		// sweep must give them back.
		await BackdateUpdatedAtAsync(relativePath, minutes: 10_000);
		await RunHandlerAsync();

		using (var admitScope = _fixture.Factory.Services.CreateScope()) {
			var admission = admitScope.ServiceProvider
				.GetRequiredService<IUploadAdmissionService>();
			var admitted = await admission.BeginReservationAsync(
				userId, probeBytes, Purpose
			);
			admitted.Admission.Should().BeOfType<UploadAdmissionResult.Accepted>(
				"reclaimed bytes must make the lowered ceiling admissible again"
			);
			await admitted.DisposeAsync();
		}

		await CleanupAsync(relativePath);
	}

	// ── helpers ─────────────────────────────────────────────────────────────

	// Drives the REAL admission flow end-to-end: reserve against the durable
	// budgets, save a real blob through IFileStorage, mark commit pending, commit.
	// The result is a Stored row nobody references — exactly the shape the
	// fail-soft "blob MAY exist" path leaves behind — with honest accounting.
	private async Task<string> WriteCommittedUploadAsync(Guid staffUserId, long sizeBytes) {
		using var scope = _fixture.Factory.Services.CreateScope();
		var admission = scope.ServiceProvider.GetRequiredService<IUploadAdmissionService>();
		await using var admissionScope = await admission.BeginReservationAsync(
			staffUserId, sizeBytes, Purpose
		);
		var asset = ((UploadAdmissionResult.Accepted)admissionScope.Admission).Asset;
		var storage = scope.ServiceProvider.GetRequiredService<IFileStorage>();
		var relativePath = await storage.SaveAsync(
			new MemoryStream(new byte[sizeBytes]), ".png"
		);
		asset.RelativePath = relativePath;
		asset.ContentType = "image/png";
		admissionScope.MarkCommitPending();
		await admissionScope.CommitAsync();
		return relativePath;
	}

	private static string UniquePath(string label) {
		return $"uploads/spec-reclaimer/{label}/{Guid.NewGuid():N}.png";
	}

	// Fresh context per assertion batch: raw SQL reads/writes must never ride a
	// shared change tracker, and hard DELETEs bypass the soft-delete interceptor.
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

	private async Task<JobOutcome> RunHandlerAsync(IFileStorage? storage = null) {
		await using var dbContext = await CreateDbContextAsync();
		using var scope = _fixture.Factory.Services.CreateScope();
		var handler = new UploadOrphanReclaimerHandler(
			dbContext,
			storage ?? scope.ServiceProvider.GetRequiredService<IFileStorage>(),
			scope.ServiceProvider.GetRequiredService<IAuditLogService>(),
			NullLogger<UploadOrphanReclaimerHandler>.Instance
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

	private async Task<Guid> SeedUserAsync() {
		using var scope = _fixture.Factory.Services.CreateScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var user = new User {
			Email = $"upload-reclaimer-spec-{Guid.NewGuid():N}@example.com",
			Password = "unused",
			IsVerified = true,
		};
		db.User.Add(user);
		await db.SaveChangesAsync();
		return user.GetRequiredId();
	}

	private async Task SeedLiveAssetAsync(
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
			ReferenceCount = state == UploadAssetState.Referenced ? 1 : 0,
			DeleteNotBefore = state == UploadAssetState.Orphaned
				? DateTime.UtcNow.AddDays(-7)
				: null,
			CreatedByUserId = userId,
		});
		await db.SaveChangesAsync();

		// Budget rows are config, not data: they exist only after the first
		// admission seeded them. Mirror that idempotent seeding, then account the
		// seeded bytes like the real flows would have: Stored+ rows live in
		// committed_bytes, Reserved rows in reserved_bytes.
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
		if (state == UploadAssetState.Reserved) {
			await db.Database.ExecuteSqlAsync($"""
				UPDATE upload_budgets
				SET committed_bytes = committed_bytes - {sizeBytes},
					reserved_bytes = reserved_bytes + {sizeBytes}
				WHERE (scope_kind = {(int)UploadBudgetScope.Global} AND scope_key IS NULL)
					OR (scope_kind = {(int)UploadBudgetScope.CreatorUser}
						AND scope_key = {userId.ToString()})
				""");
		}
	}

	// Makes an Orphaned row look naturally aged: its timestamps predate its
	// delete_not_before (the release stamped them together, days ago), so the
	// candidate scan accepts it the way production rows arrive.
	private async Task MakeOrphanEligibleAsync(string path) {
		await using var dbContext = await CreateDbContextAsync();
		await dbContext.Database.ExecuteSqlAsync($"""
			UPDATE upload_assets
			SET updated_at = NOW() - interval '8 days',
				delete_not_before = NOW() - interval '1 day'
			WHERE relative_path = {path}
			""");
	}

	// An Orphaned row whose grace window has NOT passed yet: delete_not_before sits
	// in the future while updated_at is old enough to pass the scan's age filter.
	private async Task SetInsideGraceWindowAsync(string path) {
		await using var dbContext = await CreateDbContextAsync();
		await dbContext.Database.ExecuteSqlAsync($"""
			UPDATE upload_assets
			SET delete_not_before = NOW() + interval '1 hour',
				updated_at = NOW() - interval '8 days'
			WHERE relative_path = {path}
			""");
	}

	// Timestamps alone must never make a row eligible: this ages an asset that is
	// NOT Orphaned-with-zero-references so the state/recount predicates (not the
	// clock) are what protect it.
	private async Task ForceStaleTimestampsAsync(string path) {
		await using var dbContext = await CreateDbContextAsync();
		await dbContext.Database.ExecuteSqlAsync($"""
			UPDATE upload_assets
			SET updated_at = NOW() - interval '8 days',
				delete_not_before = NOW() - interval '1 day'
			WHERE relative_path = {path}
			""");
	}

	private async Task BackdateUpdatedAtAsync(string path, int minutes) {
		await using var dbContext = await CreateDbContextAsync();
		await dbContext.Database.ExecuteSqlAsync($"""
			UPDATE upload_assets
			SET updated_at = NOW() - make_interval(mins => {minutes})
			WHERE relative_path = {path}
			""");
	}

	// Writes a real blob through the app's own storage so the happy-path spec proves
	// the physical removal end-to-end.
	private async Task SeedBlobFileAsync(string path) {
		using var scope = _fixture.Factory.Services.CreateScope();
		var storage = scope.ServiceProvider.GetRequiredService<IFileStorage>();
		var fullPath = Path.Combine(storage.RootPath, path.Replace('/', Path.DirectorySeparatorChar));
		Directory.CreateDirectory(Path.GetDirectoryName(fullPath)!);
		await File.WriteAllBytesAsync(fullPath, [1, 2, 3, 4]);
	}

	private bool BlobExists(string path) {
		using var scope = _fixture.Factory.Services.CreateScope();
		var storage = scope.ServiceProvider.GetRequiredService<IFileStorage>();
		var fullPath = Path.Combine(storage.RootPath, path.Replace('/', Path.DirectorySeparatorChar));
		return File.Exists(fullPath);
	}

	// Budget numbers move with every concurrent test-host activity, so assertions
	// consume DELTAS around HandleAsync rather than absolute values.
	private async Task<long> ReadGlobalBudgetAsync() {
		await using var dbContext = await CreateDbContextAsync();
		var value = await dbContext.Database
			.SqlQuery<long?>($"""
				SELECT committed_bytes AS "Value"
				FROM upload_budgets
				WHERE scope_kind = {(int)UploadBudgetScope.Global} AND scope_key IS NULL
				LIMIT 1
				""")
			.FirstOrDefaultAsync();
		return value ?? 0;
	}

	private async Task<long> ReadCreatorBudgetAsync(Guid userId) {
		await using var dbContext = await CreateDbContextAsync();
		var value = await dbContext.Database
			.SqlQuery<long?>($"""
				SELECT committed_bytes AS "Value"
				FROM upload_budgets
				WHERE scope_kind = {(int)UploadBudgetScope.CreatorUser}
					AND scope_key = {userId.ToString()}
				LIMIT 1
				""")
			.FirstOrDefaultAsync();
		return value ?? 0;
	}

	// Reserved rows hold their bytes in reserved_bytes, not committed_bytes.
	private async Task<long> ReadGlobalReservedAsync() {
		await using var dbContext = await CreateDbContextAsync();
		var value = await dbContext.Database
			.SqlQuery<long?>($"""
				SELECT reserved_bytes AS "Value"
				FROM upload_budgets
				WHERE scope_kind = {(int)UploadBudgetScope.Global} AND scope_key IS NULL
				LIMIT 1
				""")
			.FirstOrDefaultAsync();
		return value ?? 0;
	}

	private async Task<long> ReadCreatorReservedAsync(Guid userId) {
		await using var dbContext = await CreateDbContextAsync();
		var value = await dbContext.Database
			.SqlQuery<long?>($"""
				SELECT reserved_bytes AS "Value"
				FROM upload_budgets
				WHERE scope_kind = {(int)UploadBudgetScope.CreatorUser}
					AND scope_key = {userId.ToString()}
				LIMIT 1
				""")
			.FirstOrDefaultAsync();
		return value ?? 0;
	}

	// Removes exactly the rows this test created: the asset row(s) by unique path,
	// plus the audit entries the reclaimer wrote about them. Raw SQL because a
	// Deleted asset row must leave without tripping the soft-delete interceptor.
	private async Task CleanupAsync(string path) {
		await using var dbContext = await CreateDbContextAsync();
		var auditAction = AuditActions.UploadAssetDeleted;
		var auditPattern = $"%{path}%";
		await dbContext.Database.ExecuteSqlAsync($"""
			DELETE FROM audit_logs
			WHERE action = {auditAction} AND details LIKE {auditPattern}
			""");
		await dbContext.Database.ExecuteSqlAsync($"""
			DELETE FROM upload_assets WHERE relative_path = {path}
			""");
	}

	/// <summary>
	/// Storage double whose DeleteAsync reports the blob SURVIVING — the shape the
	/// handler must treat as "bytes may still exist".
	/// </summary>
	private sealed class BlobSurvivesFileStorage : IFileStorage {
		public string RootPath {
			get { return Path.Combine(Path.GetTempPath(), "upload-reclaimer-spec-unused"); }
		}

		public Task<string> SaveAsync(
			Stream content,
			string extension,
			CancellationToken cancellationToken = default
		) {
			throw new NotSupportedException("This spec double never saves.");
		}

		public Task<bool> DeleteAsync(
			string relativePath,
			CancellationToken cancellationToken = default
		) {
			return Task.FromResult(false);
		}
	}
}
