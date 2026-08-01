using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

using PublyApp.Api.Data.DbContext;

namespace PublyApp.Api.Modules.AuditLogs.Entities;

public sealed class AuditLogConfiguration : IEntityTypeConfiguration<AuditLog> {
	public void Configure(EntityTypeBuilder<AuditLog> builder) {
		EntityConfigurationMarker.Mark(builder);
	}
}
