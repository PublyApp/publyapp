using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Permissions.Entities;
using PublyApp.Api.Modules.Tenants.Entities;

using Xunit;

namespace PublyApp.Api.Tests.Data.DbContext;

public sealed class AppDbContextAuditTrackingSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public AppDbContextAuditTrackingSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	[Fact]
	public async Task ItShouldPreserveSoftDeleteStateForNewBaseAttributesAndPermissionEntities() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var tenantDeletedAt = new DateTime(2024, 02, 14, 12, 0, 0, DateTimeKind.Utc);
		var permissionDeletedAt = new DateTime(2024, 02, 13, 12, 0, 0, DateTimeKind.Utc);

		var tenant = new Tenant {
			Id = Guid.CreateVersion7(),
			Code = $"issue1013-tenant-{Guid.CreateVersion7():N}",
			Name = "Issue 1013 Tenant",
			Status = TenantStatus.Suspended,
			MaxUsers = 10,
			IsDeleted = true,
			DeletedAt = tenantDeletedAt,
		};

		var permission = Permission.CreateTenantPermission($"tenant.issue1013.{Guid.CreateVersion7():N}");
		permission.IsDeleted = true;
		permission.DeletedAt = permissionDeletedAt;

		await dbContext.Tenant.AddAsync(tenant);
		await dbContext.Permission.AddAsync(permission);
		await dbContext.SaveChangesAsync();

		var persistedTenant = await dbContext.Tenant.SingleAsync(t => t.Code == tenant.Code);
		persistedTenant.IsDeleted.Should().BeTrue();
		persistedTenant.DeletedAt.Should().Be(tenantDeletedAt);

		var persistedPermission = await dbContext.Permission.SingleAsync(p => p.Key == permission.Key);
		persistedPermission.IsDeleted.Should().BeTrue();
		persistedPermission.DeletedAt.Should().Be(permissionDeletedAt);
	}

	[Fact]
	public async Task ItShouldNormalizeInconsistentSoftDeletePairValuesOnInsert() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var tenant = new Tenant {
			Id = Guid.CreateVersion7(),
			Code = $"issue1013-tenant-normalized-{Guid.CreateVersion7():N}",
			Name = "Issue 1013 Tenant Normalized",
			Status = TenantStatus.Suspended,
			MaxUsers = 10,
			IsDeleted = false,
			DeletedAt = new DateTime(2024, 02, 12, 12, 0, 0, DateTimeKind.Utc),
		};

		var permission = Permission.CreateTenantPermission($"tenant.issue1013-normalized.{Guid.CreateVersion7():N}");
		permission.IsDeleted = true;
		permission.DeletedAt = null;

		await dbContext.Tenant.AddAsync(tenant);
		await dbContext.Permission.AddAsync(permission);
		await dbContext.SaveChangesAsync();

		var persistedTenant = await dbContext.Tenant.SingleAsync(t => t.Code == tenant.Code);
		persistedTenant.IsDeleted.Should().BeTrue("an explicit DeletedAt without IsDeleted=true is normalized as soft-deleted");
		persistedTenant.DeletedAt.Should().Be(tenant.DeletedAt);

		var persistedPermission = await dbContext.Permission.SingleAsync(p => p.Key == permission.Key);
		persistedPermission.IsDeleted.Should().BeTrue();
		persistedPermission.DeletedAt.Should().NotBeNull();
		persistedPermission.DeletedAt.Should().BeCloseTo(DateTime.UtcNow, precision: TimeSpan.FromSeconds(5));
	}

	/// <summary>
	/// An unspecified-kind <c>DeletedAt</c> is already UTC that lost its tag, so it must be
	/// tagged rather than converted.
	///
	/// Be aware of what this test can and cannot prove: on a host running in UTC,
	/// <c>ToUniversalTime()</c> and <c>SpecifyKind(Utc)</c> are observationally identical, so
	/// this assertion does NOT discriminate the two on UTC CI. It earns its keep on a
	/// developer machine in any other zone, where the wrong implementation shifts the
	/// deletion time by the host offset and this goes red. It is deliberately left as a
	/// host-sensitive guard rather than dropped — there is no way to vary the process time
	/// zone per test, and asserting nothing would be worse.
	/// </summary>
	[Fact]
	public async Task ItShouldTagAnUnspecifiedDeletedAtAsUtcWithoutShiftingIt() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var wallClock = new DateTime(2024, 02, 12, 12, 0, 0, DateTimeKind.Unspecified);

		var tenant = new Tenant {
			Id = Guid.CreateVersion7(),
			Code = $"issue1013-tenant-unspecified-{Guid.CreateVersion7():N}",
			Name = "Issue 1013 Tenant Unspecified DeletedAt",
			Status = TenantStatus.Suspended,
			MaxUsers = 10,
			IsDeleted = true,
			DeletedAt = wallClock,
		};

		await dbContext.Tenant.AddAsync(tenant);
		await dbContext.SaveChangesAsync();

		var persisted = await dbContext.Tenant.SingleAsync(t => t.Code == tenant.Code);
		persisted.IsDeleted.Should().BeTrue();
		persisted.DeletedAt.Should().Be(
			DateTime.SpecifyKind(wallClock, DateTimeKind.Utc),
			"an unspecified DeletedAt is already UTC and must keep its wall-clock value"
		);
	}
}
