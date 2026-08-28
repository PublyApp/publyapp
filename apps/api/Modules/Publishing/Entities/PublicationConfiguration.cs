using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace PublyApp.Api.Modules.Publishing.Entities;

public sealed class PublicationConfiguration : IEntityTypeConfiguration<Publication> {
	public void Configure(EntityTypeBuilder<Publication> builder) {
		builder.ToTable(table => table.HasCheckConstraint(
			"CK_Publication_Status",
			"status IN (10, 20, 30, 40, 50)"
		));

		// One ACTIVE delivery per (post, account). Partial so a cancelled-and-recreated
		// pair is free again (soft-deleted rows leave the constraint), and so a
		// TERMINAL FAILED row frees the pair for a fresh attempt (round-2 MEDIUM fix:
		// a failed publish-now must be re-issuable, not locked forever — the failed
		// row stays as history). Published rows KEEP occupying the pair: the remote
		// record exists and a second delivery would double-post. Status literals are
		// pinned by CK_Publication_Status (40 = Failed).
		builder
			.HasIndex(publication => new { publication.PostId, publication.SocialAccountId })
			.IsUnique()
			.HasDatabaseName("ux_publications_post_account")
			.HasFilter("is_deleted = false AND status <> 40");

		// Due-scan claim path (D3): scheduled work ordered by instant.
		builder
			.HasIndex(publication => new { publication.Status, publication.ScheduledAtUtc })
			.HasDatabaseName("ix_publications_status_scheduled_at");

		// Tenant queue/calendar lists: keyset pagination by (instant, id) in one tenant.
		builder
			.HasIndex(publication => new {
				publication.TenantId,
				publication.ScheduledAtUtc,
				publication.Id
			})
			.HasDatabaseName("ix_publications_tenant_scheduled_at_id");

		// Schedule value object columns: the zone label stays bounded to the same
		// limit the PublicationSchedule.Create validator enforces.
		builder
			.Property(publication => publication.ScheduledTimeZone)
			.HasMaxLength(PublicationSchedule.MaxTimeZoneLength);

		builder
			.HasOne(publication => publication.Tenant)
			.WithMany()
			.HasForeignKey(publication => publication.TenantId)
			.OnDelete(DeleteBehavior.Cascade);

		builder
			.HasOne(publication => publication.Post)
			.WithMany()
			.HasForeignKey(publication => publication.PostId)
			.OnDelete(DeleteBehavior.Cascade);

		// History survives an account disconnect; accounts are never hard-deleted
		// today, so restrict keeps a dangling publication impossible.
		builder
			.HasOne(publication => publication.SocialAccount)
			.WithMany()
			.HasForeignKey(publication => publication.SocialAccountId)
			.OnDelete(DeleteBehavior.Restrict);
	}
}
