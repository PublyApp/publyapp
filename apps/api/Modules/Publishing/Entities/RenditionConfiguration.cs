using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace PublyApp.Api.Modules.Publishing.Entities;

public sealed class RenditionConfiguration : IEntityTypeConfiguration<Rendition> {
	public void Configure(EntityTypeBuilder<Rendition> builder) {
		// One rendition per publication. Rows are hard-deleted on reset (never
		// soft-deleted), so a plain unique index is enough.
		builder
			.HasIndex(rendition => rendition.PublicationId)
			.IsUnique()
			.HasDatabaseName("ux_renditions_publication_id");

		builder
			.HasOne<Publication>()
			.WithMany()
			.HasForeignKey(rendition => rendition.PublicationId)
			.OnDelete(DeleteBehavior.Cascade);

		builder
			.HasOne(rendition => rendition.Tenant)
			.WithMany()
			.HasForeignKey(rendition => rendition.TenantId)
			.OnDelete(DeleteBehavior.Cascade);
	}
}
