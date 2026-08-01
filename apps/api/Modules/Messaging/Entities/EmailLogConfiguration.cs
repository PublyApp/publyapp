using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

using PublyApp.Api.Data.DbContext;

namespace PublyApp.Api.Modules.Messaging.Entities;

public sealed class EmailLogConfiguration : IEntityTypeConfiguration<EmailLog> {
	public void Configure(EntityTypeBuilder<EmailLog> builder) {
		EntityConfigurationMarker.Mark(builder);

		// Append-only email delivery record (design §4.4, F20). Not a BaseAttributes
		// entity — written once at a terminal outcome and never mutated/soft-deleted; the
		// uuidv7 id + now() timestamps are configured explicitly here. Indexes serve the
		// support query (recipient+time), kind/time, related-entity lookups, and the
		// unique job_id idempotency marker (§5.4). No FK constraints on invitation_id /
		// user_id — an audit trail must outlive the rows it references.
		builder.HasKey(entity => entity.Id).HasName("pk_email_log");
		builder.Property(entity => entity.Id).HasDefaultValueSql("uuidv7()");
		builder.Property(entity => entity.Attempts).HasDefaultValue(0);
		builder.Property(entity => entity.EvidenceSource).HasDefaultValueSql("'local'");
		builder.Property(entity => entity.OccurredAt).HasDefaultValueSql("now()");
		builder.Property(entity => entity.CreatedAt).HasDefaultValueSql("now()");
		builder.Property(entity => entity.UpdatedAt).HasDefaultValueSql("now()");

		builder
			.HasIndex(entity => new { entity.Kind, entity.OccurredAt })
			.HasDatabaseName("ix_email_log_kind_occurred_at");
		builder
			.HasIndex(entity => new { entity.Recipient, entity.OccurredAt })
			.HasDatabaseName("ix_email_log_recipient_occurred_at");
		builder
			.HasIndex(entity => entity.InvitationId)
			.HasDatabaseName("ix_email_log_invitation_id")
			.HasFilter("invitation_id IS NOT NULL");
		builder
			.HasIndex(entity => entity.UserId)
			.HasDatabaseName("ix_email_log_user_id")
			.HasFilter("user_id IS NOT NULL");

		builder
			.HasIndex(entity => entity.OccurredAt)
			.HasDatabaseName("ix_email_log_occurred_at");
		builder
			.HasIndex(entity => new { entity.OccurredAt, entity.Id })
			.HasDatabaseName("ix_email_log_occurred_at_id");
		builder
			.HasIndex(entity => entity.OccurredAt)
			.HasDatabaseName("ix_email_log_permanently_failed_occurred_at")
			.HasFilter("outcome = 2");

		// Provider correlation lookup (F3/F20): resolve a delivery by provider message
		// id. Partial — only accepted sends carry one.
		builder
			.HasIndex(entity => entity.ProviderMessageId)
			.HasDatabaseName("ix_email_log_provider_message_id")
			.HasFilter("provider_message_id IS NOT NULL");

		// One terminal outcome per job: doubles as the handler idempotency marker
		// (§5.4 — a reclaimed job whose row exists must not resend).
		builder
			.HasIndex(entity => entity.JobId)
			.IsUnique()
			.HasDatabaseName("ux_email_log_job_id")
			.HasFilter("job_id IS NOT NULL");

		// One historical row per source outbox row: the arbiter that makes the fold's
		// back-copy idempotent and re-run-safe across R1/R2 (§4.4/§4.6, F4/C3).
		builder
			.HasIndex(entity => entity.LegacyOutboxId)
			.IsUnique()
			.HasDatabaseName("ux_email_log_legacy_outbox_id")
			.HasFilter("legacy_outbox_id IS NOT NULL");

		// Provider evidence dedup (§4.4): rejects a concurrent webhook/reconciliation
		// replay of the same event.
		builder
			.HasIndex(entity => entity.ProviderEventId)
			.IsUnique()
			.HasDatabaseName("ux_email_log_provider_event_id")
			.HasFilter("provider_event_id IS NOT NULL");

		// The email-log-retention age sweep (§7.3). Both composite indexes above lead
		// with kind/recipient, so neither can serve a global scan by age (R5-3).
		//
		// Retain the legacy global time index for targeted analytics queries that still
		// probe only by occurred_at.
	}
}
