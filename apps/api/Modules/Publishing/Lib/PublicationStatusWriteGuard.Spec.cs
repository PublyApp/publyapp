using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Posts.Entities;
using PublyApp.Api.Modules.Publishing.Entities;
using PublyApp.Api.Modules.Publishing.Services;
using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Modules.Publishing.Lib;

// Runtime containment for the Publication.Status single-writer guard (#1446,
// D1 follow-up): the Roslyn semantic walk (PublicationArchitectureSpec) cannot
// see a reflection writer or SQL assembled from pieces, so the DbContext itself
// refuses any tracked Status modification that the transition service did not
// stamp. Direct-invocation integration spec: real ephemeral Postgres, real
// DbContext, no HTTP surface.
public sealed class PublicationStatusWriteGuardSpec : IClassFixture<ApiFixture> {
	private readonly ApiFixture _fixture;

	public PublicationStatusWriteGuardSpec(ApiFixture fixture) {
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

	private static async Task<Publication> SeedScheduledPublicationAsync(
		AppDbContext db
	) {
		var tenant = new PublyApp.Api.Modules.Tenants.Entities.Tenant {
			Name = $"pub-status-guard-{Guid.NewGuid():N}",
			Code = Guid.NewGuid().ToString("N")[..10],
			Status = PublyApp.Api.Modules.Tenants.Entities.TenantStatus.Active,
			MaxUsers = 10,
		};
		var user = new User {
			Email = $"pub-status-guard-{Guid.NewGuid():N}@example.com",
			Password = "unused",
			IsVerified = true,
		};
		db.Tenant.Add(tenant);
		db.User.Add(user);
		await db.SaveChangesAsync();

		var post = new Post {
			TenantId = tenant.GetRequiredId(),
			Body = "status guard seed",
			CreatedByUserId = user.GetRequiredId(),
		};
		var account = new SocialAccount {
			TenantId = tenant.GetRequiredId(),
			ExternalAccountId = $"did:plc:{Guid.NewGuid():N}",
			DisplayHandle = "@statusguard.bsky.social",
			ProtectedCredentials = "enc-spec-blob",
		};
		db.Post.Add(post);
		db.SocialAccount.Add(account);
		await db.SaveChangesAsync();

		var publication = new Publication {
			TenantId = tenant.GetRequiredId(),
			PostId = post.GetRequiredId(),
			SocialAccountId = account.GetRequiredId(),
			Status = PublicationStatus.Scheduled,
			ScheduledAtUtc = DateTime.UtcNow.AddHours(1),
			ScheduledTimeZone = "Etc/UTC",
			IdempotencyKey = "status-guard-seed-0001",
		};
		db.Publication.Add(publication);
		await db.SaveChangesAsync();
		return publication;
	}

	[Fact]
	public async Task ItShouldRejectAReflectionStatusWriteAtSaveTime() {
		using var db = await NewDbAsync();
		var seeded = await SeedScheduledPublicationAsync(db);

		// The evasion shape the Roslyn scan can never see: the property is
		// reached by name at runtime, so no symbolic scan attributes this write.
		typeof(Publication)
			.GetProperty(nameof(Publication.Status))!
			.SetValue(seeded, PublicationStatus.Published);
		db.Entry(seeded).State = EntityState.Modified;

		var act = async () => await db.SaveChangesAsync();

		var id = seeded.GetRequiredId();
		(await act.Should().ThrowAsync<PublicationStatusGuardException>())
			.Which.Message.Should().Contain(id.ToString())
			.And.Contain($"{PublicationStatus.Scheduled}")
			.And.Contain($"{PublicationStatus.Published}")
			.And.Contain("not written through the transition service");

		// Nothing leaked: the row still carries its old status on disk.
		await db.Entry(seeded).ReloadAsync();
		seeded.Status.Should().Be(PublicationStatus.Scheduled);
	}

	[Fact]
	public async Task ItShouldRejectAnUnstampedTrackedStatusChangeEvenWithoutReflection() {
		// A plain property assignment from non-service code is the same crime:
		// only the transition service's stamp legalises a Status write.
		using var db = await NewDbAsync();
		var seeded = await SeedScheduledPublicationAsync(db);

		seeded.Status = PublicationStatus.Failed;
		seeded.LastError = "unstamped direct write";

		var act = async () => await db.SaveChangesAsync();
		var id = seeded.GetRequiredId();
		(await act.Should().ThrowAsync<PublicationStatusGuardException>())
			.Which.Message.Should().Contain(id.ToString());
	}

	[Fact]
	public async Task ItShouldLetTheTransitionServiceStillSave() {
		using var db = await NewDbAsync();
		var seeded = await SeedScheduledPublicationAsync(db);
		var service = new PublicationStatusTransitionService(db);

		var moved = await service.MarkInProgressAsync(
			new MarkPublicationInProgressArgs(seeded.GetRequiredId(), seeded.TenantId),
			CancellationToken.None
		);

		moved.Should().BeTrue();
		await db.Entry(seeded).ReloadAsync();
		seeded.Status.Should().Be(PublicationStatus.InProgress);
	}

	[Fact]
	public async Task ItShouldLetOtherPropertiesChangeWithoutTheStamp() {
		// The guard pins ONLY Status: schedule edits and cause writes stay free
		// for every caller.
		using var db = await NewDbAsync();
		var seeded = await SeedScheduledPublicationAsync(db);

		seeded.ScheduledAtUtc = DateTime.UtcNow.AddHours(3);

		var act = async () => await db.SaveChangesAsync();
		await act.Should().NotThrowAsync();
	}
}
