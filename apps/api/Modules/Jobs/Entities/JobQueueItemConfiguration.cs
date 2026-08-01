using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace PublyApp.Api.Modules.Jobs.Entities;

public sealed class JobQueueItemConfiguration : IEntityTypeConfiguration<JobQueueItem> {
	public void Configure(EntityTypeBuilder<JobQueueItem> builder) {
		// Generic job queue (Infrastructure/Jobs). Not a BaseAttributes entity by
		// design (§4.0): success is a hard delete and every engine transition runs
		// through raw SQL, so the uuidv7 id is configured explicitly here rather than
		// via the BaseAttributes auto-config loop below. All safety-relevant
		// timestamps are database-generated (F11) — the entity carries no C#
		// initializers and EF falls back to the SQL defaults on insert.

		// Explicit snake_case PK constraint name (design §4.1); EF's convention
		// would generate PK_job_queue.
		builder.HasKey(entity => entity.Id).HasName("pk_job_queue");
		builder.Property(entity => entity.Id).HasDefaultValueSql("uuidv7()");
		builder.Property(entity => entity.Payload).HasDefaultValueSql("'{}'");
		builder.Property(entity => entity.Status).HasDefaultValue(JobQueueStatus.Pending);
		builder.Property(entity => entity.Priority).HasDefaultValue(0);
		builder.Property(entity => entity.Attempts).HasDefaultValue(0);
		builder.Property(entity => entity.MaxAttempts).HasDefaultValue(10);
		builder.Property(entity => entity.NextAttemptAt).HasDefaultValueSql("now()");
		builder.Property(entity => entity.CreatedAt).HasDefaultValueSql("now()");
		builder.Property(entity => entity.UpdatedAt).HasDefaultValueSql("now()");

		// Envelope bounds (§4.1, F15): no unbounded retries, sane priorities.
		builder.ToTable(table => {
			table.HasCheckConstraint(
				"ck_job_queue_max_attempts",
				"max_attempts BETWEEN 1 AND 50"
			);
			table.HasCheckConstraint(
				"ck_job_queue_priority",
				"priority BETWEEN 0 AND 1000"
			);
		});

		// Claim hot path (F22): PENDING-ONLY partial index the claim query can
		// use as one ordered scan, with id as the total tie-break.
		builder
			.HasIndex(entity => new { entity.Priority, entity.NextAttemptAt, entity.CreatedAt, entity.Id })
			.HasDatabaseName("ix_job_queue_claim")
			.IsDescending(true, false, false, false)
			.HasFilter("status = 0");

		// Stale-lease reset path.
		builder
			.HasIndex(entity => entity.LockedUntil)
			.HasDatabaseName("ix_job_queue_reclaim")
			.HasFilter("status = 1");

		// In-flight dedup, scoped so unrelated job types can never collide (F13).
		builder
			.HasIndex(entity => new { entity.JobType, entity.IdempotencyKey })
			.IsUnique()
			.HasDatabaseName("ux_job_queue_type_idempotency")
			.HasFilter("idempotency_key IS NOT NULL");
	}
}
