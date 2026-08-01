using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

using PublyApp.Api.Data.DbContext;

namespace PublyApp.Api.Modules.Jobs.Entities;

public sealed class SystemJobDefinitionConfiguration : IEntityTypeConfiguration<SystemJobDefinition> {
	public void Configure(EntityTypeBuilder<SystemJobDefinition> builder) {
		EntityConfigurationMarker.Mark(builder);

		// Dashboard-configurable recurring system jobs (design §4.3). A BaseAttributes
		// entity — the uuidv7 id + soft-delete columns come from the generic loop below;
		// this block adds the explicit snake_case PK name and the job_key uniqueness
		// invariant scoped to non-deleted rows.
		builder.HasKey(entity => entity.Id).HasName("pk_system_job_definitions");
		builder.Property(entity => entity.IsEnabled).HasDefaultValue(true);
		builder.Property(entity => entity.ScheduleEpoch).HasDefaultValueSql("gen_random_uuid()");
		// §4.3 specifies a database-level DEFAULT false, so raw-SQL inserts (which
		// bypass UpdateAuditFields) can never leave is_deleted NULL-ish/unset.
		builder.Property(entity => entity.IsDeleted).HasDefaultValue(false);
		builder.Property(entity => entity.CreatedAt).HasDefaultValueSql("now()");
		builder.Property(entity => entity.UpdatedAt).HasDefaultValueSql("now()");

		builder
			.HasIndex(entity => entity.JobKey)
			.IsUnique()
			.HasDatabaseName("ux_system_job_definitions_job_key")
			.HasFilter("is_deleted = false");
	}
}
