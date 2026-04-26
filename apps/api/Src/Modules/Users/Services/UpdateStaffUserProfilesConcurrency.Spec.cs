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
	ItShouldNotCreateLiveProfileLinksWhenStaffUserWasDeletedBeforeInsert() {
		var userId = await CreateStaffUserAsync(UserStatus.Suspended);
		var profileId = await CreateStaffProfileAsync();

		var result = await RunWithConcurrentProfileWriteDeleteAsync(
			userId,
			service => service.UpdateStaffUserProfilesAsync(
				userId,
				[profileId]
			)
		);

		result.Should().BeOfType<UpdateStaffUserProfilesServiceResult.UserNotFound>();

		var state = await GetStaffUserProfileStateAsync(userId);
		state.IsDeleted.Should().BeTrue();
		state.HasLiveStaffAccount.Should().BeFalse();
		state.ActiveProfileLinks.Should().BeEmpty();
	}

	[Fact]
	public async Task
	ItShouldReDeleteUndeletedProfileLinksWhenStaffUserWasDeletedBeforeUndelete() {
		var userId = await CreateStaffUserAsync(UserStatus.Suspended);
		var profileId = await CreateStaffProfileAsync();
		await CreateSoftDeletedStaffUserProfileLinkAsync(userId, profileId);

		var result = await RunWithConcurrentProfileWriteDeleteAsync(
			userId,
			service => service.UpdateStaffUserProfilesAsync(
				userId,
				[profileId]
			)
		);

		result.Should().BeOfType<UpdateStaffUserProfilesServiceResult.UserNotFound>();

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

	private async Task<UpdateStaffUserProfilesServiceResult>
	RunWithConcurrentProfileWriteDeleteAsync(
		Guid userId,
		Func<UserService, Task<UpdateStaffUserProfilesServiceResult>> operationAsync
	) {
		var connectionString = await GetConnectionStringAsync();
		var interceptor = new BeforeProfileChangesAreSavedInterceptor(
			async cancellationToken => {
				await using var deleteScope = _fixture.Factory.Services.CreateAsyncScope();
				var deleteService = deleteScope.ServiceProvider
					.GetRequiredService<IUserService>();

				_ = await deleteService.DeleteStaffUserAsync(
					userId,
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

	private sealed class BeforeProfileChangesAreSavedInterceptor
		: SaveChangesInterceptor {
		private readonly Func<CancellationToken, Task> _beforeSaveChangesAsync;
		private bool _hasRun;

		public BeforeProfileChangesAreSavedInterceptor(
			Func<CancellationToken, Task> beforeSaveChangesAsync
		) {
			_beforeSaveChangesAsync = beforeSaveChangesAsync;
		}

		public override async ValueTask<InterceptionResult<int>> SavingChangesAsync(
			DbContextEventData eventData,
			InterceptionResult<int> result,
			CancellationToken cancellationToken = default
		) {
			if (!_hasRun) {
				_hasRun = true;
				await _beforeSaveChangesAsync(cancellationToken);
			}

			return await base.SavingChangesAsync(
				eventData,
				result,
				cancellationToken
			);
		}
	}
}
