using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace PublyApp.Api.Modules.Posts.Entities;

public sealed class PostSegmentMediaAssetConfiguration : IEntityTypeConfiguration<PostSegmentMediaAsset> {
	public void Configure(EntityTypeBuilder<PostSegmentMediaAsset> builder) {
		// A segment orders its own images: one live row per (segment, position), so two
		// concurrent appends cannot claim the same slot (the loser hits a unique violation).
		builder
			.HasIndex(asset => new { asset.SegmentId, asset.Position })
			.IsUnique()
			.HasDatabaseName("ux_post_segment_media_assets_live_segment_position")
			.HasFilter("is_deleted = false");

		builder
			.HasIndex(asset => new { asset.TenantId, asset.PostId })
			.HasDatabaseName("ix_post_segment_media_assets_tenant_post");

		builder
			.HasOne(asset => asset.Post)
			.WithMany()
			.HasForeignKey(asset => asset.PostId)
			.OnDelete(DeleteBehavior.Cascade);

		builder
			.HasOne<PostSegment>()
			.WithMany()
			.HasForeignKey(asset => asset.SegmentId)
			.OnDelete(DeleteBehavior.Cascade);

		builder
			.HasOne(asset => asset.Tenant)
			.WithMany()
			.HasForeignKey(asset => asset.TenantId)
			.OnDelete(DeleteBehavior.Cascade);
	}
}
