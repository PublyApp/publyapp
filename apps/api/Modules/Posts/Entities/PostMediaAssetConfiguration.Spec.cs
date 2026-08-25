using FluentAssertions;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Metadata;

using PublyApp.Api.Data.DbContext;

using Xunit;

namespace PublyApp.Api.Modules.Posts.Entities;

/// <summary>
/// Mapping guard for the post media asset slice (#639): the entity must be
/// covered by exactly one configuration whose real content lands in the EF
/// design-time model — cascade FK to posts, tenant+post lookup index, and the
/// partial unique index that makes "one live image per post" a database
/// invariant rather than a service-layer promise. These assertions mirror the
/// committed snapshot, so they cannot drift from what migrations apply.
/// </summary>
public sealed class PostMediaAssetConfigurationSpec {
	[Fact]
	public void ItShouldMapTableWithCascadeFkWhenEntityIsConfigured() {
		using var dbContext = CreateDesignTimeDbContext();
		var entity = dbContext.GetService<IDesignTimeModel>().Model
			.FindEntityType(typeof(PostMediaAsset));
		entity.Should().NotBeNull(
			"PostMediaAsset must carry an IEntityTypeConfiguration<PostMediaAsset>"
		);
		Assert.NotNull(entity);
		entity!.GetTableName().Should().Be("post_media_assets");

		var fk = entity.GetForeignKeys().SingleOrDefault(fk =>
			fk.PrincipalEntityType.ClrType == typeof(Post)
		);
		fk.Should().NotBeNull("the asset row hangs off exactly one post");
		fk!.DeleteBehavior.Should().Be(
			DeleteBehavior.Cascade,
			"a deleted post must take its media asset row with it"
		);
	}

	[Fact]
	public void ItShouldEnforceOneLiveImagePerPostWithPartialUniqueIndex() {
		using var dbContext = CreateDesignTimeDbContext();
		var entity = dbContext.GetService<IDesignTimeModel>().Model
			.FindEntityType(typeof(PostMediaAsset));
		entity.Should().NotBeNull();

		var uniqueIndex = entity!.GetIndexes().SingleOrDefault(index =>
			index.IsUnique
			&& index.GetDatabaseName() == "ux_post_media_assets_live_post_id"
		);
		uniqueIndex.Should().NotBeNull(
			"one live image per post is enforced by a database constraint, "
			+ "not by application code"
		);
		uniqueIndex!.Properties.Select(property => property.Name).Should()
			.Equal("PostId");
		uniqueIndex.GetFilter().Should().Be(
			"is_deleted = false",
			"soft-deleted rows must not block attaching a fresh image"
		);
	}

	[Fact]
	public void ItShouldIndexTenantAndPostForScopedLookups() {
		using var dbContext = CreateDesignTimeDbContext();
		var entity = dbContext.GetService<IDesignTimeModel>().Model
			.FindEntityType(typeof(PostMediaAsset));
		entity.Should().NotBeNull();

		var lookupIndex = entity!.GetIndexes().SingleOrDefault(index =>
			index.GetDatabaseName() == "ix_post_media_assets_tenant_post"
		);
		lookupIndex.Should().NotBeNull(
			"attach/remove/read paths resolve assets by (tenant, post)"
		);
		lookupIndex!.Properties.Select(property => property.Name).Should()
			.Equal("TenantId", "PostId");
	}

	private static AppDbContext CreateDesignTimeDbContext() {
		var options = new DbContextOptionsBuilder<AppDbContext>()
			.UseNpgsql("Host=localhost;Database=post_media_asset_guard")
			.Options;

		return new AppDbContext(options);
	}
}
