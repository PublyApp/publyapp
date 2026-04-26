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

using Xunit;

public sealed class UpdateStaffUserProfilesConcurrencySpec
	: IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public UpdateStaffUserProfilesConcurrencySpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	[Fact]
	public async Task
	ItShouldNotLeaveInsertedProfileLinksLiveWhenDeleteStartsAtCommit() {
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
		var success =
			(UpdateStaffUserProfilesServiceResult.Success)result.OperationResult;
		success.AssignedProfiles.Select(x => x.Id).Should().Equal(profileId);

		var deleteResult = await result.DeleteTask;
		deleteResult.Should().BeOfType<DeleteStaffUserResult.Success>();

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
	ItShouldNotLeaveUndeletedProfileLinksLiveWhenDeleteStartsAtCommit() {
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

		var deleteResult = await result.DeleteTask;
		deleteResult.Should().BeOfType<DeleteStaffUserResult.Success>();

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
		var deleteTaskSource = new TaskCompletionSource<
			Task<DeleteStaffUserResult>
		>(TaskCreationOptions.RunContinuationsAsynchronously);
		var deleteReachedUserAccountUpdateSource = new TaskCompletionSource<bool>(
			TaskCreationOptions.RunContinuationsAsynchronously
		);
		var interceptor = new BeforeProfileTransactionCommitInterceptor(
			async cancellationToken => {
				var deleteTask = Task.Run(
					() => RunDeleteStaffUserDuringProfileCommitAsync(
						connectionString,
						userId,
						deleteReachedUserAccountUpdateSource
					),
					CancellationToken.None
				);

				deleteTaskSource.TrySetResult(deleteTask);

				await deleteReachedUserAccountUpdateSource.Task.WaitAsync(
					TimeSpan.FromSeconds(10),
					cancellationToken
				);

				// Keep the profile-update commit open long enough for the concurrent delete
				// to run against uncommitted profile-link changes if no account lock exists.
				await Task.Delay(
					TimeSpan.FromMilliseconds(250),
					cancellationToken
				);
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

		var operationResult = await operationAsync(service);
		var deleteTask = await deleteTaskSource.Task.WaitAsync(
			TimeSpan.FromSeconds(10)
		);

		return new ConcurrentDeleteAtProfileCommitResult<
			UpdateStaffUserProfilesServiceResult
		>(
			operationResult,
			deleteTask
		);
	}

	private static async Task<DeleteStaffUserResult>
	RunDeleteStaffUserDuringProfileCommitAsync(
		string connectionString,
		Guid userId,
		TaskCompletionSource<bool> deleteReachedUserAccountUpdateSource
	) {
		var interceptor = new BeforeDeleteUserAccountUpdateInterceptor(
			() => {
				deleteReachedUserAccountUpdateSource.TrySetResult(true);
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

		return await service.DeleteStaffUserAsync(userId);
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
		Task<DeleteStaffUserResult> DeleteTask
	);

	private sealed class BeforeProfileTransactionCommitInterceptor
		: DbTransactionInterceptor {
		private readonly Func<CancellationToken, Task> _beforeCommitAsync;
		private bool _hasRun;

		public BeforeProfileTransactionCommitInterceptor(
			Func<CancellationToken, Task> beforeCommitAsync
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
				await _beforeCommitAsync(cancellationToken);
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
		private readonly Action _beforeDeleteUserAccountUpdate;
		private bool _hasRun;

		public BeforeDeleteUserAccountUpdateInterceptor(
			Action beforeDeleteUserAccountUpdate
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
				_beforeDeleteUserAccountUpdate();
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
