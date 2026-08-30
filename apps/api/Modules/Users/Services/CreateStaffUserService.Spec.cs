using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using Npgsql;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Jobs;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Auth.Jobs;
using PublyApp.Api.Modules.Auth.Utils;
using PublyApp.Api.Modules.Tenants.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Users.Services;

public sealed class CreateStaffUserServiceSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public CreateStaffUserServiceSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	[Fact]
	public async Task ItShouldRejectWhenUserHasTenantOrProjectAccounts() {
		var email = $"create-staff-f1-{Guid.NewGuid():N}@example.com";

		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		await SeedUserWithTenantAccountAsync(dbContext, email);

		var enqueuer = new RejectingEnqueuer();
		var service = new CreateStaffUserService(
			dbContext,
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
		(await verify.User.AnyAsync(u => u.Email == email)).Should().BeTrue(
			"account conflicts must not create an additional user row"
		);
		(await verify.User.CountAsync(u => u.Email == email)).Should().Be(1);
	}

	[Fact]
	public async Task ItShouldRollbackUserAndAccountWhenEnqueueFails() {
		var email = $"create-staff-rollback-{Guid.NewGuid():N}@example.com";

		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var service = new CreateStaffUserService(
			dbContext,
			new RejectingEnqueuer()
		);

		var act = async () => await service.CreateStaffUserAsync(
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

		await act.Should().ThrowAsync<InvalidOperationException>();

		await using var verify = CreateDbContext();
		(await verify.User.CountAsync(u => u.Email == email)).Should().Be(0);
		(await verify.UserAccount.CountAsync(a => a.User.Email == email)).Should().Be(0);
	}

	[Fact]
	public async Task ItShouldCreateUserAccountAndEnqueueVerifyEmailWhenSuccessful() {
		var email = $"create-staff-success-{Guid.NewGuid():N}@example.com";

		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

		var enqueuer = new RecordingEnqueuer();
		var service = new CreateStaffUserService(
			dbContext,
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

	private static async Task SeedUserWithTenantAccountAsync(
		AppDbContext dbContext,
		string email
	) {
		var tenant = new Tenant {
			Code = $"tenant-{Guid.NewGuid():N}",
			Name = "Tenant",
			Status = TenantStatus.Active,
			MaxUsers = 100
		};
		dbContext.Tenant.Add(tenant);
		await dbContext.SaveChangesAsync();

		var user = new User {
			Email = email,
			Password = PasswordUtils.HashPassword("unused-password"),
			FirstName = "Seed",
			LastName = "User",
			Status = UserStatus.Active,
			IsVerified = true
		};
		dbContext.User.Add(user);
		await dbContext.SaveChangesAsync();

		var account = UserAccount.CreateTenantAccount(
			user.GetRequiredId(),
			tenant.GetRequiredId(),
			AccountLevel.User
		);
		await dbContext.UserAccount.AddAsync(account);
		await dbContext.SaveChangesAsync();
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

}
