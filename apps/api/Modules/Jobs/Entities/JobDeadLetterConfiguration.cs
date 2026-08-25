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

		// K-1 external-state triage (§5.1). Default 0 = None (backfill value for
		// pre-existing rows); the bounds stay NULL unless a classification sets them.
		builder.Property(entity => entity.ExternalStateStatus).HasDefaultValue(0);

		builder.ToTable(table => {
			table.HasCheckConstraint(
				"ck_job_dead_letter_external_state_bounds",
				"(external_state_status IN (0, 3) AND external_state_prepared_at IS NULL "
				+ "AND external_state_expires_at IS NULL AND external_state_expired_at IS NULL)"
				+ " OR (external_state_status IN (1, 2, 4, 5, 6) "
				+ "AND external_state_prepared_at IS NOT NULL "
				+ "AND external_state_expires_at IS NOT NULL)"
			);
			table.HasCheckConstraint(
				"ck_job_dead_letter_external_state_expired_at",
				"(external_state_status = 2 AND external_state_expired_at IS NOT NULL) "
				+ "OR (external_state_status <> 2 AND external_state_expired_at IS NULL)"
			);
			table.HasCheckConstraint(
				"ck_job_dead_letter_external_state_status",
				"external_state_status IN (0, 1, 2, 3, 4, 5, 6)"
			);
		});

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

		// Serves the retention sweep's exemption predicate and future triage queues:
		// only classified rows (status <> 0) are of interest there.
		builder
			.HasIndex(entity => entity.ExternalStateStatus)
			.HasDatabaseName("ix_job_dead_letter_external_state")
			.HasFilter("external_state_status <> 0");
	}
}
