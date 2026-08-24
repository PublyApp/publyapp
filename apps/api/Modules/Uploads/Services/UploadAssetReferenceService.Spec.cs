using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Uploads.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Uploads.Services;

/// <summary>
/// Integration specs for the atomic reference-count transitions (#807 F5). They run
/// against REAL Postgres (Testcontainers) because the guarantee under test —
/// acquire/release serialisation on the asset row's tuple lock — only exists inside
/// the database. These specs pin the anti-TOCTOU contract of the old inline
/// AnyAsync-then-delete cleanup: a transition that races another transition must
/// WAIT on the row lock and then re-evaluate its predicate against the committed
/// result, never slip past it on a stale read.
///
/// The deterministic two-context tests force the interleaving with an OPEN
/// TRANSACTION around one real service call (the service enlists in the ambient
/// transaction), launch the opposite transition on a second context, and assert it
/// stays blocked until the first transaction resolves. On the pre-F5 read-then-write
/// shape the second transition completes immediately — which is exactly why the
/// paired scratch-revert proof shows these tests going red.
/// </summary>
public sealed class UploadAssetReferenceServiceSpec : IClassFixture<ApiFixture> {
	private const string Purpose = Infrastructure.Storage.UploadAdmissionService.StaffUploadPurpose;

	private readonly ApiFixture _fixture;

	public UploadAssetReferenceServiceSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	[Fact]
	public async Task ItShouldMoveAnAssetFromStoredToReferencedAndBackToOrphaned() {
		var path = UniquePath("lifecycle");
		await SeedLiveAssetAsync(path, referenceCount: 0);

		var acquired = await CreateService().TryAddReferenceAsync(path);
		acquired.Should().BeTrue("a live Stored asset owns the path");
		var afterAcquire = await ReadAssetAsync(path);
		afterAcquire.State.Should().Be(UploadAssetState.Referenced);
		afterAcquire.ReferenceCount.Should().Be(1);

		var released = await CreateService().TryReleaseReferenceAsync(path);
		released.Should().BeTrue("the single reference can be released");
		var afterRelease = await ReadAssetAsync(path);
		afterRelease.State.Should().Be(UploadAssetState.Orphaned);
		afterRelease.ReferenceCount.Should().Be(0);
		afterRelease.DeleteNotBefore.Should().NotBeNull(
			"the sweeper may only act after the configured grace period"
		);

		var releasedAgain = await CreateService().TryReleaseReferenceAsync(path);
		releasedAgain.Should().BeFalse("an orphaned asset holds no reference to release");
	}

	[Fact]
	public async Task ItShouldRefuseAnAcquireThatWaitsBehindAReservationToZeroReferences() {
		// Deterministic TOCTOU proof (release side holds the lock): the release to
		// zero is UNCOMMITTED when the acquire fires. The acquire must block on the
		// tuple, and after the release commits it must re-evaluate its predicate
		// against the orphaned row and FAIL — it can never claim success on a path
		// whose delete-grace window has already opened.
		var path = UniquePath("race-release-holds");
		await SeedLiveAssetAsync(path, referenceCount: 1);

		var holderDb = CreateDbContext();
		await using var holderTransaction =
			await holderDb.Database.BeginTransactionAsync();
		var releaseHeld = await new UploadAssetReferenceService(holderDb)
			.TryReleaseReferenceAsync(path);
		releaseHeld.Should().BeTrue();

		var acquireProbe = RunOnSeparateContextAsync(
			service => service.TryAddReferenceAsync(path)
		);
		await AssertProbeStillBlockedAsync(acquireProbe);

		await holderTransaction.CommitAsync();

		var acquiredLate = await acquireProbe;
		acquiredLate.Should().BeFalse(
			"an acquire that serialised behind a release-to-zero must not resurrect the orphan"
		);
		var finalState = await ReadAssetAsync(path);
		finalState.State.Should().Be(UploadAssetState.Orphaned);
		finalState.ReferenceCount.Should().Be(0);
	}

	[Fact]
	public async Task ItShouldKeepAnAssetReferencedWhenAnAcquireCommitsBeforeARacingRelease() {
		// Deterministic TOCTOU proof (acquire side holds the lock): the release
		// fires while an UNCOMMITTED acquire sits on the tuple. It must wait, then
		// apply against the merged result: two references minus one leaves the
		// asset Referenced — never orphaned on a stale zero-count observation.
		var path = UniquePath("race-acquire-holds");
		await SeedLiveAssetAsync(path, referenceCount: 1);

		var holderDb = CreateDbContext();
		await using var holderTransaction =
			await holderDb.Database.BeginTransactionAsync();
		var acquireHeld = await new UploadAssetReferenceService(holderDb)
			.TryAddReferenceAsync(path);
		acquireHeld.Should().BeTrue();

		var releaseProbe = RunOnSeparateContextAsync(
			service => service.TryReleaseReferenceAsync(path)
		);
		await AssertProbeStillBlockedAsync(releaseProbe);

		await holderTransaction.CommitAsync();

		var releasedLate = await releaseProbe;
		releasedLate.Should().BeTrue(
			"after waiting on the acquire the release sees a positive reference count"
		);
		var finalState = await ReadAssetAsync(path);
		finalState.State.Should().Be(UploadAssetState.Referenced);
		finalState.ReferenceCount.Should().Be(1);
		finalState.DeleteNotBefore.Should().BeNull(
			"a still-referenced asset must never enter the deletion grace window"
		);
	}

