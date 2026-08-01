using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

using PublyApp.Api.Lib;

namespace PublyApp.Api.Modules.Tenants.Entities;

public sealed class TenantConfiguration : IEntityTypeConfiguration<Tenant> {
	public void Configure(EntityTypeBuilder<Tenant> builder) {
		// Access AppEnvironment for default values used in database schema configuration
		var env = AppEnvironment.Instance;

		// Database-level lowercase constraints
		builder.ToTable(table => {
			table.HasCheckConstraint("CK_Tenant_Code_Lowercase", "code = LOWER(code)");
			// Keep lifecycle enum values constrained at the database boundary.
			// TenantStatus: Pending = 10, Active = 20, Suspended = 30.
			table.HasCheckConstraint("CK_Tenant_Status", "status IN (10, 20, 30)");
		});
		builder
			.Property(tenant => tenant.MaxUsers)
			.HasDefaultValue(env.DEFAULT_MAX_USERS_PER_TENANT);

		builder
			.HasIndex(tenant => tenant.Code)
			.HasDatabaseName("ix_tenants_code_active")
			.HasFilter("\"is_deleted\" = false");

		// Keyset pagination indexes for staff tenants
		// Supports efficient sorting by Name with Id as tie-breaker
		builder
			.HasIndex(tenant => new { tenant.Name, tenant.Id })
			.HasDatabaseName("ix_tenants_staff_name_id")
			.HasFilter("\"is_deleted\" = false");

		// Supports efficient sorting by CreatedAt with Id as tie-breaker
		builder
			.HasIndex(tenant => new { tenant.CreatedAt, tenant.Id })
			.HasDatabaseName("ix_tenants_staff_created_at_id")
			.HasFilter("\"is_deleted\" = false");

		// Supports efficient sorting by UpdatedAt with Id as tie-breaker
		builder
			.HasIndex(tenant => new { tenant.UpdatedAt, tenant.Id })
			.HasDatabaseName("ix_tenants_staff_updated_at_id")
			.HasFilter("\"is_deleted\" = false");

		// Supports efficient sorting by Status with Id as tie-breaker
		builder
			.HasIndex(tenant => new { tenant.Status, tenant.Id })
			.HasDatabaseName("ix_tenants_staff_status_id")
			.HasFilter("\"is_deleted\" = false");

		// Trigram indexes to accelerate ILIKE-based search on Name/Code
		// Note: we intentionally only index Name (substring match). Code uses prefix match and
		// keeps its unique btree index (avoid multiple EF indexes on the same column set).
		builder
			.HasIndex(tenant => tenant.Name)
			.HasDatabaseName("ix_tenants_name_trgm")
			.HasMethod("gin")
			.HasOperators("gin_trgm_ops")
			.HasFilter("\"is_deleted\" = false");
	}
}
