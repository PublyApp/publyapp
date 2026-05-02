using System.Data.Common;

namespace MainApi.Src.Modules.Users.Services;

using FluentAssertions;

using MainApi.Src.Data.DbContext;
using MainApi.Src.Lib.Testing.Fixtures;
using MainApi.Src.Modules.Profiles.Entities;
using MainApi.Src.Modules.Users.Entities;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

using Npgsql;

using Xunit;

public sealed class UpdateStaffUserProfilesConcurrencySpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public UpdateStaffUserProfilesConcurrencySpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	[Fact]
	public async Task
	ItShouldReturnSuccessAndLetDeleteSweepInsertedLinksWhenProfileUpdateCommitsFirst() {
		var userId = await CreateStaffUserAsync(UserStatus.Suspended);
		var profileId = await CreateStaffProfileAsync();

		var result = await RunWithConcurrentDeleteAtProfileTransactionCommitAsync(
			userId,
			service => service.UpdateStaffUserProfilesAsync(
				userId,
				[profileId]
			)
		);

		result.OperationResult.Should().BeOfType<
			UpdateStaffUserProfilesServiceResult.Success
		>();
		// This contract is intentional: once profile update holds the account-row lock
		// and reaches commit first, it succeeds; delete serializes behind it and sweeps
		// the just-committed links after the lock is released.
		var success =
			(UpdateStaffUserProfilesServiceResult.Success)result.OperationResult;
		success.AssignedProfiles.Select(x => x.Id).Should().Equal(profileId);

		result.DeleteResult.Should().BeOfType<DeleteStaffUserResult.Success>();

		var state = await GetStaffUserProfileStateAsync(userId);
		state.IsDeleted.Should().BeTrue();
		state.HasLiveStaffAccount.Should().BeFalse();
		state.ActiveProfileLinks.Should().BeEmpty();
		state.AllProfileLinks.Should().ContainSingle(link =>
			link.ProfileId == profileId
			&& link.IsDeleted
			&& link.DeletedAt != null
		);
	}

	[Fact]
	public async Task
	ItShouldReturnSuccessAndLetDeleteSweepUndeletedLinksWhenProfileUpdateCommitsFirst() {
		var userId = await CreateStaffUserAsync(UserStatus.Suspended);
		var profileId = await CreateStaffProfileAsync();
		await CreateSoftDeletedStaffUserProfileLinkAsync(userId, profileId);

		var result = await RunWithConcurrentDeleteAtProfileTransactionCommitAsync(
			userId,
			service => service.UpdateStaffUserProfilesAsync(
				userId,
				[profileId]
			)
		);

		result.OperationResult.Should().BeOfType<
			UpdateStaffUserProfilesServiceResult.Success
		>();
		var success =
			(UpdateStaffUserProfilesServiceResult.Success)result.OperationResult;
		success.AssignedProfiles.Select(x => x.Id).Should().Equal(profileId);

		result.DeleteResult.Should().BeOfType<DeleteStaffUserResult.Success>();

		var state = await GetStaffUserProfileStateAsync(userId);
		state.IsDeleted.Should().BeTrue();
		state.HasLiveStaffAccount.Should().BeFalse();
		state.ActiveProfileLinks.Should().BeEmpty();
		state.AllProfileLinks.Should().ContainSingle(link =>
			link.ProfileId == profileId
			&& link.IsDeleted
			&& link.DeletedAt != null
		);
	}

	private async Task<Guid> CreateStaffUserAsync(UserStatus status) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<MainApiDbContext>();

		var user = new User {
			Email = $"staff-profile-concurrency-{Guid.NewGuid():N}@example.com",
			Password = "hashed-password",
			FirstName = "Profiles",
			LastName = "Race",
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

	private async Task<Guid> CreateStaffProfileAsync() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<MainApiDbContext>();

		var profile = Profile.CreateStaffProfile(
			name: "Concurrency Profile " + Guid.NewGuid().ToString("N")[..8],
			description: "Used by UpdateStaffUserProfilesConcurrencySpec"
		);
		profile.ValidateProfileType();

		dbContext.Profile.Add(profile);
		await dbContext.SaveChangesAsync();

		return profile.GetRequiredId();
	}

	private async Task CreateSoftDeletedStaffUserProfileLinkAsync(
		Guid userId,
		Guid profileId
	) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<MainApiDbContext>();

		var staffAccountId = await (
			from ua in dbContext.UserAccount
			where ua.UserId == userId
				&& ua.Scope == AccountScope.Staff
				&& !ua.IsDeleted
			select (Guid?)ua.Id
		).SingleAsync();

		if (staffAccountId is null) {
			throw new InvalidOperationException("Staff account was unexpectedly missing.");
		}

		dbContext.UserAccountProfile.Add(
			new UserAccountProfile {
				UserAccountId = staffAccountId.Value,
				ProfileId = profileId,
				IsDeleted = true,
				DeletedAt = DateTime.UtcNow,
				UpdatedAt = DateTime.UtcNow,
			}
		);
		await dbContext.SaveChangesAsync();
	}

	private async Task<
		ConcurrentDeleteAtProfileCommitResult<
			UpdateStaffUserProfilesServiceResult
		>
	> RunWithConcurrentDeleteAtProfileTransactionCommitAsync(
		Guid userId,
		Func<UserService, Task<UpdateStaffUserProfilesServiceResult>> operationAsync
	) {
		var connectionString = await GetConnectionStringAsync();
		await using var coordinator =
			new ConcurrentDeleteAtProfileCommitCoordinator(
				connectionString,
				userId
			);
		var interceptor = new BeforeProfileTransactionCommitInterceptor(
			coordinator.StartDeleteAndWaitUntilItIsBlockedByProfileCommitAsync
		);

		var options = new DbContextOptionsBuilder<MainApiDbContext>()
			.UseNpgsql(connectionString)
			.AddInterceptors(interceptor)
			.Options;

		await using var dbContext = new MainApiDbContext(options);
		var service = new UserService(
			dbContext,
			NullLogger<UserService>.Instance
		);

		var operationResult = await operationAsync(service);
		var deleteResult = await coordinator.WaitForDeleteResultAsync();

		return new ConcurrentDeleteAtProfileCommitResult<
			UpdateStaffUserProfilesServiceResult
		>(
			operationResult,
			deleteResult
		);
	}

	private static async Task<DeleteStaffUserResult>
	RunDeleteStaffUserDuringProfileCommitAsync(
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

		var options = new DbContextOptionsBuilder<MainApiDbContext>()
			.UseNpgsql(connectionString)
			.AddInterceptors(interceptor)
			.Options;

		await using var dbContext = new MainApiDbContext(options);
		var service = new UserService(
			dbContext,
			NullLogger<UserService>.Instance
		);

		return await service.DeleteStaffUserAsync(
			userId,
			cancellationToken
		);
	}

	private async Task<string> GetConnectionStringAsync() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<MainApiDbContext>();

		return dbContext.Database.GetConnectionString()
			?? throw new InvalidOperationException(
				"Test database connection string was unexpectedly null."
			);
	}

	private async Task<StaffUserProfileState> GetStaffUserProfileStateAsync(Guid userId) {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<MainApiDbContext>();

		var user = await dbContext.User
			.IgnoreQueryFilters()
			.SingleAsync(x => x.Id == userId);

		var staffAccountId = await (
			from ua in dbContext.UserAccount
				.IgnoreQueryFilters()
			where ua.UserId == userId
				&& ua.Scope == AccountScope.Staff
			select (Guid?)ua.Id
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

		var allProfileLinks = await dbContext.UserAccountProfile
			.IgnoreQueryFilters()
			.Where(x => x.UserAccountId == staffAccountId.Value)
			.Select(x => new ProfileLinkState(
				x.ProfileId,
				x.IsDeleted,
				x.DeletedAt
			))
			.ToListAsync();

		var activeProfileLinks = allProfileLinks
			.Where(x => !x.IsDeleted)
			.ToList();

		return new StaffUserProfileState(
			IsDeleted: user.IsDeleted,
			HasLiveStaffAccount: hasLiveStaffAccount,
			AllProfileLinks: allProfileLinks,
			ActiveProfileLinks: activeProfileLinks
		);
	}

	private sealed record StaffUserProfileState(
		bool IsDeleted,
		bool HasLiveStaffAccount,
		List<ProfileLinkState> AllProfileLinks,
		List<ProfileLinkState> ActiveProfileLinks
	);

	private sealed record ProfileLinkState(
		Guid ProfileId,
		bool IsDeleted,
		DateTime? DeletedAt
	);

	private sealed record ConcurrentDeleteAtProfileCommitResult<TResult>(
		TResult OperationResult,
		DeleteStaffUserResult DeleteResult
	);

	private sealed class ConcurrentDeleteAtProfileCommitCoordinator
		: IAsyncDisposable {
		private static readonly TimeSpan DeleteOperationTimeout =
			TimeSpan.FromSeconds(10);
		private static readonly TimeSpan BlockedDeleteObservationTimeout =
			TimeSpan.FromSeconds(10);

		private readonly string _connectionString;
		private readonly Guid _userId;
		private readonly TaskCompletionSource<int> _deleteUserAccountUpdatePidSource =
			new(TaskCreationOptions.RunContinuationsAsynchronously);
		private CancellationTokenSource? _deleteCancellationTokenSource;
		private Task<DeleteStaffUserResult>? _deleteTask;

		public ConcurrentDeleteAtProfileCommitCoordinator(
			string connectionString,
			Guid userId
		) {
			_connectionString = connectionString;
			_userId = userId;
		}

		public async Task
		StartDeleteAndWaitUntilItIsBlockedByProfileCommitAsync(
			DbTransaction transaction,
			CancellationToken cancellationToken
		) {
			if (_deleteTask is not null) {
				throw new InvalidOperationException(
					"Concurrent delete was already started for this profile-update operation."
				);
			}

			if (transaction.Connection is not NpgsqlConnection profileConnection) {
				throw new InvalidOperationException(
					"Expected an Npgsql profile-update transaction connection."
				);
			}

			var profileUpdatePid = profileConnection.ProcessID;
			var deleteCancellationTokenSource =
				CancellationTokenSource.CreateLinkedTokenSource(
					cancellationToken
				);
			deleteCancellationTokenSource.CancelAfter(DeleteOperationTimeout);
			_deleteCancellationTokenSource = deleteCancellationTokenSource;
			_deleteTask = Task.Run(
				() => RunDeleteStaffUserDuringProfileCommitAsync(
					_connectionString,
					_userId,
					_deleteUserAccountUpdatePidSource,
					deleteCancellationTokenSource.Token
				),
				deleteCancellationTokenSource.Token
			);
			_ = _deleteTask.ContinueWith(
				task => {
					if (task.IsCanceled) {
						_deleteUserAccountUpdatePidSource.TrySetCanceled(
							deleteCancellationTokenSource.Token
						);
						return;
					}

					if (task.Exception is not null) {
						_deleteUserAccountUpdatePidSource.TrySetException(
							task.Exception.InnerExceptions
						);
					}
				},
				TaskScheduler.Default
			);

			var deletePid = await _deleteUserAccountUpdatePidSource.Task.WaitAsync(
				DeleteOperationTimeout,
				cancellationToken
			);

			// Do not let the profile-update commit continue until PostgreSQL reports
			// that the delete session is actually blocked by this transaction. That
			// proves the race reached the commit window and the row lock, not timing
			// luck, is what serializes the final outcome.
			await WaitUntilDeleteIsBlockedByProfileCommitAsync(
				deletePid,
				profileUpdatePid,
				cancellationToken
			);
		}

		public async Task<DeleteStaffUserResult> WaitForDeleteResultAsync() {
			if (_deleteTask is null) {
				throw new InvalidOperationException(
					"Concurrent delete never started for this profile-update operation."
				);
			}

			return await _deleteTask.WaitAsync(DeleteOperationTimeout);
		}

		public async ValueTask DisposeAsync() {
			_deleteCancellationTokenSource?.Cancel();

			if (_deleteTask is not null) {
				try {
					_ = await _deleteTask.WaitAsync(
						DeleteOperationTimeout
					);
				} catch (OperationCanceledException) {
				}
			}

			_deleteCancellationTokenSource?.Dispose();
		}

		private async Task WaitUntilDeleteIsBlockedByProfileCommitAsync(
			int deletePid,
			int profileUpdatePid,
			CancellationToken cancellationToken
		) {
			using var linkedCancellationTokenSource =
				CancellationTokenSource.CreateLinkedTokenSource(
					cancellationToken
				);
			linkedCancellationTokenSource.CancelAfter(
				BlockedDeleteObservationTimeout
			);
			var linkedCancellationToken = linkedCancellationTokenSource.Token;

			await using var observerConnection = new NpgsqlConnection(
				_connectionString
			);
			try {
				await observerConnection.OpenAsync(linkedCancellationToken);

				while (true) {
					await using var command = observerConnection.CreateCommand();
					command.CommandText = """
						SELECT EXISTS (
							SELECT 1
							FROM unnest(pg_blocking_pids(@delete_pid)) AS blocking_pid
							WHERE blocking_pid = @profile_update_pid
						)
						""";
					command.Parameters.AddWithValue("delete_pid", deletePid);
					command.Parameters.AddWithValue(
						"profile_update_pid",
						profileUpdatePid
					);

					var isBlockedByProfileCommit =
						(bool)(await command.ExecuteScalarAsync(linkedCancellationToken)
							?? false);

					if (isBlockedByProfileCommit) {
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
					$"Timed out waiting for delete pid {deletePid} to block on profile-update pid {profileUpdatePid}."
				);
			}
		}
	}

	private sealed class BeforeProfileTransactionCommitInterceptor
		: DbTransactionInterceptor {
		private readonly Func<DbTransaction, CancellationToken, Task> _beforeCommitAsync;
		private bool _hasRun;

		public BeforeProfileTransactionCommitInterceptor(
			Func<DbTransaction, CancellationToken, Task> beforeCommitAsync
		) {
			_beforeCommitAsync = beforeCommitAsync;
		}

		public override async ValueTask<InterceptionResult>
		TransactionCommittingAsync(
			DbTransaction transaction,
			TransactionEventData eventData,
			InterceptionResult result,
			CancellationToken cancellationToken = default
		) {
			if (!_hasRun) {
				_hasRun = true;
				await _beforeCommitAsync(transaction, cancellationToken);
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
		private readonly Action<int> _beforeDeleteUserAccountUpdate;
		private bool _hasRun;

		public BeforeDeleteUserAccountUpdateInterceptor(
			Action<int> beforeDeleteUserAccountUpdate
		) {
			_beforeDeleteUserAccountUpdate = beforeDeleteUserAccountUpdate;
		}

		public override async ValueTask<InterceptionResult<int>>
		NonQueryExecutingAsync(
			DbCommand command,
			CommandEventData eventData,
			InterceptionResult<int> result,
			CancellationToken cancellationToken = default
		) {
			if (
				!_hasRun
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
				_hasRun = true;

				if (command.Connection is not NpgsqlConnection deleteConnection) {
					throw new InvalidOperationException(
						"Expected an Npgsql delete connection."
					);
				}

				_beforeDeleteUserAccountUpdate(deleteConnection.ProcessID);
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
