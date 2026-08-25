using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace PublyApp.Api.Modules.Messaging.Entities;

public sealed class EmailLogEvidenceEventConfiguration : IEntityTypeConfiguration<EmailLogEvidenceEvent> {
	public void Configure(EntityTypeBuilder<EmailLogEvidenceEvent> builder) {
		// Explicit snake_case PK constraint name, matching the jobs-infra evidence-table
		// convention (job_dead_letter_events).
		builder.HasKey(entity => entity.Id).HasName("pk_email_log_evidence_events");
		builder.Property(entity => entity.Id).HasDefaultValueSql("uuidv7()");
		builder.Property(entity => entity.OccurredAt).HasDefaultValueSql("now()");

		builder
			.HasOne(entity => entity.EmailLog)
			.WithMany()
			.HasForeignKey(entity => entity.EmailLogId)
			.IsRequired()
			.HasConstraintName("fk_email_log_evidence_events_email_log_id")
			.OnDelete(DeleteBehavior.Cascade);

		builder
			.HasIndex(entity => new { entity.EmailLogId, entity.OccurredAt })
			.HasDatabaseName("ix_email_log_evidence_events_email_log_id");
	}
}
