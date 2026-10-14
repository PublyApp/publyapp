using FluentAssertions;

using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Storage;
using PublyApp.Api.Lib;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.AuditLogs.Services;
using PublyApp.Api.Modules.Uploads.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Uploads.Handlers.Staff;

/// <summary>
/// Failure-path specs for the durable admission flow (#807 F1): what happens to
/// the Reserved asset row and the byte budgets when the handler dies between
/// reservation and commit. These run against real Postgres because the whole
/// point is that accounting survives process-level failure paths.
/// </summary>
public sealed class CreateStaffUploadFailureSpec : IClassFixture<ApiFixture> {
	private static readonly byte[] _PngBytes = [
		0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
		0x00, 0x00, 0x00, 0x0D, 0x00, 0x00
	];

	private readonly ApiFixture _Fixture;

	public CreateStaffUploadFailureSpec(ApiFixture fixture) {
		this._Fixture = fixture;
	}

	[Fact]
	public async Task ItShouldReleaseReservationWhenAuditFailsAndCleanupSucceeds() {
		var userId = await this._SeedUserAsync();
		await this._SeedCommittedBudgetRowForAsync(userId);
		var storage = new FakeStorage { DeleteResult = true };

		await CreateStaffUploadFailureSpec._InvokeAndExpectAuditFailure(
			userId, storage, new ThrowingAuditLogService(), this._CreateAdmissionService()
		);

		await this._AssertBudgetFullyReleasedAsync(userId);
		storage.DeleteCalls.Should().Be(1);
		storage.DeletedPaths.Should().ContainSingle().Which.Should().Be(storage.SavedPath);
	}

	[Theory]
	[InlineData(false)]
	[InlineData(true)]
	public async Task ItShouldRetainBytesWhenAuditFailureCleanupCannotBeConfirmed(
		bool throwOnDelete
	) {
		var userId = await this._SeedUserAsync();
		await this._SeedCommittedBudgetRowForAsync(userId);
		var storage = new FakeStorage {
			DeleteResult = false,
			ThrowOnDelete = throwOnDelete
		};

		await CreateStaffUploadFailureSpec._InvokeAndExpectAuditFailure(
			userId,
			storage,
			new ThrowingAuditLogService(),
			this._CreateAdmissionService()
		);

		// A blob may still exist: the bytes stay accounted (Stored orphan) instead
		// of being released back to budgets. Fail-closed admission.
		await this._AssertOrphanBytesRetainedAsync(userId, storage.SavedPath);
		storage.DeleteCalls.Should().Be(1);
		storage.DeletedPaths.Should().ContainSingle().Which.Should().Be(storage.SavedPath);
	}

	[Fact]
	public async Task ItShouldRetainBytesForAStorageFailureWithUnconfirmedCleanup() {
		var userId = await this._SeedUserAsync();
		await this._SeedCommittedBudgetRowForAsync(userId);
		var storage = new FakeStorage {
			SaveException = new StorageWriteException(
				relativePath: "uploads/failure-spec/failed-write.png",
				cleanupConfirmed: false,
				new IOException("partial write")
			),
			DeleteResult = false
		};

		var act = () => CreateStaffUploadFailureSpec._InvokeHandlerAsync(
			userId,
			storage,
			new ThrowingAuditLogService(),
			this._CreateAdmissionService()
		);

		await act.Should().ThrowAsync<Exception>();
		storage.DeleteCalls.Should().Be(1);
		// The handler stamps the attempted destination path carried by the
		// StorageWriteException onto the asset before cleanup runs.
		await this._AssertOrphanBytesRetainedAsync(
			userId, "uploads/failure-spec/failed-write.png"
		);
	}

	[Fact]
	public async Task ItShouldReleaseReservationWhenStorageFailureCleanupSucceeds() {
		var userId = await this._SeedUserAsync();
		await this._SeedCommittedBudgetRowForAsync(userId);
		var storage = new FakeStorage {
			SaveException = new StorageWriteException(
				relativePath: "uploads/failure-spec/failed-write.png",
				cleanupConfirmed: true,
				new IOException("partial write")
			),
			DeleteResult = true
		};

		var act = () => CreateStaffUploadFailureSpec._InvokeHandlerAsync(
			userId,
			storage,
			new ThrowingAuditLogService(),
			this._CreateAdmissionService()
		);

		await act.Should().ThrowAsync<Exception>();
		await this._AssertBudgetFullyReleasedAsync(userId);
	}

	// ── assertions ──────────────────────────────────────────────────────────

