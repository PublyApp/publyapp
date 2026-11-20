using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace PublyApp.Api.Modules.Aggregators.Entities;

public sealed class AggregatorConnectionConfiguration : IEntityTypeConfiguration<AggregatorConnection> {
	public void Configure(EntityTypeBuilder<AggregatorConnection> builder) {
		builder
			.HasIndex(connection => new { connection.TenantId, connection.Kind })
			.IsUnique()
			.HasFilter("is_deleted = false")
			.HasDatabaseName("ix_aggregator_connections_tenant_kind");

		builder
			.HasOne(connection => connection.Tenant)
			.WithMany()
			.HasForeignKey(connection => connection.TenantId)
			.OnDelete(DeleteBehavior.Cascade);
	}
}
