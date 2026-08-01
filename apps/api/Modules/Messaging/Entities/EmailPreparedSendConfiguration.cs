using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

using PublyApp.Api.Data.DbContext;

namespace PublyApp.Api.Modules.Messaging.Entities;

public sealed class EmailPreparedSendConfiguration : IEntityTypeConfiguration<EmailPreparedSend> {
	public void Configure(EntityTypeBuilder<EmailPreparedSend> builder) {
		EntityConfigurationMarker.Mark(builder);

		// Send-once envelope scratch (design §4.5, F7). Keyed by job_id (no surrogate id);
		// inserted once, hard-deleted at the terminal outcome or by the Phase-3 sweep.
		builder.HasKey(entity => entity.JobId).HasName("pk_email_prepared_sends");
		builder.Property(entity => entity.PreparedAt).HasDefaultValueSql("now()");

		// The email-prepared-sends-retention sweep scans and orders by prepared_at; the
		// job_id PK cannot serve it (§4.5, R5-3).
		builder
			.HasIndex(entity => entity.PreparedAt)
			.HasDatabaseName("ix_email_prepared_sends_prepared_at");
		builder
			.HasIndex(entity => new { entity.PreparedAt, entity.JobId })
			.HasDatabaseName("ix_email_prepared_sends_prepared_at_job_id");
	}
}
