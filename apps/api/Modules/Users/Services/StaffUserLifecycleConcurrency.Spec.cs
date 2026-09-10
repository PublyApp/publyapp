
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

public sealed class StaffUserLifecycleConcurrencySpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;

	public StaffUserLifecycleConcurrencySpec(ApiFixture fixture) {
		_Fixture = fixture;
	}

	[Fact]
	public async Task
	ItShouldReturnNotFoundWhenSuspendingStaffUserWhoseAccountWasDeletedConcurrently() {
		var userId = await _CreateStaffUserAsync(UserStatus.Active);

		var result = await _RunWithConcurrentUsersUpdateAsync(
			service => service.SuspendStaffUserAsync(userId),
			(dbContext, cancellationToken) => _SoftDeleteStaffAccountAsync(
				dbContext,
				userId,
				cancellationToken
			)
		);

		result.Should().BeOfType<SuspendStaffUserResult.NotFound>();

		var state = await _GetStaffUserStateAsync(userId);
		state.IsDeleted.Should().BeFalse();
		state.Status.Should().Be(UserStatus.Active);
		state.HasLiveStaffAccount.Should().BeFalse();
	}

	[Fact]
	public async Task
	ItShouldReturnAlreadySuspendedWhenStaffUserWasSuspendedConcurrently() {
		var userId = await _CreateStaffUserAsync(UserStatus.Active);

		var result = await _RunWithConcurrentUsersUpdateAsync(
			service => service.SuspendStaffUserAsync(userId),
			(dbContext, cancellationToken) => _SetStaffUserStatusAsync(
				dbContext,
				userId,
				UserStatus.Suspended,
				cancellationToken
			)
		);

		result.Should().BeOfType<SuspendStaffUserResult.AlreadySuspended>();

		var state = await _GetStaffUserStateAsync(userId);
		state.IsDeleted.Should().BeFalse();
		state.Status.Should().Be(UserStatus.Suspended);
		state.HasLiveStaffAccount.Should().BeTrue();
	}

	[Fact]
	public async Task
	ItShouldReturnSuccessWhenSuspendingStaffUserWhoWasDeletedAfterUpdateCommitted() {
		var userId = await _CreateStaffUserAsync(UserStatus.Active);

		var result = await _RunAfterSuccessfulUsersUpdateAsync(
			service => service.SuspendStaffUserAsync(userId),
			(dbContext, cancellationToken) => _SoftDeleteStaffUserAsync(
				dbContext,
				userId,
				cancellationToken
			)
		);

		result.Should().BeOfType<SuspendStaffUserResult.Success>();
		var success = (SuspendStaffUserResult.Success)result;
		success.UserData.User.Status.Should().Be(UserStatus.Suspended);

		var state = await _GetStaffUserStateAsync(userId);
		state.IsDeleted.Should().BeTrue();
		state.Status.Should().Be(UserStatus.Suspended);
		state.HasLiveStaffAccount.Should().BeFalse();
	}

	[Fact]
	public async Task
	ItShouldReturnNotFoundWhenReactivatingStaffUserWhoseAccountWasDeletedConcurrently() {
		var userId = await _CreateStaffUserAsync(UserStatus.Suspended);

		var result = await _RunWithConcurrentUsersUpdateAsync(
			service => service.ReactivateStaffUserAsync(userId),
			(dbContext, cancellationToken) => _SoftDeleteStaffAccountAsync(
				dbContext,
				userId,
				cancellationToken
			)
		);

		result.Should().BeOfType<ReactivateStaffUserResult.NotFound>();

		var state = await _GetStaffUserStateAsync(userId);
		state.IsDeleted.Should().BeFalse();
		state.Status.Should().Be(UserStatus.Suspended);
		state.HasLiveStaffAccount.Should().BeFalse();
	}

	[Fact]
	public async Task
	ItShouldReturnNotSuspendedWhenStaffUserWasReactivatedConcurrently() {
		var userId = await _CreateStaffUserAsync(UserStatus.Suspended);

		var result = await _RunWithConcurrentUsersUpdateAsync(
			service => service.ReactivateStaffUserAsync(userId),
			(dbContext, cancellationToken) => _SetStaffUserStatusAsync(
				dbContext,
				userId,
				UserStatus.Active,
				cancellationToken
			)
		);

		result.Should().BeOfType<ReactivateStaffUserResult.NotSuspended>();

		var state = await _GetStaffUserStateAsync(userId);
		state.IsDeleted.Should().BeFalse();
		state.Status.Should().Be(UserStatus.Active);
		state.HasLiveStaffAccount.Should().BeTrue();
	}

	[Fact]
	public async Task
	ItShouldReturnSuccessWhenReactivatingStaffUserWhoWasDeletedAfterUpdateCommitted() {
		var userId = await _CreateStaffUserAsync(UserStatus.Suspended);

		var result = await _RunAfterSuccessfulUsersUpdateAsync(
			service => service.ReactivateStaffUserAsync(userId),
			(dbContext, cancellationToken) => _SoftDeleteStaffUserAsync(
				dbContext,
				userId,
				cancellationToken
			)
		);

		result.Should().BeOfType<ReactivateStaffUserResult.Success>();
		var success = (ReactivateStaffUserResult.Success)result;
		success.UserData.User.Status.Should().Be(UserStatus.Active);

		var state = await _GetStaffUserStateAsync(userId);
		state.IsDeleted.Should().BeTrue();
		state.Status.Should().Be(UserStatus.Active);
		state.HasLiveStaffAccount.Should().BeFalse();
	}

	[Fact]
	public async Task
	ItShouldReturnNotFoundWhenDeletingStaffUserWhoWasDeletedConcurrently() {
		var userId = await _CreateStaffUserAsync(UserStatus.Suspended);

		var result = await _RunWithConcurrentUsersUpdateAsync(
			service => service.DeleteStaffUserAsync(userId),
			(dbContext, cancellationToken) => _SoftDeleteStaffUserAsync(
				dbContext,
				userId,
				cancellationToken
			)
		);

		result.Should().BeOfType<DeleteStaffUserResult.NotFound>();

		var state = await _GetStaffUserStateAsync(userId);
		state.IsDeleted.Should().BeTrue();
		state.Status.Should().Be(UserStatus.Suspended);
		state.HasLiveStaffAccount.Should().BeFalse();
	}

	[Fact]
	public async Task
	ItShouldReturnNotSuspendedWhenDeletingStaffUserWhoWasReactivatedConcurrently() {
		var userId = await _CreateStaffUserAsync(UserStatus.Suspended);

		var result = await _RunWithConcurrentUsersUpdateAsync(
			service => service.DeleteStaffUserAsync(userId),
			(dbContext, cancellationToken) => _SetStaffUserStatusAsync(
				dbContext,
				userId,
				UserStatus.Active,
				cancellationToken
			)
		);

		result.Should().BeOfType<DeleteStaffUserResult.NotSuspended>();

		var state = await _GetStaffUserStateAsync(userId);
		state.IsDeleted.Should().BeFalse();
		state.Status.Should().Be(UserStatus.Active);
		state.HasLiveStaffAccount.Should().BeTrue();
	}

	private async Task<Guid> _CreateStaffUserAsync(UserStatus status) {
		await using var scope = _Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

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

	private async Task<TResult> _RunWithConcurrentUsersUpdateAsync<TResult>(
		Func<StaffUserLifecycleService, Task<TResult>> operationAsync,
		Func<AppDbContext, CancellationToken, Task> mutateAsync
	) {
		var connectionString = await _GetConnectionStringAsync();
		var interceptor = new BeforeUsersUpdateInterceptor(async cancellationToken => {
			await using var mutateScope = _Fixture.Factory.Services.CreateAsyncScope();
			var mutateDbContext = mutateScope.ServiceProvider.GetRequiredService<AppDbContext>();

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

	private async Task<TResult> _RunAfterSuccessfulUsersUpdateAsync<TResult>(
		Func<StaffUserLifecycleService, Task<TResult>> operationAsync,
		Func<AppDbContext, CancellationToken, Task> mutateAsync
	) {
		var connectionString = await _GetConnectionStringAsync();
		var interceptor = new AfterUsersUpdateInterceptor(async cancellationToken => {
			await using var mutateScope = _Fixture.Factory.Services.CreateAsyncScope();
			var mutateDbContext = mutateScope.ServiceProvider.GetRequiredService<AppDbContext>();

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

	private static async Task _SoftDeleteStaffAccountAsync(
		AppDbContext dbContext,
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

		await _SoftDeleteStaffAccountAsync(
			dbContext,
			userId,
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

	private sealed class AfterUsersUpdateInterceptor : DbCommandInterceptor {
		private readonly Func<CancellationToken, Task> _AfterUsersUpdateAsync;
		private bool _HasRun;

		public AfterUsersUpdateInterceptor(
			Func<CancellationToken, Task> afterUsersUpdateAsync
		) {
			_AfterUsersUpdateAsync = afterUsersUpdateAsync;
		}

		public override async ValueTask<int> NonQueryExecutedAsync(
			DbCommand command,
			CommandExecutedEventData eventData,
			int result,
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
				await _AfterUsersUpdateAsync(cancellationToken);
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
