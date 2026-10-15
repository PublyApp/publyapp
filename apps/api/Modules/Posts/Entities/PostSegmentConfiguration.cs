using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace PublyApp.Api.Modules.Posts.Entities;

public sealed class PostSegmentConfiguration : IEntityTypeConfiguration<PostSegment> {
	public void Configure(EntityTypeBuilder<PostSegment> builder) {
		// One live row per (post, position): the order is never ambiguous.
		builder
			.HasIndex(segment => new { segment.PostId, segment.Position })
			.IsUnique()
			.HasDatabaseName("ux_post_segments_live_post_position")
			.HasFilter("is_deleted = false");

		builder
			.HasIndex(segment => new { segment.TenantId, segment.PostId })
			.HasDatabaseName("ix_post_segments_tenant_post");

		builder
			.HasOne(segment => segment.Post)
			.WithMany()
			.HasForeignKey(segment => segment.PostId)
			.OnDelete(DeleteBehavior.Cascade);

		builder
			.HasOne(segment => segment.Tenant)
			.WithMany()
			.HasForeignKey(segment => segment.TenantId)
			.OnDelete(DeleteBehavior.Cascade);
	}
}
