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
/// trigger, so these specs exercise the service paths (a tracked-ish
/// <c>ExecuteUpdate</c> and a raw bulk <c>UPDATE</c>) rather than inserting rows
/// by hand: what is under test is that the trigger fires inside the caller's
/// transaction (#2349).
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
}
