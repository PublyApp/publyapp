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

public sealed class StaffUserLifecycleConcurrencySpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public StaffUserLifecycleConcurrencySpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	[Fact]
	public async Task
	ItShouldReturnNotFoundWhenSuspendingStaffUserWhoseAccountWasDeletedConcurrently() {
		var userId = await CreateStaffUserAsync(UserStatus.Active);

		var result = await RunWithConcurrentUsersUpdateAsync(
			service => service.SuspendStaffUserAsync(userId),
			(dbContext, cancellationToken) => SoftDeleteStaffAccountAsync(
				dbContext,
				userId,
				cancellationToken
			)
		);

		result.Should().BeOfType<SuspendStaffUserResult.NotFound>();

		var state = await GetStaffUserStateAsync(userId);
		state.IsDeleted.Should().BeFalse();
		state.Status.Should().Be(UserStatus.Active);
		state.HasLiveStaffAccount.Should().BeFalse();
	}

	[Fact]
	public async Task
	ItShouldReturnAlreadySuspendedWhenStaffUserWasSuspendedConcurrently() {
		var userId = await CreateStaffUserAsync(UserStatus.Active);

		var result = await RunWithConcurrentUsersUpdateAsync(
			service => service.SuspendStaffUserAsync(userId),
			(dbContext, cancellationToken) => SetStaffUserStatusAsync(
				dbContext,
				userId,
				UserStatus.Suspended,
				cancellationToken
			)
		);

		result.Should().BeOfType<SuspendStaffUserResult.AlreadySuspended>();

		var state = await GetStaffUserStateAsync(userId);
		state.IsDeleted.Should().BeFalse();
		state.Status.Should().Be(UserStatus.Suspended);
		state.HasLiveStaffAccount.Should().BeTrue();
	}

	[Fact]
	public async Task
	ItShouldReturnSuccessWhenSuspendingStaffUserWhoWasDeletedAfterUpdateCommitted() {
		var userId = await CreateStaffUserAsync(UserStatus.Active);

		var result = await RunAfterSuccessfulUsersUpdateAsync(
			service => service.SuspendStaffUserAsync(userId),
			(dbContext, cancellationToken) => SoftDeleteStaffUserAsync(
				dbContext,
				userId,
				cancellationToken
			)
		);

		result.Should().BeOfType<SuspendStaffUserResult.Success>();
		var success = (SuspendStaffUserResult.Success)result;
		success.UserData.User.Status.Should().Be(UserStatus.Suspended);

		var state = await GetStaffUserStateAsync(userId);
		state.IsDeleted.Should().BeTrue();
		state.Status.Should().Be(UserStatus.Suspended);
		state.HasLiveStaffAccount.Should().BeFalse();
	}

	[Fact]
	public async Task
	ItShouldReturnNotFoundWhenReactivatingStaffUserWhoseAccountWasDeletedConcurrently() {
		var userId = await CreateStaffUserAsync(UserStatus.Suspended);

		var result = await RunWithConcurrentUsersUpdateAsync(
			service => service.ReactivateStaffUserAsync(userId),
			(dbContext, cancellationToken) => SoftDeleteStaffAccountAsync(
				dbContext,
				userId,
				cancellationToken
			)
		);

		result.Should().BeOfType<ReactivateStaffUserResult.NotFound>();

		var state = await GetStaffUserStateAsync(userId);
		state.IsDeleted.Should().BeFalse();
		state.Status.Should().Be(UserStatus.Suspended);
		state.HasLiveStaffAccount.Should().BeFalse();
	}

	[Fact]
	public async Task
	ItShouldReturnNotSuspendedWhenStaffUserWasReactivatedConcurrently() {
		var userId = await CreateStaffUserAsync(UserStatus.Suspended);

		var result = await RunWithConcurrentUsersUpdateAsync(
			service => service.ReactivateStaffUserAsync(userId),
			(dbContext, cancellationToken) => SetStaffUserStatusAsync(
				dbContext,
				userId,
				UserStatus.Active,
				cancellationToken
			)
		);

		result.Should().BeOfType<ReactivateStaffUserResult.NotSuspended>();

		var state = await GetStaffUserStateAsync(userId);
		state.IsDeleted.Should().BeFalse();
		state.Status.Should().Be(UserStatus.Active);
		state.HasLiveStaffAccount.Should().BeTrue();
	}

	[Fact]
	public async Task
	ItShouldReturnSuccessWhenReactivatingStaffUserWhoWasDeletedAfterUpdateCommitted() {
		var userId = await CreateStaffUserAsync(UserStatus.Suspended);

		var result = await RunAfterSuccessfulUsersUpdateAsync(
			service => service.ReactivateStaffUserAsync(userId),
			(dbContext, cancellationToken) => SoftDeleteStaffUserAsync(
				dbContext,
				userId,
				cancellationToken
			)
		);

		result.Should().BeOfType<ReactivateStaffUserResult.Success>();
		var success = (ReactivateStaffUserResult.Success)result;
		success.UserData.User.Status.Should().Be(UserStatus.Active);

		var state = await GetStaffUserStateAsync(userId);
		state.IsDeleted.Should().BeTrue();
		state.Status.Should().Be(UserStatus.Active);
		state.HasLiveStaffAccount.Should().BeFalse();
	}

	[Fact]
	public async Task
	ItShouldReturnNotFoundWhenDeletingStaffUserWhoWasDeletedConcurrently() {
		var userId = await CreateStaffUserAsync(UserStatus.Suspended);

		var result = await RunWithConcurrentUsersUpdateAsync(
			service => service.DeleteStaffUserAsync(userId),
			(dbContext, cancellationToken) => SoftDeleteStaffUserAsync(
				dbContext,
				userId,
				cancellationToken
			)
		);

		result.Should().BeOfType<DeleteStaffUserResult.NotFound>();

		var state = await GetStaffUserStateAsync(userId);
		state.IsDeleted.Should().BeTrue();
		state.Status.Should().Be(UserStatus.Suspended);
		state.HasLiveStaffAccount.Should().BeFalse();
	}

	[Fact]
	public async Task
	ItShouldReturnNotSuspendedWhenDeletingStaffUserWhoWasReactivatedConcurrently() {
		var userId = await CreateStaffUserAsync(UserStatus.Suspended);

		var result = await RunWithConcurrentUsersUpdateAsync(
			service => service.DeleteStaffUserAsync(userId),
			(dbContext, cancellationToken) => SetStaffUserStatusAsync(
				dbContext,
				userId,
				UserStatus.Active,
				cancellationToken
			)
		);

		result.Should().BeOfType<DeleteStaffUserResult.NotSuspended>();

		var state = await GetStaffUserStateAsync(userId);
		state.IsDeleted.Should().BeFalse();
		state.Status.Should().Be(UserStatus.Active);
		state.HasLiveStaffAccount.Should().BeTrue();
	}

	private async Task<Guid> CreateStaffUserAsync(UserStatus status) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<MainApiDbContext>();

		var user = new User {
			Email = $"staff-lifecycle-{Guid.NewGuid():N}@example.com",
			Password = "hashed-password",
			FirstName = "Lifecycle",
			LastName = "Target",
			IsVerified = true,
			Status = status,
		};

		dbContext.User.Add(user);
		await dbContext.SaveChangesAsync();

		var userId = user.GetRequiredId();
		var staffAccount = UserAccount.CreateStaffAccount(userId, AccountLevel.User);

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
			var mutateDbContext = mutateScope.ServiceProvider.GetRequiredService<MainApiDbContext>();

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

	private async Task<TResult> RunAfterSuccessfulUsersUpdateAsync<TResult>(
		Func<UserService, Task<TResult>> operationAsync,
		Func<MainApiDbContext, CancellationToken, Task> mutateAsync
	) {
		var connectionString = await GetConnectionStringAsync();
		var interceptor = new AfterUsersUpdateInterceptor(async cancellationToken => {
			await using var mutateScope = _fixture.Factory.Services.CreateAsyncScope();
			var mutateDbContext = mutateScope.ServiceProvider.GetRequiredService<MainApiDbContext>();

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

	private static async Task SoftDeleteStaffAccountAsync(
		MainApiDbContext dbContext,
		Guid userId,
		CancellationToken cancellationToken
	) {
		var now = DateTime.UtcNow;

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

		await SoftDeleteStaffAccountAsync(
			dbContext,
			userId,
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

	private sealed class AfterUsersUpdateInterceptor : DbCommandInterceptor {
		private readonly Func<CancellationToken, Task> _afterUsersUpdateAsync;
		private bool _hasRun;

		public AfterUsersUpdateInterceptor(
			Func<CancellationToken, Task> afterUsersUpdateAsync
		) {
			_afterUsersUpdateAsync = afterUsersUpdateAsync;
		}

		public override async ValueTask<int> NonQueryExecutedAsync(
			DbCommand command,
			CommandExecutedEventData eventData,
			int result,
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
				await _afterUsersUpdateAsync(cancellationToken);
			}

			return await base.NonQueryExecutedAsync(
				command,
				eventData,
				result,
				cancellationToken
			);
		}
	}
}
