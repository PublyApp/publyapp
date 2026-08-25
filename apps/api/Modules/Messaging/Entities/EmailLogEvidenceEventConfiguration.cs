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

		// Database-level actor invariants (#866 round-1): even a raw-SQL writer cannot
		// persist an unnamed author. Mirrors EmailLogActor's constructor invariants —
		// the kind is the EmailLogActorKinds vocabulary and the id is non-empty/bounded.
		builder.ToTable(table => table.HasCheckConstraint(
			"ck_email_log_evidence_events_actor_kind",
			"actor_kind IN ('provider_webhook', 'provider_reconciliation')"
		));

		builder.ToTable(table => table.HasCheckConstraint(
			"ck_email_log_evidence_events_actor_id",
			"length(actor_id) > 0 AND length(actor_id) <= 512"
		));

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
