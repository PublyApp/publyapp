using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace PublyApp.Api.Modules.Publishing.Entities;

public sealed class PublicationSegmentResultConfiguration
	: IEntityTypeConfiguration<PublicationSegmentResult> {
	public void Configure(EntityTypeBuilder<PublicationSegmentResult> builder) {
		builder
			.HasIndex(result => new { result.PublicationId, result.SegmentPosition })
			.IsUnique()
			.HasDatabaseName("ux_publication_segment_results_live_position")
			.HasFilter("is_deleted = false");

		builder
			.HasOne<Publication>()
			.WithMany()
			.HasForeignKey(result => result.PublicationId)
			.OnDelete(DeleteBehavior.Cascade);

		builder
			.HasOne(result => result.Tenant)
			.WithMany()
			.HasForeignKey(result => result.TenantId)
			.OnDelete(DeleteBehavior.Cascade);
	}
}
