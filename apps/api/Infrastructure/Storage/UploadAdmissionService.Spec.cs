using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Uploads.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Infrastructure.Storage;

/// <summary>
/// Integration specs for the durable upload admission service (#807 F1). These run
/// against REAL Postgres (Testcontainers) because the guarantee under test — atomic
/// budget admission across concurrent contexts — only exists inside the database.
///
/// Each TEST METHOD gets its own ApiFixture (xUnit constructs the class per test,
/// and IAsyncLifetime wires a fresh fixture): durable budget accounting persists in
/// the database, so sharing one clone across tests would leak accounting between
/// them — exactly the coupling phase 2 introduces.
///
/// Budget numbers are config seeded from UPLOAD_GLOBAL_MAX_BYTES /
/// UPLOAD_PER_STAFF_MAX_BYTES, so specs drive accounting through the public
/// reservation flow instead of reconfiguring the process.
/// </summary>
public sealed class UploadAdmissionServiceSpec : IAsyncLifetime {
	private const string Purpose = UploadAdmissionService.StaffUploadPurpose;

	private readonly ApiFixture _fixture = new();

	public async Task InitializeAsync() {
		await _fixture.InitializeAsync();
	}

	public async Task DisposeAsync() {
		await _fixture.DisposeAsync();
	}

	private static long GlobalBudget {
		get { return AppEnvironment.Instance.UPLOAD_GLOBAL_MAX_BYTES; }
	}

	private static long PerStaffBudget {
		get { return AppEnvironment.Instance.UPLOAD_PER_STAFF_MAX_BYTES; }
	}

	[Fact]
	public async Task ItShouldRejectAReservationOnceTheGlobalBudgetIsSpent() {
		await FillGlobalBudgetToTheBrimAsync();

		// The fill must land on EXACTLY ONE global row (NULLS NOT DISTINCT
		// uniqueness) and drain it to the brim — otherwise the probe below
		// proves nothing about the real budget.
		var auditService = CreateService();
		var globalRows = await auditService.DbContext.UploadBudget
			.AsNoTracking()
			.Where(b => b.ScopeKind == UploadBudgetScope.Global)
			.ToListAsync();
		globalRows.Should().HaveCount(1,
			"the NULLS NOT DISTINCT unique index guarantees a single global row");
		globalRows[0].ReservedBytes.Should().Be(0);
		globalRows[0].CommittedBytes.Should().Be(GlobalBudget);

		var freshUserId = await SeedUserAsync();
		await using var refused = await CreateService()
			.BeginReservationAsync(freshUserId, 1, Purpose);

		refused.Admission.Should().BeOfType<UploadAdmissionResult.Rejected>()
			.Which.ExhaustedScope.Should().Be(UploadBudgetScope.Global);
	}

	[Fact]
	public async Task ItShouldApplyThePerCreatorBudgetIndependentlyPerUser() {
		var firstUserId = await SeedUserAsync();
		var secondUserId = await SeedUserAsync();

		await using var fullForFirst =
			await CreateService().BeginReservationAsync(firstUserId, PerStaffBudget, Purpose);
		fullForFirst.Admission.Should().BeOfType<UploadAdmissionResult.Accepted>();
		fullForFirst.MarkCommitPending();
		fullForFirst.Admission.As<UploadAdmissionResult.Accepted>().Asset.RelativePath = "uploads/a";
		await fullForFirst.CommitAsync();

		await using var refusedForFirst =
			await CreateService().BeginReservationAsync(firstUserId, 1, Purpose);
		refusedForFirst.Admission.Should().BeOfType<UploadAdmissionResult.Rejected>()
			.Which.ExhaustedScope.Should().Be(UploadBudgetScope.CreatorUser);

		// The global pool still has room: another creator is capped independently.
		await using var acceptedForSecond =
			await CreateService().BeginReservationAsync(secondUserId, 1, Purpose);
		acceptedForSecond.Admission.Should().BeOfType<UploadAdmissionResult.Accepted>();
	}

