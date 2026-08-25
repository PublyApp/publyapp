using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace PublyApp.Api.Modules.Jobs.Entities;

public sealed class JobDeadLetterEventConfiguration : IEntityTypeConfiguration<JobDeadLetterEvent> {
	public void Configure(EntityTypeBuilder<JobDeadLetterEvent> builder) {
		// Explicit snake_case PK constraint name, matching the Jobs module convention.
		builder.HasKey(entity => entity.Id).HasName("pk_job_dead_letter_events");
		builder.Property(entity => entity.Id).HasDefaultValueSql("uuidv7()");
		builder.Property(entity => entity.OccurredAt).HasDefaultValueSql("now()");

		builder
			.HasOne<JobDeadLetter>()
			.WithMany()
			.HasForeignKey(entity => entity.DeadLetterId)
			.HasConstraintName("fk_job_dead_letter_events_dead_letter_id")
			.OnDelete(DeleteBehavior.Cascade);

		builder
			.HasIndex(entity => new { entity.DeadLetterId, entity.OccurredAt })
			.HasDatabaseName("ix_job_dead_letter_events_dead_letter_id");
	}
}
