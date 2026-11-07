using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace PublyApp.Api.Modules.Roles.Entities;

public sealed class RoleConfiguration : IEntityTypeConfiguration<Role> {
	public void Configure(EntityTypeBuilder<Role> builder) {
		// Database-level role type constraints
		builder.ToTable(table => table.HasCheckConstraint(
			"CK_Role_Staff_Constraints",
			"(scope = 0 AND tenant_id IS NULL AND project_id IS NULL) OR scope != 0"
		));
		builder.ToTable(table => table.HasCheckConstraint(
			"CK_Role_Tenant_Constraints",
			"(scope = 1 AND tenant_id IS NOT NULL AND project_id IS NULL) OR scope != 1"
		));
		builder.ToTable(table => table.HasCheckConstraint(
			"CK_Role_Project_Constraints",
			"(scope = 2 AND tenant_id IS NOT NULL AND project_id IS NOT NULL) OR scope != 2"
		));

		// Keyset pagination indexes for staff roles
		// Supports efficient sorting by Name with Id as tie-breaker
		builder
			.HasIndex(role => new { role.Scope, role.Name, role.Id })
			.HasDatabaseName("ix_roles_staff_name_id")
			.HasFilter("\"scope\" = 0");

		// Supports efficient sorting by CreatedAt with Id as tie-breaker
		builder
			.HasIndex(role => new { role.Scope, role.CreatedAt, role.Id })
			.HasDatabaseName("ix_roles_staff_created_at_id")
			.HasFilter("\"scope\" = 0");

		builder
			.HasIndex(role => new { role.TenantId, role.Name })
			.IsUnique()
			.HasDatabaseName("ux_roles_tenant_name")
			// Tenant role names must be unique per tenant across active rows only.
			.HasFilter("\"scope\" = 1 AND \"is_deleted\" = false");

		builder
			.HasIndex(role => new { role.TenantId, role.Scope, role.IsDefault })
			.IsUnique()
			.HasDatabaseName("ux_roles_tenant_default_role")
			// At most one active default tenant role can exist per tenant.
			// Soft-deleted defaults are excluded so a replacement default can be created safely.
			.HasFilter(
				"\"scope\" = 1 AND \"project_id\" IS NULL "
				+ "AND \"is_default\" = true AND \"is_deleted\" = false"
			);
	}
}