	[Fact]
	public async Task ItShouldReleaseAReservationWhenDisposalFollowsAFailedWrite() {
		var userId = await SeedUserAsync();
		var reservationBytes = PerStaffBudget / 2;

		var service = CreateService();
		var failedWrite = await service
			.BeginReservationAsync(userId, reservationBytes, Purpose);
		failedWrite.Admission.Should().BeOfType<UploadAdmissionResult.Accepted>();
		// No commit: simulate the write failing. Disposal must roll back.
		await failedWrite.DisposeAsync();

		var retryService = CreateService();
		await using var retry =
			await retryService.BeginReservationAsync(userId, PerStaffBudget, Purpose);
		retry.Admission.Should().BeOfType<UploadAdmissionResult.Accepted>(
			"the failed attempt's reservation must have released its bytes"
		);
		retry.MarkCommitPending();
		retry.Admission.As<UploadAdmissionResult.Accepted>().Asset.RelativePath = "uploads/b";
		await retry.CommitAsync();
	}

	[Theory]
	[InlineData(0)]
	[InlineData(-1)]
	public async Task ItShouldRejectNonPositiveByteCounts(long bytes) {
		var act = async () => await CreateService()
			.BeginReservationAsync(Guid.NewGuid(), bytes, Purpose);

		await act.Should().ThrowAsync<ArgumentOutOfRangeException>();
	}

	[Fact]
	public async Task ItShouldNeverAdmitConcurrentReservationsPastEitherBudget() {
		// Chunk slightly above an exact divisor of the creator budget: racing
		// admissions cannot all fit, and NO interleaving may admit more than 7
		// of them for one creator (8 chunks of budget, each chunk one byte short).
		const int Attempts = 12;
		var userId = await SeedUserAsync();
		var chunk = (PerStaffBudget / 8) + 1;
		var attempts = Enumerable.Range(0, Attempts)
			.Select(_ => Task.Run(async () => {
				var service = CreateService();
				await using var scope =
					await service.BeginReservationAsync(userId, chunk, Purpose);
				if (scope.Admission is not UploadAdmissionResult.Accepted accepted) {
					return scope.Admission;
				}
				accepted.Asset.RelativePath =
					$"uploads/spec-creator-race/{Guid.NewGuid():N}.bin";
				scope.MarkCommitPending();
				await scope.CommitAsync();
				return scope.Admission;
			}))
			.ToArray();

		var results = await Task.WhenAll(attempts);
		results.OfType<UploadAdmissionResult.Accepted>()
			.Should().HaveCountLessThanOrEqualTo(7,
				"the creator budget fits fewer than Attempts chunks and must never be exceeded");
		results.OfType<UploadAdmissionResult.Rejected>()
			.Should().NotBeEmpty("racing admissions cannot all fit");
	}

	[Fact]
	public async Task ItShouldBoundConcurrentReservationsAcrossDistinctUsersByGlobalBudget() {
		// Chunks sized so the CREATOR budget can never bind (each distinct user
		// attempts exactly one chunk): acceptance is bounded purely by the global
		// pool, which fits fewer than Attempts chunks.
		const int Attempts = 16;
		var chunk = Math.Min(GlobalBudget / 20, PerStaffBudget / 4);
		var userIds = new List<Guid>();
		for (var index = 0; index < Attempts; index += 1) {
			userIds.Add(await SeedUserAsync());
		}

		var attempts = Enumerable.Range(0, Attempts)
			.Select(index => Task.Run(async () => {
				var service = CreateService();
				await using var scope =
					await service.BeginReservationAsync(userIds[index], chunk, Purpose);
				if (scope.Admission is not UploadAdmissionResult.Accepted accepted) {
					return scope.Admission;
				}
				accepted.Asset.RelativePath =
					$"uploads/spec-global-race/{Guid.NewGuid():N}.bin";
				scope.MarkCommitPending();
				await scope.CommitAsync();
				return scope.Admission;
			}))
			.ToArray();

		var results = await Task.WhenAll(attempts);
		var accepted = results.OfType<UploadAdmissionResult.Accepted>().ToList();

		accepted.Should().HaveCountLessThanOrEqualTo(
			(int)(GlobalBudget / chunk),
			"the global budget fits fewer than Attempts chunks and must never be exceeded"
		);
		accepted.Sum(a => a.Asset.SizeBytes).Should().BeLessThanOrEqualTo(GlobalBudget);
		results.OfType<UploadAdmissionResult.Rejected>()
			.Should().HaveCountGreaterThanOrEqualTo(Attempts - (int)(GlobalBudget / chunk));
	}

