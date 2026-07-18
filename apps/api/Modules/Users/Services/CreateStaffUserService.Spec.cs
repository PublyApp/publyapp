using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using Npgsql;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Jobs;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Auth.Utils;
using PublyApp.Api.Modules.Auth.Jobs;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Users.Services;

public sealed class CreateStaffUserServiceSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public CreateStaffUserServiceSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	[Fact]
	public async Task ItShouldRollbackUserCreationWhenAccountCreationFails() {
		var email = $"create-staff-f1-{Guid.NewGuid():N}@example.com";

		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var userService = new UserService(dbContext);
		var accountService = new FailingCreateStaffAccountService();
		var enqueuer = new RejectingEnqueuer();
		var service = new CreateStaffUserService(
			dbContext,
			userService,
			accountService,
			enqueuer
		);

		var result = await service.CreateStaffUserAsync(
			new CreateStaffUserArgs(
				Email: email,
				LastName: "Staff",
				FirstName: "Atomic",
				AvatarUrl: null,
				Password: PasswordUtils.HashPassword("unused-password"),
				SendNotification: true
			),
			CancellationToken.None
		);

		result.Should().BeOfType<CreateStaffUserServiceResult.UserHasTenantOrProjectAccounts>();
		enqueuer.Calls.Should().Be(0);

		await using var verify = CreateDbContext();
		(await verify.User.AnyAsync(u => u.Email == email)).Should().BeFalse(
			"the create-user write must be rolled back when account creation fails"
		);
	}

	[Fact]
	public async Task ItShouldCreateUserAccountAndEnqueueVerifyEmailWhenSuccessful() {
		var email = $"create-staff-success-{Guid.NewGuid():N}@example.com";

		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var userService = new UserService(dbContext);
		var accountService = new AccountService(dbContext);
		var enqueuer = new RecordingEnqueuer();
		var service = new CreateStaffUserService(
			dbContext,
			userService,
			accountService,
			enqueuer
		);

		var result = await service.CreateStaffUserAsync(
			new CreateStaffUserArgs(
				Email: email,
				LastName: "Staff",
				FirstName: "Atomic",
				AvatarUrl: null,
				Password: PasswordUtils.HashPassword("unused-password"),
				SendNotification: true
			),
			CancellationToken.None
		);

		var success = result.Should().BeOfType<CreateStaffUserServiceResult.Success>().Subject;
		success.IsNewUser.Should().BeTrue();
		enqueuer.Calls.Should().Be(1);
		enqueuer.Payload.Should().BeOfType<VerifyEmailPayload>();
		enqueuer.Payload.Should().BeEquivalentTo(new VerifyEmailPayload {
			UserId = success.User.GetRequiredId(),
			IsWelcomeEmail = true
		});

		await using var verify = CreateDbContext();
		var persistedUser = await verify.User
			.AsNoTracking()
			.FirstAsync(u => u.Email == email);
		persistedUser.GetRequiredId().Should().Be(success.User.GetRequiredId());

		var persistedAccount = await verify.UserAccount
			.AsNoTracking()
			.SingleAsync(a => a.UserId == persistedUser.GetRequiredId());
		persistedAccount.Scope.Should().Be(AccountScope.Staff);
	}

	private static string BaseConnectionString(ApiFixture fixture) {
		using var scope = fixture.Factory.Services.CreateScope();
		var connectionString = scope.ServiceProvider
			.GetRequiredService<AppDbContext>()
			.Database.GetConnectionString();

		if (connectionString is null) {
			throw new InvalidOperationException("Test database connection string was null.");
		}

		return connectionString;
	}

	private AppDbContext CreateDbContext() {
		return CreateDbContext(applicationName: null);
	}

	private AppDbContext CreateDbContext(string? applicationName) {
		var connectionString = BaseConnectionString(_fixture);
		if (applicationName is not null) {
			var builder = new NpgsqlConnectionStringBuilder(connectionString) {
				ApplicationName = applicationName
			};
			connectionString = builder.ConnectionString;
		}

		return new AppDbContext(
			new DbContextOptionsBuilder<AppDbContext>()
				.UseNpgsql(connectionString)
				.Options
		);
	}

	private sealed class RecordingEnqueuer : IJobEnqueuer {
		public int Calls { get; private set; }
		public VerifyEmailPayload? Payload { get; private set; }

		public Task<Guid> EnqueueAsync<TPayload>(
			JobDefinition<TPayload> definition,
			TPayload payload,
			EnqueueOptions? options = null,
			CancellationToken cancellationToken = default
		) {
			Calls += 1;
			if (payload is VerifyEmailPayload verifyEmailPayload) {
				Payload = verifyEmailPayload;
			}

			return Task.FromResult(Guid.NewGuid());
		}
	}

	private sealed class RejectingEnqueuer : IJobEnqueuer {
		public int Calls { get; private set; }

		public Task<Guid> EnqueueAsync<TPayload>(
			JobDefinition<TPayload> definition,
			TPayload payload,
			EnqueueOptions? options = null,
			CancellationToken cancellationToken = default
		) {
			Calls += 1;
			throw new InvalidOperationException("not used in this test");
		}
	}

	private sealed class FailingCreateStaffAccountService : IAccountService {
		public Task<CreateStaffAccountResult> CreateStaffAccountAsync(
			Guid userId,
			AccountLevel? accountLevel = null,
			CancellationToken cancellationToken = default
		) {
			return Task.FromResult<CreateStaffAccountResult>(
				new CreateStaffAccountResult.UserHasTenantOrProjectAccounts()
			);
		}

		public Task<UserAccount?> GetUserStaffAccountAsync(
			Guid userId,
			CancellationToken cancellationToken = default
		) {
			throw new NotImplementedException();
		}

		public Task<UserAccount?> GetUserTenantAccountAsync(
			Guid userId,
			Guid tenantId,
			CancellationToken cancellationToken = default
		) {
			throw new NotImplementedException();
		}

		public Task<bool> IsUserStaffUserAsync(
			Guid userId,
			CancellationToken cancellationToken = default
		) {
			throw new NotImplementedException();
		}

		public Task<bool> IsUserMemberOfTenantAsync(
			Guid userId,
			Guid tenantId,
			CancellationToken cancellationToken = default
		) {
			throw new NotImplementedException();
		}

		public Task<bool> IsUserMemberOfActiveTenantAsync(
			Guid userId,
			Guid tenantId,
			CancellationToken cancellationToken = default
		) {
			throw new NotImplementedException();
		}

		public Task<bool> HasStaffAccountAsync(
			Guid userId,
			CancellationToken cancellationToken = default
		) {
			throw new NotImplementedException();
		}

		public Task<bool> HasTenantAccountAsync(
			Guid userId,
			Guid tenantId,
			CancellationToken cancellationToken = default
		) {
			throw new NotImplementedException();
		}

		public Task<ResolveTenantInvitationTargetByEmailResult> ResolveTenantInvitationTargetByEmailAsync(
			string email,
			Guid tenantId,
			CancellationToken cancellationToken = default
		) {
			throw new NotImplementedException();
		}

		public Task<bool> HasTenantOrProjectAccountsAsync(
			Guid userId,
			CancellationToken cancellationToken = default
		) {
			return Task.FromResult(false);
		}

		public Task<bool> HasTenantAccountByEmailAsync(
			string email,
			Guid tenantId,
			CancellationToken cancellationToken = default
		) {
			return Task.FromResult(false);
		}

		public Task<bool> HasTenantOrProjectAccountsByEmailAsync(
			string email,
			CancellationToken cancellationToken = default
		) {
			return Task.FromResult(false);
		}

		public Task<bool> HasStaffAccountByEmailAsync(
			string email,
			CancellationToken cancellationToken = default
		) {
			return Task.FromResult(false);
		}

		public Task<List<string>> GetEmailsWithTenantOrProjectAccountsAsync(
			List<string> emails,
			CancellationToken cancellationToken = default
		) {
			return Task.FromResult(new List<string>());
		}

		public Task<List<string>> GetEmailsWithStaffAccountsAsync(
			List<string> emails,
			CancellationToken cancellationToken = default
		) {
			return Task.FromResult(new List<string>());
		}

		public Task<List<UserAccount>> FindUserTenantAccountsAsync(
			Guid userId,
			int? limit = null,
			CancellationToken cancellationToken = default
		) {
			return Task.FromResult(new List<UserAccount>());
		}

		public Task<CreateTenantAccountResult> CreateTenantAccountAsync(
			Guid userId,
			Guid tenantId,
			AccountLevel accountLevel,
			CancellationToken cancellationToken = default
		) {
			throw new NotImplementedException();
		}

		public Task AssignProfileToAccountAsync(
			Guid accountId,
			Guid profileId,
			CancellationToken cancellationToken = default
		) {
			throw new NotImplementedException();
		}

		public Task<UserTenantsResult> GetUserTenantsAsync(
			Guid userId,
			int limit = 5,
			CancellationToken cancellationToken = default
		) {
			throw new NotImplementedException();
		}

		public Task<UserTenantsForPickerResult> GetUserTenantsForPickerAsync(
			Guid userId,
			int limit = 50,
			CancellationToken cancellationToken = default
		) {
			throw new NotImplementedException();
		}
	}
}