	[Fact]
	public async Task ItShouldRefuseAnAcquireOnAPathThatWasAlreadyOrphaned() {
		var path = UniquePath("post-orphan");
		await SeedLiveAssetAsync(path, referenceCount: 1);
		(await CreateService().TryReleaseReferenceAsync(path)).Should().BeTrue();

		var lateAcquire = await CreateService().TryAddReferenceAsync(path);

		lateAcquire.Should().BeFalse(
			"a path inside its deletion grace window must not accept new references"
		);
		var untouched = await ReadAssetAsync(path);
		untouched.State.Should().Be(UploadAssetState.Orphaned);
		untouched.ReferenceCount.Should().Be(0);
	}

	[Fact]
	public async Task ItShouldConserveReferenceCountsAcrossParallelTransitions() {
		// Parallel storm over ONE asset row from independent contexts: whatever the
		// interleaving, every successful acquire/release is applied exactly once —
		// final count MUST equal the seeded count plus successes minus release
		// successes, the state must stay consistent with the count, and the
		// reference_count >= 0 check constraint must never trip.
		const int InitialCount = 5;
		const int AttemptsPerSide = 12;
		var path = UniquePath("storm");
		await SeedLiveAssetAsync(path, referenceCount: InitialCount);

		var acquireTasks = Enumerable.Range(0, AttemptsPerSide)
			.Select(_ => RunOnSeparateContextAsync(
				service => service.TryAddReferenceAsync(path)
			))
			.ToArray();
		var releaseTasks = Enumerable.Range(0, AttemptsPerSide)
			.Select(_ => RunOnSeparateContextAsync(
				service => service.TryReleaseReferenceAsync(path)
			))
			.ToArray();
		var acquires = await Task.WhenAll(acquireTasks);
		var releases = await Task.WhenAll(releaseTasks);

		var finalState = await ReadAssetAsync(path);
		finalState.ReferenceCount
			.Should().Be(InitialCount + acquires.Count(static acquired => acquired)
				- releases.Count(static released => released),
				"every committed transition is applied exactly once, none is lost");
		if (finalState.ReferenceCount > 0) {
			finalState.State.Should().Be(UploadAssetState.Referenced);
		} else {
			finalState.State.Should().Be(UploadAssetState.Orphaned);
			finalState.DeleteNotBefore.Should().NotBeNull();
		}
	}

	// ── helpers ─────────────────────────────────────────────────────────────

	private static string UniquePath(string label) {
		return $"uploads/spec-reference/{label}/{Guid.NewGuid():N}.png";
	}

	/// <summary>Assets carry created_by_user_id → a REAL user row is required.</summary>
	private async Task<Guid> SeedUserAsync() {
		using var scope = _fixture.Factory.Services.CreateScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var user = new User {
			Email = $"upload-reference-spec-{Guid.NewGuid():N}@example.com",
			Password = "unused",
			IsVerified = true,
		};
		db.User.Add(user);
		await db.SaveChangesAsync();
		return user.GetRequiredId();
	}

	private async Task SeedLiveAssetAsync(string path, int referenceCount) {
		using var scope = _fixture.Factory.Services.CreateScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		db.UploadAsset.Add(new UploadAsset {
			RelativePath = path,
			SizeBytes = 1024,
			ContentType = "image/png",
			Purpose = Purpose,
			State = referenceCount > 0
				? UploadAssetState.Referenced
				: UploadAssetState.Stored,
			ReferenceCount = referenceCount,
			CreatedByUserId = await SeedUserAsync(),
		});
		await db.SaveChangesAsync();
	}

	private AppDbContext CreateDbContext() {
		var connectionString = GetConnectionString();
		var dbContext = new AppDbContext(
			new DbContextOptionsBuilder<AppDbContext>()
				.UseNpgsql(connectionString)
				.Options
		);
		dbContext.Database.SetCommandTimeout(60);
		return dbContext;
	}

	private UploadAssetReferenceService CreateService() {
		return new UploadAssetReferenceService(CreateDbContext());
	}

	private async Task<bool> RunOnSeparateContextAsync(
		Func<UploadAssetReferenceService, Task<bool>> transitionAsync
	) {
		return await Task.Run(async () => {
			await using var dbContext = CreateDbContext();
			return await transitionAsync(new UploadAssetReferenceService(dbContext));
		});
	}

	private static async Task AssertProbeStillBlockedAsync(Task<bool> probe) {
		// Generous polling window: completion BEFORE the holder resolves is
		// impossible under the row lock (Postgres guarantees it), so any observed
		// completion means the transition skipped serialisation — the regression
		// these specs exist to catch.
		for (var attempt = 0; attempt < 8 && !probe.IsCompleted; attempt += 1) {
			await Task.Delay(50);
		}
		probe.IsCompleted.Should().BeFalse(
			"the racing transition must serialise behind the open transaction's row lock"
		);
	}

	private async Task<UploadAsset> ReadAssetAsync(string path) {
		using var scope = _fixture.Factory.Services.CreateScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var asset = await db.UploadAsset.AsNoTracking()
			.SingleAsync(a => a.RelativePath == path);
		return asset;
	}

	private string GetConnectionString() {
		using var scope = _fixture.Factory.Services.CreateScope();
		var connectionString = scope.ServiceProvider
			.GetRequiredService<AppDbContext>().Database.GetConnectionString();
		if (string.IsNullOrEmpty(connectionString)) {
			throw new InvalidOperationException(
				"Test database connection string was unexpectedly null."
			);
		}
		return connectionString;
	}
}