	[Fact]
	public async Task ItShouldKeepAccountingDurableAcrossFreshServiceInstances() {
		// Phase 1's counter reset on process restart; phase 2's budgets live in
		// Postgres, so a brand-new service instance MUST see committed bytes.
		var userId = await SeedUserAsync();
		var half = PerStaffBudget / 2;

		var firstInstance = CreateService();
		var firstHalf =
			await firstInstance.BeginReservationAsync(userId, half, Purpose);
		firstHalf.Admission.Should().BeOfType<UploadAdmissionResult.Accepted>();
		firstHalf.MarkCommitPending();
		firstHalf.Admission.As<UploadAdmissionResult.Accepted>().Asset.RelativePath = "uploads/c1";
		await firstHalf.CommitAsync();
		await firstHalf.DisposeAsync();

		// A brand-new instance ("fresh process") admits the remaining half.
		var freshInstance = CreateService();
		var secondHalf =
			await freshInstance.BeginReservationAsync(userId, half, Purpose);
		secondHalf.Admission.Should().BeOfType<UploadAdmissionResult.Accepted>();
		secondHalf.MarkCommitPending();
		secondHalf.Admission.As<UploadAdmissionResult.Accepted>().Asset.RelativePath = "uploads/c2";
		await secondHalf.CommitAsync();
		await secondHalf.DisposeAsync();

		var restartedProcess = CreateService();
		await using var overAfterRestart =
			await restartedProcess.BeginReservationAsync(userId, 1, Purpose);
		overAfterRestart.Admission.Should().BeOfType<UploadAdmissionResult.Rejected>(
			"a restarted process must not resurrect capacity already spent"
		);
	}

	// ── helpers ─────────────────────────────────────────────────────────────

	/// <summary>Assets carry created_by_user_id → a REAL user row is required.</summary>
	private async Task<Guid> SeedUserAsync() {
		using var scope = _fixture.Factory.Services.CreateScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var user = new User {
			Email = $"upload-admission-spec-{Guid.NewGuid():N}@example.com",
			Password = "unused",
			IsVerified = true,
		};
		db.User.Add(user);
		await db.SaveChangesAsync();
		return user.GetRequiredId();
	}

	private async Task FillGlobalBudgetToTheBrimAsync() {
		// Distinct filler users per chunk: creator budgets never bind, so ONLY the
		// global pool limits how much lands — the condition under test.
		var chunk = PerStaffBudget;
		var remaining = GlobalBudget;

		while (remaining > 0) {
			var take = Math.Min(chunk, remaining);
			var fillerUserId = await SeedUserAsync();
			var service = CreateService();
			await using var scope =
				await service.BeginReservationAsync(fillerUserId, take, Purpose);
			scope.Admission.Should().BeOfType<UploadAdmissionResult.Accepted>();
			var asset = ((UploadAdmissionResult.Accepted)scope.Admission).Asset;
			asset.RelativePath = $"uploads/spec-filler/{Guid.NewGuid():N}.png";
			scope.MarkCommitPending();
			await scope.CommitAsync();
			remaining -= take;
		}
	}

	private UploadAdmissionService CreateService() {
		// A fresh AppDbContext per call mirrors a fresh request scope (and, for the
		// durability spec, a fresh process): no shared change tracker, same DB.
		using var scope = _fixture.Factory.Services.CreateScope();
		var connectionString = scope.ServiceProvider
			.GetRequiredService<AppDbContext>().Database.GetConnectionString();
		if (string.IsNullOrEmpty(connectionString)) {
			throw new InvalidOperationException(
				"Test database connection string was unexpectedly null."
			);
		}
		var dbContext = new AppDbContext(
			new DbContextOptionsBuilder<AppDbContext>()
				.UseNpgsql(connectionString)
				.Options
		);
		dbContext.Database.SetCommandTimeout(60);
		return new UploadAdmissionService(dbContext);
	}
}
