using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

using Npgsql;

using PublyApp.Api.Data.DbContext;
using PublyApp.Api.Lib.Testing.Fixtures;
using PublyApp.Api.Modules.Posts.Entities;
using PublyApp.Api.Modules.Publishing.Entities;
using PublyApp.Api.Modules.Publishing.Lib;
using PublyApp.Api.Modules.Publishing.Services;
using PublyApp.Api.Modules.SocialAccounts.Entities;
using PublyApp.Api.Modules.Tenants.Entities;
using PublyApp.Api.Modules.Users.Entities;

using Xunit;

namespace PublyApp.Api.Migrations;

// #2172: the migration is expand-only (one new table, nothing touched). Applying it on a
// database that already holds a post and a publication must leave both readable, resolve
// to the post's own content (no rendition row = no overrides) and cascade-delete a
// rendition with its publication. Dedicated throwaway database: the assertion is about
// the state TRANSITION, so the shared per-class template cannot be used.
public sealed class AddRenditionsSpec : IAsyncLifetime {
	private const string _PreviousMigrationId = "20261016134426_AddOAuthAppRegistrationProvider";

	private PostgresContainerFixture? _ContainerFixture;
	private string? _DbName;
	private string? _ConnectionString;

	public async Task InitializeAsync() {
		this._ContainerFixture = await PostgresContainerFixture.GetSharedAsync();
		this._DbName = $"migtest_{Guid.NewGuid():N}";
		await using var adminConn = new NpgsqlConnection(this._ContainerFixture.Required().AdminConnectionString);
		await adminConn.OpenAsync();
		await using (var createCmd = new NpgsqlCommand($"CREATE DATABASE {this._DbName}", adminConn)) {
			await createCmd.ExecuteNonQueryAsync();
		}

		this._ConnectionString = new NpgsqlConnectionStringBuilder(
			this._ContainerFixture.Required().AdminConnectionString
		) {
			Database = this._DbName.Required(),
			Pooling = false,
		}.ConnectionString;
	}

	public async Task DisposeAsync() {
		NpgsqlConnection.ClearAllPools();
		await using var adminConn = new NpgsqlConnection(this._ContainerFixture.Required().AdminConnectionString);
		await adminConn.OpenAsync();
		await using var dropCmd = new NpgsqlCommand($"DROP DATABASE IF EXISTS {this._DbName}", adminConn);
		await dropCmd.ExecuteNonQueryAsync();
	}

	[Fact]
	public async Task ItShouldApplyOnAPopulatedDatabaseAndKeepExistingPostsPublishingWithoutRenditionRows() {
		await using var db = new AppDbContext(
			new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(this._ConnectionString.Required()).Options
		);
		var migrator = db.GetService<IMigrator>();
		await migrator.MigrateAsync(AddRenditionsSpec._PreviousMigrationId);

		// Only the renditions table differs from the previous schema, so the other
		// entities can be seeded through the current model.
		var tenant = new Tenant {
			Name = $"mig-{Guid.NewGuid():N}",
			Code = Guid.NewGuid().ToString("N")[..10],
			Status = TenantStatus.Active,
			MaxUsers = 10,
		};
		var user = new User { Email = $"mig-{Guid.NewGuid():N}@example.com", Password = "unused", IsVerified = true };
		db.Tenant.Add(tenant);
		db.User.Add(user);
		await db.SaveChangesAsync();
		var post = new Post { TenantId = tenant.GetRequiredId(), Body = "legacy post", CreatedByUserId = user.GetRequiredId() };
		var account = new SocialAccount {
			TenantId = tenant.GetRequiredId(),
			ExternalAccountId = $"did:plc:{Guid.NewGuid():N}",
			DisplayHandle = "@legacy.bsky.social",
			ProtectedCredentials = "enc-spec-blob",
		};
		db.Post.Add(post);
		db.SocialAccount.Add(account);
		await db.SaveChangesAsync();
		var publication = new Publication {
			TenantId = tenant.GetRequiredId(),
			PostId = post.GetRequiredId(),
			SocialAccountId = account.GetRequiredId(),
			ScheduledAtUtc = DateTime.UtcNow.AddHours(1),
			ScheduledTimeZone = "Etc/UTC",
			IdempotencyKey = "legacy",
		};
		db.Publication.Add(publication);
		await db.SaveChangesAsync();
		db.ChangeTracker.Clear();

		var applyRemaining = async () => await migrator.MigrateAsync();
		await applyRemaining.Should().NotThrowAsync("the migration only adds a table");

		var tenantId = tenant.GetRequiredId();
		var publicationId = publication.GetRequiredId();
		(await db.Rendition.CountAsync()).Should().Be(0, "no backfill: no row means no overrides");
		var reloaded = await db.Post.AsNoTracking().SingleAsync(p => p.Id == post.Id);
		var effective = await RenditionResolver.ResolveForPublicationAsync(
			db, tenantId, publicationId, reloaded, CancellationToken.None
		);
		effective.Texts.Should().Equal("legacy post");

		var rendition = new Rendition { TenantId = tenantId, PublicationId = publicationId };
		new RenditionOverrides(new Dictionary<int, string> { [0] = "customized" }, null).WriteTo(rendition);
		db.Rendition.Add(rendition);
		await db.SaveChangesAsync();
		var duplicate = new Rendition { TenantId = tenantId, PublicationId = publicationId };
		db.Rendition.Add(duplicate);
		var second = async () => await db.SaveChangesAsync();
		await second.Should().ThrowAsync<DbUpdateException>("one rendition per publication");
		db.ChangeTracker.Clear();

		_ = await db.Publication.Where(p => p.Id == publicationId).ExecuteDeleteAsync();
		(await db.Rendition.CountAsync()).Should().Be(0, "a rendition is deleted with its publication");
	}
}
