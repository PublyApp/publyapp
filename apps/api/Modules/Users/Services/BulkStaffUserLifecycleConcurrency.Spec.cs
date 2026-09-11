
using System.Data.Common;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Users.Services;

public sealed class BulkStaffUserLifecycleConcurrencySpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;

	public BulkStaffUserLifecycleConcurrencySpec(ApiFixture fixture) {
		_Fixture = fixture;
	}

	[Fact]
	public async Task ItShouldReturnFailureItemWhenBulkSuspendTargetWasDeletedConcurrently() {
		var raceUserId = await _CreateStaffUserAsync(UserStatus.Active);
		var stableUserId = await _CreateStaffUserAsync(UserStatus.Active);

		var result = await _RunWithConcurrentUsersUpdateAsync(
			service => service.BulkSuspendStaffUsersAsync(
				[raceUserId, stableUserId]
			),
			(dbContext, cancellationToken) => _SoftDeleteStaffUserAsync(
				dbContext,
				raceUserId,
				cancellationToken
			)
		);

		result.SucceededCount.Should().Be(1);
		result.FailedCount.Should().Be(1);
		result.FailedItems.Should().ContainSingle(item =>
			item.UserId == raceUserId
			&& item.Error == "User not found"
		);

		var raceState = await _GetStaffUserStateAsync(raceUserId);
		raceState.IsDeleted.Should().BeTrue();
		raceState.Status.Should().Be(UserStatus.Active);
		raceState.HasLiveStaffAccount.Should().BeFalse();

		var stableState = await _GetStaffUserStateAsync(stableUserId);
		stableState.IsDeleted.Should().BeFalse();
		stableState.Status.Should().Be(UserStatus.Suspended);
		stableState.HasLiveStaffAccount.Should().BeTrue();
	}

	[Fact]
	public async Task ItShouldReturnFailureItemWhenBulkSuspendTargetWasSuspendedConcurrently() {
		var raceUserId = await _CreateStaffUserAsync(UserStatus.Active);
		var stableUserId = await _CreateStaffUserAsync(UserStatus.Active);

		var result = await _RunWithConcurrentUsersUpdateAsync(
			service => service.BulkSuspendStaffUsersAsync(
				[raceUserId, stableUserId]
			),
			(dbContext, cancellationToken) => _SetStaffUserStatusAsync(
				dbContext,
				raceUserId,
				UserStatus.Suspended,
				cancellationToken
			)
		);

		result.SucceededCount.Should().Be(1);
		result.FailedCount.Should().Be(1);
		result.FailedItems.Should().ContainSingle(item =>
			item.UserId == raceUserId
			&& item.Error == "User is already suspended"
		);

		var raceState = await _GetStaffUserStateAsync(raceUserId);
		raceState.IsDeleted.Should().BeFalse();
		raceState.Status.Should().Be(UserStatus.Suspended);
		raceState.HasLiveStaffAccount.Should().BeTrue();

		var stableState = await _GetStaffUserStateAsync(stableUserId);
		stableState.IsDeleted.Should().BeFalse();
		stableState.Status.Should().Be(UserStatus.Suspended);
		stableState.HasLiveStaffAccount.Should().BeTrue();
	}

	[Fact]
	public async Task ItShouldReturnFailureItemWhenBulkReactivateTargetWasDeletedConcurrently() {
		var raceUserId = await _CreateStaffUserAsync(UserStatus.Suspended);
		var stableUserId = await _CreateStaffUserAsync(UserStatus.Suspended);

		var result = await _RunWithConcurrentUsersUpdateAsync(
			service => service.BulkReactivateStaffUsersAsync(
				[raceUserId, stableUserId]
			),
			(dbContext, cancellationToken) => _SoftDeleteStaffUserAsync(
				dbContext,
				raceUserId,
				cancellationToken
			)
		);

		result.SucceededCount.Should().Be(1);
		result.FailedCount.Should().Be(1);
		result.FailedItems.Should().ContainSingle(item =>
			item.UserId == raceUserId
			&& item.Error == "User not found"
		);

		var raceState = await _GetStaffUserStateAsync(raceUserId);
		raceState.IsDeleted.Should().BeTrue();
		raceState.Status.Should().Be(UserStatus.Suspended);
		raceState.HasLiveStaffAccount.Should().BeFalse();

		var stableState = await _GetStaffUserStateAsync(stableUserId);
		stableState.IsDeleted.Should().BeFalse();
		stableState.Status.Should().Be(UserStatus.Active);
		stableState.HasLiveStaffAccount.Should().BeTrue();
	}

	[Fact]
	public async Task ItShouldReturnFailureItemWhenBulkReactivateTargetWasReactivatedConcurrently() {
		var raceUserId = await _CreateStaffUserAsync(UserStatus.Suspended);
		var stableUserId = await _CreateStaffUserAsync(UserStatus.Suspended);

		var result = await _RunWithConcurrentUsersUpdateAsync(
			service => service.BulkReactivateStaffUsersAsync(
				[raceUserId, stableUserId]
			),
			(dbContext, cancellationToken) => _SetStaffUserStatusAsync(
				dbContext,
				raceUserId,
				UserStatus.Active,
				cancellationToken
			)
		);

		result.SucceededCount.Should().Be(1);
		result.FailedCount.Should().Be(1);
		result.FailedItems.Should().ContainSingle(item =>
			item.UserId == raceUserId
			&& item.Error == "User is not currently suspended"
		);

		var raceState = await _GetStaffUserStateAsync(raceUserId);
		raceState.IsDeleted.Should().BeFalse();
		raceState.Status.Should().Be(UserStatus.Active);
		raceState.HasLiveStaffAccount.Should().BeTrue();

		var stableState = await _GetStaffUserStateAsync(stableUserId);
		stableState.IsDeleted.Should().BeFalse();
		stableState.Status.Should().Be(UserStatus.Active);
		stableState.HasLiveStaffAccount.Should().BeTrue();
	}

	[Fact]
	public async Task ItShouldReturnFailureItemWhenBulkDeleteTargetWasDeletedConcurrently() {
		var raceUserId = await _CreateStaffUserAsync(UserStatus.Suspended);
		var stableUserId = await _CreateStaffUserAsync(UserStatus.Suspended);

		var result = await _RunWithConcurrentUsersUpdateAsync(
			service => service.BulkDeleteStaffUsersAsync(
				[raceUserId, stableUserId]
			),
			(dbContext, cancellationToken) => _SoftDeleteStaffUserAsync(
				dbContext,
				raceUserId,
				cancellationToken
			)
		);

		result.SucceededCount.Should().Be(1);
		result.FailedCount.Should().Be(1);
		result.FailedItems.Should().ContainSingle(item =>
			item.UserId == raceUserId
			&& item.Error == "User not found"
		);

		var raceState = await _GetStaffUserStateAsync(raceUserId);
		raceState.IsDeleted.Should().BeTrue();
		raceState.Status.Should().Be(UserStatus.Suspended);
		raceState.HasLiveStaffAccount.Should().BeFalse();

		var stableState = await _GetStaffUserStateAsync(stableUserId);
		stableState.IsDeleted.Should().BeTrue();
		stableState.Status.Should().Be(UserStatus.Suspended);
		stableState.HasLiveStaffAccount.Should().BeFalse();
	}

	[Fact]
	public async Task ItShouldReturnFailureItemWhenBulkDeleteTargetWasReactivatedConcurrently() {
		var raceUserId = await _CreateStaffUserAsync(UserStatus.Suspended);
		var stableUserId = await _CreateStaffUserAsync(UserStatus.Suspended);

		var result = await _RunWithConcurrentUsersUpdateAsync(
			service => service.BulkDeleteStaffUsersAsync(
				[raceUserId, stableUserId]
			),
			(dbContext, cancellationToken) => _SetStaffUserStatusAsync(
				dbContext,
				raceUserId,
				UserStatus.Active,
				cancellationToken
			)
		);

		result.SucceededCount.Should().Be(1);
		result.FailedCount.Should().Be(1);
		result.FailedItems.Should().ContainSingle(item =>
			item.UserId == raceUserId
			&& item.Error == "User must be suspended before deletion"
		);

		var raceState = await _GetStaffUserStateAsync(raceUserId);
		raceState.IsDeleted.Should().BeFalse();
		raceState.Status.Should().Be(UserStatus.Active);
		raceState.HasLiveStaffAccount.Should().BeTrue();

		var stableState = await _GetStaffUserStateAsync(stableUserId);
		stableState.IsDeleted.Should().BeTrue();
		stableState.Status.Should().Be(UserStatus.Suspended);
		stableState.HasLiveStaffAccount.Should().BeFalse();
	}

	private async Task<Guid> _CreateStaffUserAsync(UserStatus status) {
		await using var scope = _Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var user = new User {
			Email = $"bulk-lifecycle-{Guid.NewGuid():N}@example.com",
			Password = "hashed-password",
			FirstName = "Bulk",
			LastName = "Lifecycle",
			IsVerified = true,
			Status = status,
		};

		dbContext.User.Add(user);
		await dbContext.SaveChangesAsync();

		var userId = user.GetRequiredId();
		var staffAccount = UserAccount.CreateStaffAccount(
			userId,
			AccountLevel.User
		);

		dbContext.UserAccount.Add(staffAccount);
		await dbContext.SaveChangesAsync();

		return userId;
	}

	private async Task<TResult> _RunWithConcurrentUsersUpdateAsync<TResult>(
		Func<StaffUserLifecycleService, Task<TResult>> operationAsync,
		Func<AppDbContext, CancellationToken, Task> mutateAsync
	) {
		var connectionString = await _GetConnectionStringAsync();
		var interceptor = new BeforeUsersUpdateInterceptor(async cancellationToken => {
			await using var mutateScope = _Fixture.Factory.Services.CreateAsyncScope();
			var mutateDbContext = mutateScope.ServiceProvider
				.GetRequiredService<AppDbContext>();

			await mutateAsync(mutateDbContext, cancellationToken);
		});

		var options = new DbContextOptionsBuilder<AppDbContext>()
			.UseNpgsql(connectionString)
			.AddInterceptors(interceptor)
			.Options;

		await using var dbContext = new AppDbContext(options);
		var service = new StaffUserLifecycleService(
			dbContext
		);

		return await operationAsync(service);
	}

	private async Task<string> _GetConnectionStringAsync() {
		await using var scope = _Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var connectionString = dbContext.Database.GetConnectionString();
		if (connectionString is null) {
			throw new InvalidOperationException(
				"Test database connection string was unexpectedly null."
			);
		}

		return connectionString;
	}

	private static async Task _SoftDeleteStaffUserAsync(
		AppDbContext dbContext,
		Guid userId,
		CancellationToken cancellationToken
	) {
		var now = DateTime.UtcNow;

		_ = await dbContext.User
			.Where(x => x.Id == userId && !x.IsDeleted)
			.ExecuteUpdateAsync(
				setters => setters
					.SetProperty(x => x.IsDeleted, true)
					.SetProperty(x => x.DeletedAt, now)
					.SetProperty(x => x.UpdatedAt, now),
				cancellationToken
			);

		_ = await dbContext.UserAccount
			.Where(x =>
				x.UserId == userId
				&& x.Scope == AccountScope.Staff
				&& !x.IsDeleted
			)
			.ExecuteUpdateAsync(
				setters => setters
					.SetProperty(x => x.IsDeleted, true)
					.SetProperty(x => x.DeletedAt, now)
					.SetProperty(x => x.UpdatedAt, now),
				cancellationToken
			);
	}

	private static async Task _SetStaffUserStatusAsync(
		AppDbContext dbContext,
		Guid userId,
		UserStatus status,
		CancellationToken cancellationToken
	) {
		_ = await dbContext.User
			.Where(x => x.Id == userId && !x.IsDeleted)
			.ExecuteUpdateAsync(
				setters => setters
					.SetProperty(x => x.Status, status)
					.SetProperty(x => x.UpdatedAt, DateTime.UtcNow),
				cancellationToken
			);
	}

	private async Task<StaffUserState> _GetStaffUserStateAsync(Guid userId) {
		await using var scope = _Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var user = await dbContext.User
			.IgnoreQueryFilters()
			.SingleAsync(x => x.Id == userId);

		var hasLiveStaffAccount = await dbContext.UserAccount
			.IgnoreQueryFilters()
			.AnyAsync(x =>
				x.UserId == userId
				&& x.Scope == AccountScope.Staff
				&& !x.IsDeleted
			);

		return new StaffUserState(
			IsDeleted: user.IsDeleted,
			Status: user.Status,
			HasLiveStaffAccount: hasLiveStaffAccount
		);
	}

	private sealed record StaffUserState(
		bool IsDeleted,
		UserStatus Status,
		bool HasLiveStaffAccount
	);

	private sealed class BeforeUsersUpdateInterceptor : DbCommandInterceptor {
		private readonly Func<CancellationToken, Task> _BeforeUsersUpdateAsync;
		private bool _HasRun;

		public BeforeUsersUpdateInterceptor(
			Func<CancellationToken, Task> beforeUsersUpdateAsync
		) {
			_BeforeUsersUpdateAsync = beforeUsersUpdateAsync;
		}

		public override async ValueTask<InterceptionResult<int>> NonQueryExecutingAsync(
			DbCommand command,
			CommandEventData eventData,
			InterceptionResult<int> result,
			CancellationToken cancellationToken = default
		) {
			if (
				!_HasRun
				&& (
					command.CommandText.Contains(
						"UPDATE users",
						StringComparison.OrdinalIgnoreCase
					)
					|| command.CommandText.Contains(
						"UPDATE \"users\"",
						StringComparison.OrdinalIgnoreCase
					)
				)
			) {
				_HasRun = true;
				await _BeforeUsersUpdateAsync(cancellationToken);
			}

			return await base.NonQueryExecutingAsync(
				command,
				eventData,
				result,
				cancellationToken
			);
		}
	}
}
