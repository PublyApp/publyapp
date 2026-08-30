using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using Npgsql;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Infrastructure.Jobs;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Auth.Jobs;
using PublyApp.Api.Modules.Auth.Utils;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Auth.Services;

public sealed class VerifyEmailRequestServiceSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public VerifyEmailRequestServiceSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	[Fact]
	public async Task ItShouldPersistTokenAndEnqueueVerifyEmailForUnverifiedUser() {
		var email = $"verify-unverified-{Guid.NewGuid():N}@example.com";
		var token = await SeedUnverifiedUserAsync(email);

		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var enqueuer = new RecordingEnqueuer();
		var service = new VerifyEmailRequestService(dbContext, enqueuer);

		var result = await service.RequestAsync(email, CancellationToken.None);

		result.Should().BeOfType<VerifyEmailRequestServiceResult.Success>();
		enqueuer.Calls.Should().Be(1);
		enqueuer.Payload.Should().BeOfType<VerifyEmailPayload>();
		enqueuer.Payload!.IsWelcomeEmail.Should().BeFalse();

		await using var verify = CreateDbContext();
		var user = await verify.User.FirstAsync(u => u.Id == token);
		user.EmailVerifyToken.Should().NotBeNullOrEmpty();
		user.EmailVerifyTokenExpiresAt.Should().NotBeNull();
	}

	[Fact]
	public async Task ItShouldReuseLiveTokenAndStillEnqueueVerifyEmail() {
		var email = $"verify-reuse-{Guid.NewGuid():N}@example.com";
		var liveToken = "live-token-" + Guid.NewGuid().ToString("N");
		var liveExpiresAt = DateTime.UtcNow.AddMinutes(15);
		var userId = await SeedUnverifiedUserAsync(
			email,
			token: liveToken,
			expiresAt: liveExpiresAt
		);

		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var enqueuer = new RecordingEnqueuer();
		var service = new VerifyEmailRequestService(dbContext, enqueuer);

		var result = await service.RequestAsync(email, CancellationToken.None);

		result.Should().BeOfType<VerifyEmailRequestServiceResult.Success>();
		enqueuer.Calls.Should().Be(1);

		await using var verify = CreateDbContext();
		var user = await verify.User.FirstAsync(u => u.Id == userId);
		user.EmailVerifyToken.Should().Be(liveToken, "a live token is reused");
		user.EmailVerifyTokenExpiresAt.Should().BeCloseTo(
			liveExpiresAt,
			TimeSpan.FromMilliseconds(1)
		);
	}

	[Fact]
	public async Task ItShouldRollbackTokenAndNotCreateJobWhenEnqueueFails() {
		var email = $"verify-rollback-{Guid.NewGuid():N}@example.com";
		var userId = await SeedUnverifiedUserAsync(email);

		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
		var service = new VerifyEmailRequestService(
			dbContext,
			new ThrowingEnqueuer()
		);

		var act = async () => await service.RequestAsync(email, CancellationToken.None);
		await act.Should().ThrowAsync<InvalidOperationException>();

		await using var verify = CreateDbContext();
		var user = await verify.User.FirstAsync(u => u.Id == userId);
		user.EmailVerifyToken.Should().BeNull();
		user.EmailVerifyTokenExpiresAt.Should().BeNull();
	}

	private async Task<Guid> SeedUnverifiedUserAsync(
		string email,
		string? token = null,
		DateTime? expiresAt = null
	) {
		await using var db = CreateDbContext();
		var user = new User {
			Email = email,
			Password = PasswordUtils.HashPassword("unused-password"),
			FirstName = "Test",
			LastName = "User",
			Status = UserStatus.Suspended,
			IsVerified = false,
			EmailVerifyToken = token,
			EmailVerifyTokenExpiresAt = expiresAt
		};

		await db.User.AddAsync(user);
		await db.SaveChangesAsync();
		return user.GetRequiredId();
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
			if (payload is VerifyEmailPayload verifyPayload) {
				Payload = verifyPayload;
			}

			return Task.FromResult(Guid.NewGuid());
		}
	}

	private sealed class ThrowingEnqueuer : IJobEnqueuer {
		public Task<Guid> EnqueueAsync<TPayload>(
			JobDefinition<TPayload> definition,
			TPayload payload,
			EnqueueOptions? options = null,
			CancellationToken cancellationToken = default
		) {
			throw new InvalidOperationException("enqueue failed");
		}
	}
}
