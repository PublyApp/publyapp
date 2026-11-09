using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Data.Seeding;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Tenants.Services;

using Xunit;

namespace PublyApp.Api.Modules.Tenants.Entities;

/// <summary>
/// The lifecycle history is written by the <c>tenants_record_status_history</c>
/// trigger, so these specs exercise the database and the service paths (a
/// tracked-ish <c>ExecuteUpdate</c> and a raw bulk <c>UPDATE</c>) rather than
/// only inserting rows by hand: what is under test is that the trigger exists
/// and fires inside the caller's transaction, for every transition kind (#2349).
/// </summary>
public sealed class TenantStatusHistorySpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;

	public TenantStatusHistorySpec(ApiFixture fixture) {
		this._Fixture = fixture;
	}

	private static async Task<Guid> _AcmeTenantIdAsync(AppDbContext dbContext) {
		return await (
			from tenant in dbContext.Tenant.AsNoTracking()
			where tenant.Name == SeedConstants.Tenants.AcmeName
				&& !tenant.IsDeleted
				&& tenant.Id.HasValue
			select tenant.Id.GetValueOrDefault()
		).SingleAsync();
	}

	private static async Task<TenantStatusHistory> _LastRowAsync(
		AppDbContext dbContext,
		Guid tenantId
	) {
		return await dbContext.TenantStatusHistory
			.AsNoTracking()
			.Where(history => history.TenantId == tenantId)
			.OrderByDescending(history => history.OccurredAt)
			.ThenByDescending(history => history.Id)
			.FirstAsync();
	}

	private static async Task<List<TenantLifecycleStatus>> _StatusesAsync(
		AppDbContext dbContext,
		Guid tenantId
	) {
		return await dbContext.TenantStatusHistory
			.AsNoTracking()
			.Where(history => history.TenantId == tenantId)
			.OrderBy(history => history.OccurredAt)
			.ThenBy(history => history.Id)
			.Select(history => history.Status)
			.ToListAsync();
	}

	private static async Task _InsertActiveTenantAsync(
		AppDbContext dbContext,
		Guid tenantId
	) {
		var code = tenantId.ToString();
		var createdAt = DateTime.UtcNow;

		await dbContext.Database.ExecuteSqlAsync(
			$"""
			INSERT INTO tenants
				(id, code, name, status, max_users, created_at,
				 updated_at, is_deleted)
			VALUES
				({tenantId}, {code}, {code}, {(int)TenantStatus.Active},
				 5, {createdAt}, {createdAt}, false)
			"""
		);
	}

	private static async Task _DeleteTenantAndHistoryAsync(
		AppDbContext dbContext,
		Guid tenantId
	) {
		// Hard delete first: its DELETE arm writes the terminal row, which the
		// second statement then removes with the rest of this tenant's history.
		await dbContext.Database.ExecuteSqlAsync(
			$"""
			DELETE FROM tenants WHERE id = {tenantId}
			"""
		);
		await dbContext.Database.ExecuteSqlAsync(
			$"""
			DELETE FROM tenant_status_history WHERE tenant_id = {tenantId}
			"""
		);
	}

	[Fact]
	public async Task ItShouldHaveTheStatusHistoryTriggerInstalled() {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var trigger = await dbContext.Database
			.SqlQuery<TriggerRow>(
				$"""
				SELECT t.tgenabled::text AS "Enabled",
				       p.proname AS "FunctionName",
				       pg_get_triggerdef(t.oid) AS "Definition"
				FROM pg_trigger t
				JOIN pg_class c ON c.oid = t.tgrelid
				JOIN pg_proc p ON p.oid = t.tgfoid
				WHERE c.relname = 'tenants'
					AND t.tgname = 'tenants_record_status_history'
					AND NOT t.tgisinternal
				"""
			)
			.ToListAsync();

		trigger.Should().ContainSingle(
			"a missing trigger silently freezes the whole active-organisations curve"
		);
		var installed = trigger[0];
		installed.Enabled.Should().Be(
			"O",
			"the trigger must fire on every write, not be disabled or in replica mode"
		);
		installed.FunctionName.Should().Be("record_tenant_status_history");
		installed.Definition.Should().Contain(
			"AFTER INSERT OR DELETE OR UPDATE OF status, is_deleted ON public.tenants",
			"insert, status change, soft delete/restore and hard delete must all record"
		);
	}

	[Fact]
	public async Task ItShouldRecordEveryTransitionKind() {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var tenantId = Guid.NewGuid();

		try {
			// 1) INSERT: the creation transition is recorded.
			await TenantStatusHistorySpec._InsertActiveTenantAsync(dbContext, tenantId);
			(await TenantStatusHistorySpec._StatusesAsync(dbContext, tenantId))
				.Should()
				.Equal(TenantLifecycleStatus.Active);

			// 2) No-op UPDATE: an update that does not name the watched columns
			//    does not fire the trigger...
			await dbContext.Database.ExecuteSqlAsync(
				$"""
				UPDATE tenants SET name = 'renamed' WHERE id = {tenantId}
				"""
			);
			// ...and an update that names them with the same values is
			// short-circuited by the function's guard.
			await dbContext.Database.ExecuteSqlAsync(
				$"""
				UPDATE tenants SET status = {(int)TenantStatus.Active}
				WHERE id = {tenantId}
				"""
			);
			(await TenantStatusHistorySpec._StatusesAsync(dbContext, tenantId))
				.Should()
				.Equal(
					[TenantLifecycleStatus.Active],
					because: "a no-op update must not add a row"
				);

			// 3) Status change.
			await dbContext.Database.ExecuteSqlAsync(
				$"""
				UPDATE tenants SET status = {(int)TenantStatus.Suspended}
				WHERE id = {tenantId}
				"""
			);
			(await TenantStatusHistorySpec._LastRowAsync(dbContext, tenantId))
				.Status.Should().Be(TenantLifecycleStatus.Suspended);

			// 4) Soft delete: the tenant leaves the active curve.
			await dbContext.Database.ExecuteSqlAsync(
				$"""
				UPDATE tenants SET is_deleted = true, deleted_at = now()
				WHERE id = {tenantId}
				"""
			);
			(await TenantStatusHistorySpec._LastRowAsync(dbContext, tenantId))
				.Status.Should().Be(TenantLifecycleStatus.Deleted);

			// 5) Restore: the tenant comes back with the status it held.
			await dbContext.Database.ExecuteSqlAsync(
				$"""
				UPDATE tenants SET is_deleted = false, deleted_at = NULL
				WHERE id = {tenantId}
				"""
			);
			(await TenantStatusHistorySpec._LastRowAsync(dbContext, tenantId))
				.Status.Should().Be(TenantLifecycleStatus.Suspended);

			// 6) Hard delete: a terminal row, so the tenant stops being counted
			//    (no FK would otherwise clean this table).
			await dbContext.Database.ExecuteSqlAsync(
				$"""
				DELETE FROM tenants WHERE id = {tenantId}
				"""
			);
			(await TenantStatusHistorySpec._LastRowAsync(dbContext, tenantId))
				.Status.Should().Be(TenantLifecycleStatus.Deleted);

			(await TenantStatusHistorySpec._StatusesAsync(dbContext, tenantId))
				.Should()
				.Equal(
					TenantLifecycleStatus.Active,
					TenantLifecycleStatus.Suspended,
					TenantLifecycleStatus.Deleted,
					TenantLifecycleStatus.Suspended,
					TenantLifecycleStatus.Deleted
				);
		} finally {
			await TenantStatusHistorySpec._DeleteTenantAndHistoryAsync(
				dbContext,
				tenantId
			);
		}
	}

	[Fact]
	public void ItShouldKeepTheLifecycleNumbersAlignedWithTenantStatus() {
		// The bulk SQL casts TenantStatus straight into this table's integer
		// column; renumbering either enum silently corrupts the curve.
		((int)TenantLifecycleStatus.Pending).Should().Be((int)TenantStatus.Pending);
		((int)TenantLifecycleStatus.Active).Should().Be((int)TenantStatus.Active);
		((int)TenantLifecycleStatus.Suspended).Should()
			.Be((int)TenantStatus.Suspended);
		((int)TenantLifecycleStatus.Deleted).Should()
			.Be(40, "soft delete keeps status, so the history needs its own value");
	}

	[Fact]
	public async Task ItShouldRecordASuspendAndDropItWithTheRollback() {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var tenantService =
			scope.ServiceProvider.GetRequiredService<ITenantAsStaffService>();

		var tenantId = await TenantStatusHistorySpec._AcmeTenantIdAsync(dbContext);
		await tenantService.ReactivateTenantAsync(tenantId);
		var before = await dbContext.TenantStatusHistory
			.CountAsync(history => history.TenantId == tenantId);

		await using (var transaction =
			await dbContext.Database.BeginTransactionAsync()) {
			(await tenantService.SuspendTenantAsync(tenantId))
				.Should().BeOfType<SuspendTenantResult.Success>();

			// The row is already there, before any commit: the trigger ran in
			// the same transaction as the status change.
			(await dbContext.TenantStatusHistory
				.CountAsync(history => history.TenantId == tenantId))
				.Should().Be(before + 1);
			(await TenantStatusHistorySpec._LastRowAsync(dbContext, tenantId))
				.Status.Should().Be(TenantLifecycleStatus.Suspended);

			await transaction.RollbackAsync();
		}

		// Rolled back together: no orphan history for a transition that never
		// happened.
		(await dbContext.TenantStatusHistory
			.CountAsync(history => history.TenantId == tenantId))
			.Should().Be(before);
	}

	[Fact]
	public async Task ItShouldRecordTheBulkTransitionsToo() {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var tenantService =
			scope.ServiceProvider.GetRequiredService<ITenantAsStaffService>();

		var tenantId = await TenantStatusHistorySpec._AcmeTenantIdAsync(dbContext);
		await tenantService.ReactivateTenantAsync(tenantId);
		var before = await dbContext.TenantStatusHistory
			.CountAsync(history => history.TenantId == tenantId);

		var suspended = await tenantService.BulkSuspendAsync([tenantId]);
		suspended.SucceededCount.Should().Be(1);
		(await dbContext.TenantStatusHistory
			.CountAsync(history => history.TenantId == tenantId))
			.Should().Be(before + 1);
		(await TenantStatusHistorySpec._LastRowAsync(dbContext, tenantId))
			.Status.Should().Be(TenantLifecycleStatus.Suspended);

		var reactivated = await tenantService.BulkReactivateAsync([tenantId]);
		reactivated.SucceededCount.Should().Be(1);
		(await TenantStatusHistorySpec._LastRowAsync(dbContext, tenantId))
			.Status.Should().Be(TenantLifecycleStatus.Active);
	}

	private sealed record TriggerRow {
		public string? Enabled { get; init; }
		public string? FunctionName { get; init; }
		public string? Definition { get; init; }
	}
}
