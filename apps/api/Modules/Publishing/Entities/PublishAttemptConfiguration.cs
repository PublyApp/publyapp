using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace PublyApp.Api.Modules.Publishing.Entities;

public sealed class PublishAttemptConfiguration : IEntityTypeConfiguration<PublishAttempt> {
	public void Configure(EntityTypeBuilder<PublishAttempt> builder) {
		builder.ToTable(table => table.HasCheckConstraint(
			"CK_PublishAttempt_SubmissionState",
			"submission_state IN (1, 2, 3, 4, 5)"
		));

		builder
			.HasIndex(attempt => new { attempt.PublicationId, attempt.SegmentPosition })
			.HasDatabaseName("ix_publication_publish_attempts_publication_position");

		builder.Property(attempt => attempt.Operation).HasMaxLength(32);
		builder.Property(attempt => attempt.ContentFingerprint).HasMaxLength(64);
		builder.Property(attempt => attempt.IdempotencyKey).HasMaxLength(200);

		builder
			.HasOne<Publication>()
			.WithMany()
			.HasForeignKey(attempt => attempt.PublicationId)
			.OnDelete(DeleteBehavior.Cascade);

		builder
			.HasOne(attempt => attempt.Tenant)
			.WithMany()
			.HasForeignKey(attempt => attempt.TenantId)
			.OnDelete(DeleteBehavior.Cascade);
	}
}
