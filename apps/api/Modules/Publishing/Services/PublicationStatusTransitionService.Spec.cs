using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Posts.Entities;
using PublyApp.Api.Modules.Publishing.Entities;
using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Publishing.Services;

// Direct-invocation integration spec: real ephemeral Postgres, real DbContext,
// no HTTP surface — D1 owns no endpoint.
public sealed class PublicationStatusTransitionServiceSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public PublicationStatusTransitionServiceSpec(ApiFixture fixture) {
		_fixture = fixture;
	}

	private async Task<AppDbContext> NewDbAsync() {
		await using var scope = _fixture.Factory.Services.CreateAsyncScope();
		var connectionString = scope.ServiceProvider
			.GetRequiredService<AppDbContext>()
			.Database.GetConnectionString();

		if (connectionString is null) {
			throw new InvalidOperationException(
				"Test database connection string was unexpectedly null."
			);
		}

		return new AppDbContext(
			new DbContextOptionsBuilder<AppDbContext>()
				.UseNpgsql(connectionString)
				.Options
		);
	}

	private static PublicationStatusTransitionService NewService(AppDbContext db) {
		return new PublicationStatusTransitionService(db);
	}

	private static async Task<Publication> SeedAsync(
		AppDbContext db,
		PublicationStatus status
	) {
		var tenant = new PublyApp.Api.Modules.Tenants.Entities.Tenant {
			Name = $"pub-transition-{Guid.NewGuid():N}",
			Code = Guid.NewGuid().ToString("N")[..10],
			Status = PublyApp.Api.Modules.Tenants.Entities.TenantStatus.Active,
			MaxUsers = 10,
		};
		var user = new User {
			Email = $"pub-transition-{Guid.NewGuid():N}@example.com",
			Password = "unused",
			IsVerified = true,
		};
		db.Tenant.Add(tenant);
		db.User.Add(user);
		await db.SaveChangesAsync();

		var tenantId = tenant.GetRequiredId();
		var userId = user.GetRequiredId();

		var post = new Post {
			TenantId = tenantId,
			Body = "hello from the transition spec",
			CreatedByUserId = userId,
		};
		var account = new SocialAccount {
			TenantId = tenantId,
			ExternalAccountId = $"did:plc:{Guid.NewGuid():N}",
			DisplayHandle = "@transition.bsky.social",
			ProtectedCredentials = "enc-spec-blob",
		};
		db.Post.Add(post);
		db.SocialAccount.Add(account);
		await db.SaveChangesAsync();

		var publication = new Publication {
			TenantId = tenantId,
			PostId = post.GetRequiredId(),
			SocialAccountId = account.GetRequiredId(),
			Status = status,
			ScheduledAtUtc = DateTime.UtcNow.AddHours(1),
			ScheduledTimeZone = "Etc/UTC",
			IdempotencyKey = "seeded-key-0001",
		};
		db.Publication.Add(publication);
		await db.SaveChangesAsync();
		return publication;
	}

	[Fact]
	public async Task ItShouldMoveScheduledToInProgressAndCountTheAttempt() {
		using var db = await NewDbAsync();
		var seeded = await SeedAsync(db, PublicationStatus.Scheduled);
		var service = NewService(db);

		var moved = await service.MarkInProgressAsync(
			new MarkPublicationInProgressArgs(seeded.GetRequiredId(), seeded.TenantId),
			CancellationToken.None
		);

		moved.Should().BeTrue();
		await db.Entry(seeded).ReloadAsync();
		seeded.Status.Should().Be(PublicationStatus.InProgress);
		seeded.Attempts.Should().Be(1);
	}

	[Fact]
	public async Task ItShouldPublishWithRecordIdentityAndClearTheCause() {
		using var db = await NewDbAsync();
		var seeded = await SeedAsync(db, PublicationStatus.InProgress);
		seeded.LastError = "older transient cause";
		await db.SaveChangesAsync();
		var service = NewService(db);

		var published = await service.MarkPublishedAsync(
			new MarkPublicationPublishedArgs(
				seeded.GetRequiredId(),
				seeded.TenantId,
				"at://did.example/app.bsky.feed.post/abc123",
				"https://bsky.app/profile/did.example/post/abc123"
			),
			CancellationToken.None
		);

		published.Should().BeTrue();
		await db.Entry(seeded).ReloadAsync();
		seeded.Status.Should().Be(PublicationStatus.Published);
		seeded.ExternalRecordId.Should().Contain("abc123");
		seeded.ExternalUrl.Should().StartWith("https://bsky.app/");
		seeded.LastError.Should().BeNull("publishing clears any stale cause");
	}

	[Fact]
	public async Task ItShouldFailWithASanitisedCause() {
		using var db = await NewDbAsync();
		var seeded = await SeedAsync(db, PublicationStatus.InProgress);
		var service = NewService(db);
		var cause = "Bluesky refused the record: 'super-secret-token-value' is invalid";

		await service.MarkFailedAsync(
			new MarkPublicationFailedArgs(
				seeded.GetRequiredId(),
				seeded.TenantId,
				cause
			),
			CancellationToken.None
		);

		await db.Entry(seeded).ReloadAsync();
		seeded.Status.Should().Be(PublicationStatus.Failed);
		seeded.LastError.Should().NotBeNull();
		seeded.LastError!.Should().NotContain("super-secret-token-value");
		seeded.LastError!.Should().Contain("[redacted]");
	}

	[Fact]
	public async Task ItShouldPauseWithACause() {
		using var db = await NewDbAsync();
		var seeded = await SeedAsync(db, PublicationStatus.InProgress);
		var service = NewService(db);

		await service.MarkPausedAsync(
			new MarkPublicationPausedArgs(
				seeded.GetRequiredId(),
				seeded.TenantId,
				"The Bluesky session could not be opened."
			),
			CancellationToken.None
		);

		await db.Entry(seeded).ReloadAsync();
		seeded.Status.Should().Be(PublicationStatus.Paused);
		seeded.LastError.Should().Be("The Bluesky session could not be opened.");
	}

	[Fact]
	public async Task ItShouldRescheduleKeepingTheKeyStable() {
		using var db = await NewDbAsync();
		var seeded = await SeedAsync(db, PublicationStatus.Failed);
		seeded.ExternalRecordId = "stale-record";
		await db.SaveChangesAsync();
		var originalKey = seeded.IdempotencyKey;
		var service = NewService(db);

		await service.RescheduleToNowAsync(
			new ReschedulePublicationToNowArgs(seeded.GetRequiredId(), seeded.TenantId),
			CancellationToken.None
		);

		await db.Entry(seeded).ReloadAsync();
		seeded.Status.Should().Be(PublicationStatus.Scheduled);
		seeded.ScheduledAtUtc.Should().BeOnOrBefore(DateTime.UtcNow.AddMinutes(1));
		seeded.IdempotencyKey.Should().Be(originalKey);
		seeded.ExternalRecordId.Should()
			.BeNull("a retry starts clean and the key stays stable");
	}

	[Fact]
	public async Task ItShouldRefuseAnIllegalTransition() {
		using var db = await NewDbAsync();
		var seeded = await SeedAsync(db, PublicationStatus.Scheduled);
		var service = NewService(db);

		var act = async () => await service.MarkPublishedAsync(
			new MarkPublicationPublishedArgs(
				seeded.GetRequiredId(),
				seeded.TenantId,
				"at://x",
				"https://example.test/x"
			),
			CancellationToken.None
		);

		await act.Should().ThrowAsync<InvalidOperationException>();
		await db.Entry(seeded).ReloadAsync();
		seeded.Status.Should().Be(PublicationStatus.Scheduled, "illegal moves change nothing");
	}

	[Fact]
	public async Task ItShouldHideForeignTenantRowsWithoutThrowing() {
		using var db = await NewDbAsync();
		var seeded = await SeedAsync(db, PublicationStatus.Scheduled);
		var service = NewService(db);

		var found = await service.MarkInProgressAsync(
			new MarkPublicationInProgressArgs(seeded.GetRequiredId(), Guid.NewGuid()),
			CancellationToken.None
		);

		found.Should().BeFalse("a foreign tenant must never see or move this row");
		await db.Entry(seeded).ReloadAsync();
		seeded.Status.Should().Be(PublicationStatus.Scheduled);
	}

	[Fact]
	public async Task ItShouldTruncateAnOversizedRawCause() {
		using var db = await NewDbAsync();
		var seeded = await SeedAsync(db, PublicationStatus.InProgress);
		var service = NewService(db);
		var oversized = new string('x', 5000);

		await service.MarkFailedAsync(
			new MarkPublicationFailedArgs(
				seeded.GetRequiredId(),
				seeded.TenantId,
				oversized
			),
			CancellationToken.None
		);

		await db.Entry(seeded).ReloadAsync();
		byte[] stored = System.Text.Encoding.UTF8.GetBytes(seeded.LastError!);
		stored.Length.Should().BeLessThanOrEqualTo(2048);
	}

	[Fact]
	public async Task ItShouldKeepAttemptsMonotonicAcrossCycles() {
		using var db = await NewDbAsync();
		var seeded = await SeedAsync(db, PublicationStatus.Failed);
		var firstAttemptCount = seeded.Attempts;
		var service = NewService(db);

		// Legal retry cycle: a failed publication is rescheduled first, then claimed.
		await service.RescheduleToNowAsync(
			new ReschedulePublicationToNowArgs(seeded.GetRequiredId(), seeded.TenantId),
			CancellationToken.None
		);
		await service.MarkInProgressAsync(
			new MarkPublicationInProgressArgs(seeded.GetRequiredId(), seeded.TenantId),
			CancellationToken.None
		);

		await db.Entry(seeded).ReloadAsync();
		seeded.Status.Should().Be(PublicationStatus.InProgress);
		seeded.Attempts.Should().Be(firstAttemptCount + 1);
	}
}
