using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace PublyApp.Api.Modules.Jobs.Entities;

public sealed class SystemJobOccurrenceConfiguration : IEntityTypeConfiguration<SystemJobOccurrence> {
	public void Configure(EntityTypeBuilder<SystemJobOccurrence> builder) {
		// Durable occurrence identity (§4.3): the composite PK is the cross-leader
		// dedup constraint. This is not a BaseAttributes entity and has no surrogate id.
		builder
			.HasKey(entity => new { entity.JobKey, entity.ScheduledFireAt })
			.HasName("pk_system_job_occurrences");
		builder.Property(entity => entity.EnqueuedAt).HasDefaultValueSql("now()");

		builder
			.HasIndex(entity => entity.ScheduledFireAt)
			.HasDatabaseName("ix_system_job_occurrences_scheduled_fire_at");
	}
}