	private async Task _AssertBudgetFullyReleasedAsync(Guid userId) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var budgets = await dbContext.UploadBudget.Where(b =>
				b.ScopeKind == UploadBudgetScope.CreatorUser
				&& b.ScopeKey == userId.ToString()
			).ToListAsync();
		budgets.Should().ContainSingle("the warmup seeded its creator row");
		budgets[0].ReservedBytes.Should().Be(0, "cleanup was confirmed");
		// Only the warmup's own stored bytes remain; the failed attempt
		// released everything it had reserved.
		budgets[0].CommittedBytes.Should().Be(CreateStaffUploadFailureSpec._PngBytes.Length);
		dbContext.UploadAsset.IgnoreQueryFilters()
			.CountAsync(a => a.CreatedByUserId == userId
				&& !a.RelativePath.StartsWith("uploads/failure-spec/warmup-"))
			.Result.Should().Be(0, "the rollback removed the Reserved row");
	}

	private async Task _AssertOrphanBytesRetainedAsync(Guid userId, string expectedPath) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var budget = await dbContext.UploadBudget.Where(b =>
				b.ScopeKind == UploadBudgetScope.CreatorUser
				&& b.ScopeKey == userId.ToString()
			).SingleAsync();
		// Warmup bytes + the possibly-existing blob's bytes stay accounted.
		budget.CommittedBytes.Should().Be(CreateStaffUploadFailureSpec._PngBytes.Length * 2,
			"a possibly-existing blob must keep its bytes accounted for as an orphan");
		budget.ReservedBytes.Should().Be(0);
		var orphan = await dbContext.UploadAsset.IgnoreQueryFilters()
			.SingleAsync(a => a.CreatedByUserId == userId
				&& !a.RelativePath.StartsWith("uploads/failure-spec/warmup-"));
		orphan.State.Should().Be(UploadAssetState.Stored);
		orphan.RelativePath.Should().Be(expectedPath);
	}

	// ── helpers ─────────────────────────────────────────────────────────────

	private UploadAdmissionService _CreateAdmissionService() {
		using var scope = this._Fixture.Factory.Services.CreateScope();
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

	// Admission writes upload_assets rows FK-bound to users; every spec user
	// must exist for real (23503 otherwise).
	private async Task<Guid> _SeedUserAsync() {
		using var scope = this._Fixture.Factory.Services.CreateScope();
		var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var user = new User {
			Email = $"upload-failure-spec-{Guid.NewGuid():N}@example.com",
			Password = "unused",
			IsVerified = true,
		};
		db.User.Add(user);
		await db.SaveChangesAsync();
		return user.GetRequiredId();
	}

	// EnsureBudgetRowsExistAsync inserts budget rows inside the reservation
	// transaction; a failed attempt rolls that back, so assertions against
	// committed rows need the rows to pre-exist (a tiny committed warmup
	// reservation seeds them exactly like production traffic would).
	private async Task _SeedCommittedBudgetRowForAsync(Guid userId) {
		var admission = this._CreateAdmissionService();
		await using var scope =
			await admission.BeginReservationAsync(
				userId, CreateStaffUploadFailureSpec._PngBytes.Length, UploadAdmissionService.StaffUploadPurpose
			);
		scope.Admission.Should().BeOfType<UploadAdmissionResult.Accepted>();
		scope.MarkCommitPending();
		((UploadAdmissionResult.Accepted)scope.Admission).Asset.RelativePath =
			$"uploads/failure-spec/warmup-{Guid.NewGuid():N}.png";
		await scope.CommitAsync();
	}

	private static async Task _InvokeAndExpectAuditFailure(
		Guid userId,
		FakeStorage storage,
		IAuditLogService audit,
		UploadAdmissionService admission
	) {
		var act = () => CreateStaffUploadFailureSpec._InvokeHandlerAsync(userId, storage, audit, admission);

		await act.Should().ThrowAsync<InvalidOperationException>();
	}

	private static async Task _InvokeHandlerAsync(
		Guid userId,
		IFileStorage storage,
		IAuditLogService audit,
		UploadAdmissionService admission
	) {
		var formFile = new FormFile(
			new MemoryStream(CreateStaffUploadFailureSpec._PngBytes),
			0,
			CreateStaffUploadFailureSpec._PngBytes.Length,
			"file",
			"upload.png"
		) {
			Headers = new HeaderDictionary(),
			ContentType = "image/png"
		};

		await CreateStaffUpload.Handle(
			new RequestAuthContext {
				AccountStaff = UserAccount.CreateStaffAccount(userId)
			},
			storage,
			admission,
			audit,
			NullLogger<CreateStaffUpload>.Instance,
			formFile
		);
	}

	private sealed class ThrowingAuditLogService : IAuditLogService {
		public Task LogAsync(
			CreateAuditLogArgs args,
			CancellationToken cancellationToken = default
		) {
			throw new InvalidOperationException("audit failed");
		}

		public Task LogManyAsync(
			IReadOnlyCollection<CreateAuditLogArgs> argsList,
			CancellationToken cancellationToken = default
		) {
			throw new NotSupportedException();
		}
	}

	private sealed class FakeStorage : IFileStorage {
		public string RootPath {
			get { return "/tmp"; }
		}
		public bool DeleteResult { get; init; }
		public bool ThrowOnDelete { get; init; }
		public Exception? SaveException { get; init; }
		public int DeleteCalls { get; private set; }
		public List<string> DeletedPaths { get; } = [];

		// Unique per instance: the live-relative-path unique index correctly
		// forbids two Stored assets sharing one path, and every test in this
		// class shares one database clone.
		public string SavedPath { get; } =
			$"uploads/failure-spec/{Guid.NewGuid():N}.png";

		public Task<string> SaveAsync(
			Stream content,
			string extension,
			CancellationToken cancellationToken = default
		) {
			if (this.SaveException is not null) {
				throw this.SaveException;
			}

			return Task.FromResult(this.SavedPath);
		}

		public Task<bool> DeleteAsync(
			string relativePath,
			CancellationToken cancellationToken = default
		) {
			this.DeleteCalls += 1;
			this.DeletedPaths.Add(relativePath);
			if (this.ThrowOnDelete) {
				throw new IOException("delete failed");
			}

			return Task.FromResult(this.DeleteResult);
		}
	}
}
