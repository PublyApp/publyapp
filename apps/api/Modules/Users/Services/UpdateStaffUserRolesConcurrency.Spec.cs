using System.Data.Common;

using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;

using Npgsql;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Roles.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Users.Services;

public sealed class UpdateStaffUserRolesConcurrencySpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _Fixture;

	public UpdateStaffUserRolesConcurrencySpec(ApiFixture fixture) {
		this._Fixture = fixture;
	}

	[Fact]
	public async Task
	ItShouldReturnSuccessAndLetDeleteSweepInsertedLinksWhenRoleUpdateCommitsFirst() {
		var userId = await this._CreateStaffUserAsync(UserStatus.Suspended);
		var roleId = await this._CreateStaffRoleAsync();

		var result = await this._RunWithConcurrentDeleteAtRoleTransactionCommitAsync(
			userId,
			service => service.UpdateStaffUserRolesAsync(
				userId,
				[roleId]
			)
		);

		result.OperationResult.Should().BeOfType<
			UpdateStaffUserRolesServiceResult.Success
		>();
		// This contract is intentional: once role update holds the account-row lock
		// and reaches commit first, it succeeds; delete serializes behind it and sweeps
		// the just-committed links after the lock is released.
		var success =
			(UpdateStaffUserRolesServiceResult.Success)result.OperationResult;
		success.AssignedRoles.Select(x => x.Id).Should().Equal(roleId);

		result.DeleteResult.Should().BeOfType<DeleteStaffUserResult.Success>();

		var state = await this._GetStaffUserRoleStateAsync(userId);
		state.IsDeleted.Should().BeTrue();
		state.HasLiveStaffAccount.Should().BeFalse();
		state.ActiveRoleLinks.Should().BeEmpty();
		// Delete serializes behind the role update and then hard-deletes the link.
		state.AllRoleLinks.Should().BeEmpty();
	}

	[Fact]
	public async Task
	ItShouldReturnSuccessAndLetDeleteSweepExistingLinksWhenRoleUpdateCommitsFirst() {
		var userId = await this._CreateStaffUserAsync(UserStatus.Suspended);
		var roleId = await this._CreateStaffRoleAsync();
		await this._CreateStaffUserRoleLinkAsync(userId, roleId);

		var result = await this._RunWithConcurrentDeleteAtRoleTransactionCommitAsync(
			userId,
			service => service.UpdateStaffUserRolesAsync(
				userId,
				[roleId]
			)
		);

		result.OperationResult.Should().BeOfType<
			UpdateStaffUserRolesServiceResult.Success
		>();
		var success =
			(UpdateStaffUserRolesServiceResult.Success)result.OperationResult;
		success.AssignedRoles.Select(x => x.Id).Should().Equal(roleId);

		result.DeleteResult.Should().BeOfType<DeleteStaffUserResult.Success>();

		var state = await this._GetStaffUserRoleStateAsync(userId);
		state.IsDeleted.Should().BeTrue();
		state.HasLiveStaffAccount.Should().BeFalse();
		state.ActiveRoleLinks.Should().BeEmpty();
		// Existing links are swept the same way as newly inserted links.
		state.AllRoleLinks.Should().BeEmpty();
	}

	private async Task<Guid> _CreateStaffUserAsync(UserStatus status) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var user = new User {
			Email = $"staff-role-concurrency-{Guid.NewGuid():N}@example.com",
			Password = "hashed-password",
			FirstName = "Roles",
			LastName = "Race",
			IsVerified = true,
			Status = status,
		};

		dbContext.User.Add(user);
		await dbContext.SaveChangesAsync();

		var userId = user.GetRequiredId();
		var staffAccount = UserAccount.CreateStaffAccount(userId);

		dbContext.UserAccount.Add(staffAccount);
		await dbContext.SaveChangesAsync();

		return userId;
	}

	private async Task<Guid> _CreateStaffRoleAsync() {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var role = Role.CreateStaffRole(
			name: "Concurrency Role " + Guid.NewGuid().ToString("N")[..8],
			description: "Used by UpdateStaffUserRolesConcurrencySpec"
		);
		role.ValidateRoleType();

		dbContext.Role.Add(role);
		await dbContext.SaveChangesAsync();

		return role.GetRequiredId();
	}

	private async Task _CreateStaffUserRoleLinkAsync(
		Guid userId,
		Guid roleId
	) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var staffAccountId = await (
			from ua in dbContext.UserAccount
			where ua.UserId == userId
				&& ua.Scope == AccountScope.Staff
				&& !ua.IsDeleted
			select ua.Id
		).SingleAsync();

		if (staffAccountId is null) {
			throw new InvalidOperationException("Staff account was unexpectedly missing.");
		}

		dbContext.UserAccountRole.Add(
			new UserAccountRole {
				UserAccountId = staffAccountId.Value,
				RoleId = roleId,
				UpdatedAt = DateTime.UtcNow,
			}
		);
		await dbContext.SaveChangesAsync();
	}

	private async Task<
		ConcurrentDeleteAtRoleCommitResult<
			UpdateStaffUserRolesServiceResult
		>
	> _RunWithConcurrentDeleteAtRoleTransactionCommitAsync(
		Guid userId,
		Func<StaffUserRoleAssignmentService, Task<UpdateStaffUserRolesServiceResult>> operationAsync
	) {
		var connectionString = await this._GetConnectionStringAsync();
		await using var coordinator =
			new ConcurrentDeleteAtRoleCommitCoordinator(
				connectionString,
				userId
			);
		var interceptor = new BeforeRoleTransactionCommitInterceptor(
			coordinator.StartDeleteAndWaitUntilItIsBlockedByRoleCommitAsync
		);

		var options = new DbContextOptionsBuilder<AppDbContext>()
			.UseNpgsql(connectionString)
			.AddInterceptors(interceptor)
			.Options;

		await using var dbContext = new AppDbContext(options);
		var service = new StaffUserRoleAssignmentService(
			dbContext
		);

		var operationResult = await operationAsync(service);
		var deleteResult = await coordinator.WaitForDeleteResultAsync();

		return new ConcurrentDeleteAtRoleCommitResult<
			UpdateStaffUserRolesServiceResult
		>(
			operationResult,
			deleteResult
		);
	}

	private static async Task<DeleteStaffUserResult>
	_RunDeleteStaffUserDuringRoleCommitAsync(
		string connectionString,
		Guid userId,
		TaskCompletionSource<int> deleteUserAccountUpdatePidSource,
		CancellationToken cancellationToken
	) {
		var interceptor = new BeforeDeleteUserAccountUpdateInterceptor(
			deletePid => {
				deleteUserAccountUpdatePidSource.TrySetResult(deletePid);
			}
		);

		var options = new DbContextOptionsBuilder<AppDbContext>()
			.UseNpgsql(connectionString)
			.AddInterceptors(interceptor)
			.Options;

		await using var dbContext = new AppDbContext(options);
		var service = new StaffUserLifecycleService(
			dbContext
		);

		return await service.DeleteStaffUserAsync(
			userId,
			cancellationToken
		);
	}

	private async Task<string> _GetConnectionStringAsync() {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var connectionString = dbContext.Database.GetConnectionString();
		if (connectionString is null) {
			throw new InvalidOperationException(
				"Test database connection string was unexpectedly null."
			);
		}

		return connectionString;
	}

	private async Task<StaffUserRoleState> _GetStaffUserRoleStateAsync(Guid userId) {
		await using var scope = this._Fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var user = await dbContext.User
			.IgnoreQueryFilters()
			.SingleAsync(x => x.Id == userId);

		var staffAccountId = await (
			from ua in dbContext.UserAccount
				.IgnoreQueryFilters()
			where ua.UserId == userId
				&& ua.Scope == AccountScope.Staff
			select ua.Id
		).SingleAsync();

		if (staffAccountId is null) {
			throw new InvalidOperationException("Staff account id was unexpectedly null.");
		}

		var hasLiveStaffAccount = await dbContext.UserAccount
			.IgnoreQueryFilters()
			.AnyAsync(x =>
				x.UserId == userId
				&& x.Scope == AccountScope.Staff
				&& !x.IsDeleted
			);

		var allRoleLinks = await dbContext.UserAccountRole
			.IgnoreQueryFilters()
			.Where(x => x.UserAccountId == staffAccountId.Value)
			.Select(x => new RoleLinkState(x.RoleId))
			.ToListAsync();

		return new StaffUserRoleState(
			IsDeleted: user.IsDeleted,
			HasLiveStaffAccount: hasLiveStaffAccount,
			AllRoleLinks: allRoleLinks,
			ActiveRoleLinks: allRoleLinks
		);
	}

	private sealed record StaffUserRoleState(
		bool IsDeleted,
		bool HasLiveStaffAccount,
		List<RoleLinkState> AllRoleLinks,
		List<RoleLinkState> ActiveRoleLinks
	);

	private sealed record RoleLinkState(Guid RoleId);

	private sealed record ConcurrentDeleteAtRoleCommitResult<TResult>(
		TResult OperationResult,
		DeleteStaffUserResult DeleteResult
	);

	private sealed class ConcurrentDeleteAtRoleCommitCoordinator
		: IAsyncDisposable {
		private static readonly TimeSpan _DeleteOperationTimeout =
			TimeSpan.FromSeconds(10);
		private static readonly TimeSpan _BlockedDeleteObservationTimeout =
			TimeSpan.FromSeconds(10);

		private readonly string _ConnectionString;
		private readonly Guid _UserId;
		private readonly TaskCompletionSource<int> _DeleteUserAccountUpdatePidSource =
			new(TaskCreationOptions.RunContinuationsAsynchronously);
		private CancellationTokenSource? _DeleteCancellationTokenSource;
		private Task<DeleteStaffUserResult>? _DeleteTask;

		public ConcurrentDeleteAtRoleCommitCoordinator(
			string connectionString,
			Guid userId
		) {
			this._ConnectionString = connectionString;
			this._UserId = userId;
		}

		public async Task
		StartDeleteAndWaitUntilItIsBlockedByRoleCommitAsync(
			DbTransaction transaction,
			CancellationToken cancellationToken
		) {
			if (this._DeleteTask is not null) {
				throw new InvalidOperationException(
					"Concurrent delete was already started for this role-update operation."
				);
			}

			if (transaction.Connection is not NpgsqlConnection roleConnection) {
				throw new InvalidOperationException(
					"Expected an Npgsql role-update transaction connection."
				);
			}

			var roleUpdatePid = roleConnection.ProcessID;
			var deleteCancellationTokenSource =
				CancellationTokenSource.CreateLinkedTokenSource(
					cancellationToken
				);
			deleteCancellationTokenSource.CancelAfter(UpdateStaffUserRolesConcurrencySpec.ConcurrentDeleteAtRoleCommitCoordinator._DeleteOperationTimeout);
			this._DeleteCancellationTokenSource = deleteCancellationTokenSource;
			this._DeleteTask = Task.Run(
				() => _RunDeleteStaffUserDuringRoleCommitAsync(
					this._ConnectionString,
					this._UserId,
					this._DeleteUserAccountUpdatePidSource,
					deleteCancellationTokenSource.Token
				),
				deleteCancellationTokenSource.Token
			);
			_ = this._DeleteTask.ContinueWith(
				task => {
					if (task.IsCanceled) {
						this._DeleteUserAccountUpdatePidSource.TrySetCanceled(
							deleteCancellationTokenSource.Token
						);
						return;
					}

					if (task.Exception is not null) {
						this._DeleteUserAccountUpdatePidSource.TrySetException(
							task.Exception.InnerExceptions
						);
					}
				},
				TaskScheduler.Default
			);

			var deletePid = await this._DeleteUserAccountUpdatePidSource.Task.WaitAsync(
				UpdateStaffUserRolesConcurrencySpec.ConcurrentDeleteAtRoleCommitCoordinator._DeleteOperationTimeout,
				cancellationToken
			);

			// Do not let the role-update commit continue until PostgreSQL reports
			// that the delete session is actually blocked by this transaction. That
			// proves the race reached the commit window and the row lock, not timing
			// luck, is what serializes the final outcome.
			await this._WaitUntilDeleteIsBlockedByRoleCommitAsync(
				deletePid,
				roleUpdatePid,
				cancellationToken
			);
		}

		public async Task<DeleteStaffUserResult> WaitForDeleteResultAsync() {
			if (this._DeleteTask is null) {
				throw new InvalidOperationException(
					"Concurrent delete never started for this role-update operation."
				);
			}

			return await this._DeleteTask.WaitAsync(UpdateStaffUserRolesConcurrencySpec.ConcurrentDeleteAtRoleCommitCoordinator._DeleteOperationTimeout);
		}

		public async ValueTask DisposeAsync() {
			this._DeleteCancellationTokenSource?.Cancel();

			if (this._DeleteTask is not null) {
				try {
					_ = await this._DeleteTask.WaitAsync(
						UpdateStaffUserRolesConcurrencySpec.ConcurrentDeleteAtRoleCommitCoordinator._DeleteOperationTimeout
					);
				} catch (OperationCanceledException) {
				}
			}

			this._DeleteCancellationTokenSource?.Dispose();
		}

		private async Task _WaitUntilDeleteIsBlockedByRoleCommitAsync(
			int deletePid,
			int roleUpdatePid,
			CancellationToken cancellationToken
		) {
			using var linkedCancellationTokenSource =
				CancellationTokenSource.CreateLinkedTokenSource(
					cancellationToken
				);
			linkedCancellationTokenSource.CancelAfter(
				UpdateStaffUserRolesConcurrencySpec.ConcurrentDeleteAtRoleCommitCoordinator._BlockedDeleteObservationTimeout
			);
			var linkedCancellationToken = linkedCancellationTokenSource.Token;

			await using var observerConnection = new NpgsqlConnection(
				this._ConnectionString
			);
			try {
				await observerConnection.OpenAsync(linkedCancellationToken);

				while (true) {
					await using var command = observerConnection.CreateCommand();
					command.CommandText = """
						SELECT EXISTS (
							SELECT 1
							FROM unnest(pg_blocking_pids(@delete_pid)) AS blocking_pid
							WHERE blocking_pid = @role_update_pid
						)
						""";
					command.Parameters.AddWithValue("delete_pid", deletePid);
					command.Parameters.AddWithValue(
						"role_update_pid",
						roleUpdatePid
					);

					var isBlockedByRoleCommit =
						(bool)(await command.ExecuteScalarAsync(linkedCancellationToken)
							?? false);

					if (isBlockedByRoleCommit) {
						return;
					}

					await Task.Delay(
						TimeSpan.FromMilliseconds(10),
						linkedCancellationToken
					);
				}
			} catch (OperationCanceledException) when (
				linkedCancellationTokenSource.IsCancellationRequested
				&& !cancellationToken.IsCancellationRequested
			) {
				throw new TimeoutException(
					$"Timed out waiting for delete pid {deletePid} to block on role-update pid {roleUpdatePid}."
				);
			}
		}
	}

	private sealed class BeforeRoleTransactionCommitInterceptor
		: DbTransactionInterceptor {
		private readonly Func<DbTransaction, CancellationToken, Task> _BeforeCommitAsync;
		private bool _HasRun;

		public BeforeRoleTransactionCommitInterceptor(
			Func<DbTransaction, CancellationToken, Task> beforeCommitAsync
		) {
			this._BeforeCommitAsync = beforeCommitAsync;
		}

		public override async ValueTask<InterceptionResult>
		TransactionCommittingAsync(
			DbTransaction transaction,
			TransactionEventData eventData,
			InterceptionResult result,
			CancellationToken cancellationToken = default
		) {
			if (!this._HasRun) {
				this._HasRun = true;
				await this._BeforeCommitAsync(transaction, cancellationToken);
			}

			return await base.TransactionCommittingAsync(
				transaction,
				eventData,
				result,
				cancellationToken
			);
		}
	}

	private sealed class BeforeDeleteUserAccountUpdateInterceptor
		: DbCommandInterceptor {
		private readonly Action<int> _BeforeDeleteUserAccountUpdate;
		private bool _HasRun;

		public BeforeDeleteUserAccountUpdateInterceptor(
			Action<int> beforeDeleteUserAccountUpdate
		) {
			this._BeforeDeleteUserAccountUpdate = beforeDeleteUserAccountUpdate;
		}

		public override async ValueTask<InterceptionResult<int>>
		NonQueryExecutingAsync(
			DbCommand command,
			CommandEventData eventData,
			InterceptionResult<int> result,
			CancellationToken cancellationToken = default
		) {
			if (
				!this._HasRun
				&& (
					command.CommandText.Contains(
						"UPDATE user_accounts",
						StringComparison.OrdinalIgnoreCase
					)
					|| command.CommandText.Contains(
						"UPDATE \"user_accounts\"",
						StringComparison.OrdinalIgnoreCase
					)
				)
			) {
				this._HasRun = true;

				if (command.Connection is not NpgsqlConnection deleteConnection) {
					throw new InvalidOperationException(
						"Expected an Npgsql delete connection."
					);
				}

				this._BeforeDeleteUserAccountUpdate(deleteConnection.ProcessID);
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
