using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace PublyApp.Api.Modules.Impersonations.Entities;

public sealed class ImpersonationSessionEndConfiguration : IEntityTypeConfiguration<ImpersonationSessionEnd> {
	public void Configure(EntityTypeBuilder<ImpersonationSessionEnd> builder) {
		builder.HasKey(entity => entity.SessionId).HasName("pk_impersonation_session_ends");
		// The id is the impersonation session's own id, never generated here.
		builder.Property(entity => entity.SessionId).ValueGeneratedNever();
		builder.Property(entity => entity.CreatedAt).HasDefaultValueSql("now()");
		builder.Property(entity => entity.Reason).HasConversion<string>().HasMaxLength(16);

		// The retention sweep scans and orders by ended_at.
		builder
			.HasIndex(entity => new { entity.EndedAt, entity.SessionId })
			.HasDatabaseName("ix_impersonation_session_ends_ended_at_session_id");
	}
}
