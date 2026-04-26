namespace MainApi.Src.Modules.Users.Services;

using System.Data.Common;

using FluentAssertions;

using MainApi.Src.Data.DbContext;
using MainApi.Src.Lib.Testing.Fixtures;
using MainApi.Src.Modules.Users.Entities;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

using Xunit;

public sealed class BulkStaffUserLifecycleConcurrencySpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public BulkStaffUserLifecycleConcurrencySpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	[Fact]
	public async Task ItShouldReturnFailureItemWhenBulkSuspendTargetWasDeletedConcurrently() {
		var raceUserId = await CreateStaffUserAsync(UserStatus.Active);
		var stableUserId = await CreateStaffUserAsync(UserStatus.Active);

		var result = await RunWithConcurrentUsersUpdateAsync(
			service => service.BulkSuspendStaffUsersAsync(
				[raceUserId, stableUserId]
			),
			(dbContext, cancellationToken) => SoftDeleteStaffUserAsync(
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

		var raceState = await GetStaffUserStateAsync(raceUserId);
		raceState.IsDeleted.Should().BeTrue();
		raceState.Status.Should().Be(UserStatus.Active);
		raceState.HasLiveStaffAccount.Should().BeFalse();

		var stableState = await GetStaffUserStateAsync(stableUserId);
		stableState.IsDeleted.Should().BeFalse();
		stableState.Status.Should().Be(UserStatus.Suspended);
		stableState.HasLiveStaffAccount.Should().BeTrue();
	}

	[Fact]
	public async Task ItShouldReturnFailureItemWhenBulkSuspendTargetWasSuspendedConcurrently() {
		var raceUserId = await CreateStaffUserAsync(UserStatus.Active);
		var stableUserId = await CreateStaffUserAsync(UserStatus.Active);

		var result = await RunWithConcurrentUsersUpdateAsync(
			service => service.BulkSuspendStaffUsersAsync(
				[raceUserId, stableUserId]
			),
			(dbContext, cancellationToken) => SetStaffUserStatusAsync(
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

		var raceState = await GetStaffUserStateAsync(raceUserId);
		raceState.IsDeleted.Should().BeFalse();
		raceState.Status.Should().Be(UserStatus.Suspended);
		raceState.HasLiveStaffAccount.Should().BeTrue();

		var stableState = await GetStaffUserStateAsync(stableUserId);
		stableState.IsDeleted.Should().BeFalse();
		stableState.Status.Should().Be(UserStatus.Suspended);
		stableState.HasLiveStaffAccount.Should().BeTrue();
	}

	[Fact]
	public async Task ItShouldReturnFailureItemWhenBulkReactivateTargetWasDeletedConcurrently() {
		var raceUserId = await CreateStaffUserAsync(UserStatus.Suspended);
		var stableUserId = await CreateStaffUserAsync(UserStatus.Suspended);

		var result = await RunWithConcurrentUsersUpdateAsync(
			service => service.BulkReactivateStaffUsersAsync(
				[raceUserId, stableUserId]
			),
			(dbContext, cancellationToken) => SoftDeleteStaffUserAsync(
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

		var raceState = await GetStaffUserStateAsync(raceUserId);
		raceState.IsDeleted.Should().BeTrue();
		raceState.Status.Should().Be(UserStatus.Suspended);
		raceState.HasLiveStaffAccount.Should().BeFalse();

		var stableState = await GetStaffUserStateAsync(stableUserId);
		stableState.IsDeleted.Should().BeFalse();
		stableState.Status.Should().Be(UserStatus.Active);
		stableState.HasLiveStaffAccount.Should().BeTrue();
	}

	[Fact]
	public async Task ItShouldReturnFailureItemWhenBulkReactivateTargetWasReactivatedConcurrently() {
		var raceUserId = await CreateStaffUserAsync(UserStatus.Suspended);
		var stableUserId = await CreateStaffUserAsync(UserStatus.Suspended);

		var result = await RunWithConcurrentUsersUpdateAsync(
			service => service.BulkReactivateStaffUsersAsync(
				[raceUserId, stableUserId]
			),
			(dbContext, cancellationToken) => SetStaffUserStatusAsync(
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

		var raceState = await GetStaffUserStateAsync(raceUserId);
		raceState.IsDeleted.Should().BeFalse();
		raceState.Status.Should().Be(UserStatus.Active);
		raceState.HasLiveStaffAccount.Should().BeTrue();

		var stableState = await GetStaffUserStateAsync(stableUserId);
		stableState.IsDeleted.Should().BeFalse();
		stableState.Status.Should().Be(UserStatus.Active);
		stableState.HasLiveStaffAccount.Should().BeTrue();
	}

	private async Task<Guid> CreateStaffUserAsync(UserStatus status) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<MainApiDbContext>();

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

	private async Task<TResult> RunWithConcurrentUsersUpdateAsync<TResult>(
		Func<UserService, Task<TResult>> operationAsync,
		Func<MainApiDbContext, CancellationToken, Task> mutateAsync
	) {
		var connectionString = await GetConnectionStringAsync();
		var interceptor = new BeforeUsersUpdateInterceptor(async cancellationToken => {
			await using var mutateScope = _fixture.Factory.Services.CreateAsyncScope();
			var mutateDbContext = mutateScope.ServiceProvider
				.GetRequiredService<MainApiDbContext>();

			await mutateAsync(mutateDbContext, cancellationToken);
		});

		var options = new DbContextOptionsBuilder<MainApiDbContext>()
			.UseNpgsql(connectionString)
			.AddInterceptors(interceptor)
			.Options;

		await using var dbContext = new MainApiDbContext(options);
		var service = new UserService(
			dbContext,
			NullLogger<UserService>.Instance
		);

		return await operationAsync(service);
	}

	private async Task<string> GetConnectionStringAsync() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<MainApiDbContext>();

		return dbContext.Database.GetConnectionString()
			?? throw new InvalidOperationException(
				"Test database connection string was unexpectedly null."
			);
	}

	private static async Task SoftDeleteStaffUserAsync(
		MainApiDbContext dbContext,
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

	private static async Task SetStaffUserStatusAsync(
		MainApiDbContext dbContext,
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

	private async Task<StaffUserState> GetStaffUserStateAsync(Guid userId) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<MainApiDbContext>();

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
		private readonly Func<CancellationToken, Task> _beforeUsersUpdateAsync;
		private bool _hasRun;

		public BeforeUsersUpdateInterceptor(
			Func<CancellationToken, Task> beforeUsersUpdateAsync
		) {
			_beforeUsersUpdateAsync = beforeUsersUpdateAsync;
		}

		public override async ValueTask<InterceptionResult<int>> NonQueryExecutingAsync(
			DbCommand command,
			CommandEventData eventData,
			InterceptionResult<int> result,
			CancellationToken cancellationToken = default
		) {
			if (
				!_hasRun
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
				_hasRun = true;
				await _beforeUsersUpdateAsync(cancellationToken);
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
