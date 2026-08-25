using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace PublyApp.Api.Modules.Jobs.Entities;

public sealed class JobDeadLetterConfiguration : IEntityTypeConfiguration<JobDeadLetter> {
	public void Configure(EntityTypeBuilder<JobDeadLetter> builder) {
		// Explicit snake_case PK constraint name (design §4.2).
		builder.HasKey(entity => entity.Id).HasName("pk_job_dead_letter");
		builder.Property(entity => entity.Id).HasDefaultValueSql("uuidv7()");
		builder.Property(entity => entity.FailedAt).HasDefaultValueSql("now()");
		builder.Property(entity => entity.CreatedAt).HasDefaultValueSql("now()");

		builder
			.HasIndex(entity => new { entity.FailedAt, entity.Id })
			.HasDatabaseName("ix_job_dead_letter_failed_at_id");

		builder
			.HasIndex(entity => new { entity.JobType, entity.FailedAt })
			.HasDatabaseName("ix_job_dead_letter_job_type");

		builder
			.HasIndex(entity => entity.OriginalJobId)
			.HasDatabaseName("ix_job_dead_letter_original_job_id");

		// Walks the requeue chain backward/forward across re-dead-letterings
		// (§4.2, F16/C9). Partial: the column is NULL for every originally-
		// enqueued job, which is nearly all of them.
		builder
			.HasIndex(entity => entity.RequeuedFromDeadLetterId)
			.HasDatabaseName("ix_job_dead_letter_requeued_from")
			.HasFilter("requeued_from_dead_letter_id IS NOT NULL");

		// Serves the untriaged-Missing counters (#864): the retention sweep's held-row
		// report and the monitor's dlq_untriaged_missing alert both count rows that are
		// missing-anomalies AND not yet triaged. Partial on exactly that class, so the
		// normal (non-anomaly, triage-complete) majority stays out of the index entirely.
		builder
			.HasIndex(entity => entity.FailedAt)
			.HasDatabaseName("ix_job_dead_letter_untriaged_missing")
			.HasFilter($"triaged_at IS NULL AND job_type LIKE '{JobDeadLetter.MissingJobTypePrefix}%'");
	}
}
