using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace PublyApp.Api.Modules.Uploads.Entities;

/// <summary>
/// Mapping for <see cref="UploadAsset"/>. The partial unique index on
/// <c>relative_path</c> over live (non-deleted) rows is the join key between a
/// served <c>/files/...</c> URL and its durable record: at most one live asset can
/// own a path, so reference transitions keyed by path are unambiguous. A deleted
/// row keeps historical accounting out of the way but frees the path for reuse by
/// the storage layer's fresh UUID names only in principle — UUIDv7 collisions are
/// not a real scenario, and the index deliberately does not police reused paths.
/// </summary>
public sealed class UploadAssetConfiguration : IEntityTypeConfiguration<UploadAsset> {
	public void Configure(EntityTypeBuilder<UploadAsset> builder) {
		builder.ToTable(table => {
			table.HasCheckConstraint(
				"CK_UploadAssets_State",
				"state IN (10, 20, 30, 40, 50)"
			);
			table.HasCheckConstraint(
				"CK_UploadAssets_SizeBytes",
				"size_bytes > 0"
			);
			table.HasCheckConstraint(
				"CK_UploadAssets_ReferenceCount",
				"reference_count >= 0"
			);
		});

		// The URL→asset lookup runs on every logoUrl write; unique over live rows.
		builder
			.HasIndex(asset => asset.RelativePath)
			.IsUnique()
			.HasFilter("is_deleted = false")
			.HasDatabaseName("ux_upload_assets_relative_path_live");

		// Per-creator budget admission: SUM(size_bytes) WHERE created_by_user_id =
		// X AND state <> Deleted — covered by this index without touching the heap.
		builder
			.HasIndex(asset => new { asset.CreatedByUserId, asset.State })
			.HasFilter("is_deleted = false")
			.HasDatabaseName("ix_upload_assets_creator_state");

		// Sweeper scan: candidates by delete_not_before among orphaned rows.
		builder
			.HasIndex(asset => new { asset.State, asset.DeleteNotBefore })
			.HasDatabaseName("ix_upload_assets_state_delete_not_before");

		builder
			.HasOne(asset => asset.CreatedByUser)
			.WithMany()
			.HasForeignKey(asset => asset.CreatedByUserId)
			.OnDelete(DeleteBehavior.Restrict);

		builder
			.Property(asset => asset.RelativePath)
			.HasMaxLength(512);

		builder
			.Property(asset => asset.ContentType)
			.HasMaxLength(64);

		builder
			.Property(asset => asset.Purpose)
			.HasMaxLength(32);
	}
}
