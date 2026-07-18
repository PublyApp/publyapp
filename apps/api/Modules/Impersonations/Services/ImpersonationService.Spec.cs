using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.AuditLogs.Entities;
using PublyApp.Api.Modules.Auth.Utils;
using PublyApp.Api.Modules.Tenants.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Impersonations.Services;

public sealed class ImpersonationServiceSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public ImpersonationServiceSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	[Fact]
	public async Task ItShouldRollbackSessionAndAuditWhenAuditInsertFails() {
		var (tenantId, sessionUserId) = await SeedTenantUserAsync();

		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var service = new ImpersonationService(
			dbContext,
			new Microsoft.AspNetCore.Http.HttpContextAccessor(),
			NullLogger<ImpersonationService>.Instance
		);

		var invalidStaffUserId = Guid.NewGuid();
		var act = async () => await service.CreateImpersonationSessionAsync(
			new CreateImpersonationSessionArgs(
				TenantId: tenantId,
				StaffUserId: invalidStaffUserId,
				Reason: "audit test"
			),
			CancellationToken.None
		);

		await act.Should().ThrowAsync<DbUpdateException>();

		await using var verify = CreateDbContext();
		(await verify.Session.AnyAsync(s =>
			s.UserId == sessionUserId
			&& s.IsImpersonation
		)).Should().BeFalse();

		(await verify.AuditLog.AnyAsync(a =>
			a.Action == AuditActions.ImpersonationStarted
			&& a.UserId == invalidStaffUserId
			&& a.TargetId == tenantId
		)).Should().BeFalse();
	}

	[Fact]
	public async Task ItShouldCreateSessionAndAuditOnSuccess() {
		var (tenantId, sessionUserId) = await SeedTenantUserAsync();
		var staffUserId = await SeedStaffActorAsync();

		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var service = new ImpersonationService(
			dbContext,
			new Microsoft.AspNetCore.Http.HttpContextAccessor(),
			NullLogger<ImpersonationService>.Instance
		);

		var session = await service.CreateImpersonationSessionAsync(
			new CreateImpersonationSessionArgs(
				TenantId: tenantId,
				StaffUserId: staffUserId,
				Reason: "audit pass"
			),
			CancellationToken.None
		);

		session.UserId.Should().Be(sessionUserId);
		session.IsImpersonation.Should().BeTrue();

		await using var verify = CreateDbContext();
		(await verify.Session.AnyAsync(s => s.Id == session.Id)).Should().BeTrue();
		(await verify.AuditLog.AnyAsync(a =>
			a.Action == AuditActions.ImpersonationStarted
			&& a.UserId == staffUserId
			&& a.TargetId == tenantId
		)).Should().BeTrue();
	}

	private async Task<(Guid tenantId, Guid sessionUserId)> SeedTenantUserAsync() {
		await using var db = CreateDbContext();
		var tenant = new Tenant {
			Code = $"tenant-{Guid.NewGuid():N}",
			Name = "Tenant",
			Status = TenantStatus.Active,
			MaxUsers = 100
		};
		db.Tenant.Add(tenant);

		var user = new User {
			Email = $"tenant-user-{Guid.NewGuid():N}@example.com",
			Password = PasswordUtils.HashPassword("unused-password"),
			FirstName = "Tenant",
			LastName = "User",
			Status = UserStatus.Active,
			IsVerified = true
		};
		db.User.Add(user);
		await db.SaveChangesAsync();

		db.UserAccount.Add(UserAccount.CreateTenantAccount(user.GetRequiredId(), tenant.GetRequiredId()));
		await db.SaveChangesAsync();

		return (tenant.GetRequiredId(), user.GetRequiredId());
	}

	private async Task<Guid> SeedStaffActorAsync() {
		await using var db = CreateDbContext();
		var staff = new User {
			Email = $"staff-actor-{Guid.NewGuid():N}@example.com",
			Password = PasswordUtils.HashPassword("unused-password"),
			FirstName = "Staff",
			LastName = "Actor",
			Status = UserStatus.Active,
			IsVerified = true
		};
		db.User.Add(staff);
		await db.SaveChangesAsync();

		return staff.GetRequiredId();
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
