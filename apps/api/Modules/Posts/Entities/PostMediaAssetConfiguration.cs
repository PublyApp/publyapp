using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace PublyApp.Api.Modules.Posts.Entities;

public sealed class PostMediaAssetConfiguration : IEntityTypeConfiguration<PostMediaAsset> {
	public void Configure(EntityTypeBuilder<PostMediaAsset> builder) {
		// Ordered images (#2170): positions are unique per post among live rows,
		// so two concurrent appends cannot claim the same slot (the loser hits a
		// unique violation) and the order is never ambiguous. Soft-deleted rows
		// are excluded so a replacement never fights a historical row.
		// Scoped to the post's OWN images (no segment): follow-up segments (#2181) keep
		// their own order under the index below.
		builder
			.HasIndex(asset => new { asset.PostId, asset.Position })
			.IsUnique()
			.HasDatabaseName("ux_post_media_assets_live_post_position")
			.HasFilter("is_deleted = false AND segment_id IS NULL");

		builder
			.HasIndex(asset => new { asset.SegmentId, asset.Position })
			.IsUnique()
			.HasDatabaseName("ux_post_media_assets_live_segment_position")
			.HasFilter("is_deleted = false AND segment_id IS NOT NULL");

		builder
			.HasOne<PostSegment>()
			.WithMany()
			.HasForeignKey(asset => asset.SegmentId)
			.OnDelete(DeleteBehavior.Cascade);

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
