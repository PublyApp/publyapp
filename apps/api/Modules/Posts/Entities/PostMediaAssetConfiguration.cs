using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace PublyApp.Api.Modules.Posts.Entities;

public sealed class PostMediaAssetConfiguration : IEntityTypeConfiguration<PostMediaAsset> {
	public void Configure(EntityTypeBuilder<PostMediaAsset> builder) {
		// One live image per post (#639): the partial unique index makes the v1
		// invariant a database constraint. Soft-deleted rows are excluded from the
		// predicate so a replacement never fights a historical row; relaxing this
		// predicate is how multiple images per post ship later without a
		// contracting migration.
		builder
			.HasIndex(asset => asset.PostId)
			.IsUnique()
			.HasDatabaseName("ux_post_media_assets_live_post_id")
			.HasFilter("is_deleted = false");

		// Attach/remove/read all resolve an asset by its tenant and post.
		builder
			.HasIndex(asset => new { asset.TenantId, asset.PostId })
			.HasDatabaseName("ix_post_media_assets_tenant_post");

		builder
			.HasOne(asset => asset.Post)
			.WithMany()
			.HasForeignKey(asset => asset.PostId)
			.OnDelete(DeleteBehavior.Cascade);

		builder
			.HasOne(asset => asset.Tenant)
			.WithMany()
			.HasForeignKey(asset => asset.TenantId)
			.OnDelete(DeleteBehavior.Cascade);
	}
}
