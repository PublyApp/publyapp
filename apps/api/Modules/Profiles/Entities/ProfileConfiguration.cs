using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

using PublyApp.Api.Data.DbContext;

namespace PublyApp.Api.Modules.Profiles.Entities;

public sealed class ProfileConfiguration : IEntityTypeConfiguration<Profile> {
	public void Configure(EntityTypeBuilder<Profile> builder) {
		EntityConfigurationMarker.Mark(builder);

		// Database-level profile type constraints
		builder.ToTable(table => table.HasCheckConstraint(
			"CK_Profile_Staff_Constraints",
			"(scope = 0 AND tenant_id IS NULL AND project_id IS NULL) OR scope != 0"
		));
		builder.ToTable(table => table.HasCheckConstraint(
			"CK_Profile_Tenant_Constraints",
			"(scope = 1 AND tenant_id IS NOT NULL AND project_id IS NULL) OR scope != 1"
		));
		builder.ToTable(table => table.HasCheckConstraint(
			"CK_Profile_Project_Constraints",
			"(scope = 2 AND tenant_id IS NOT NULL AND project_id IS NOT NULL) OR scope != 2"
		));

		// Keyset pagination indexes for staff profiles
		// Supports efficient sorting by Name with Id as tie-breaker
		builder
			.HasIndex(profile => new { profile.Scope, profile.Name, profile.Id })
			.HasDatabaseName("ix_profiles_staff_name_id")
			.HasFilter("\"scope\" = 0");

		// Supports efficient sorting by CreatedAt with Id as tie-breaker
		builder
			.HasIndex(profile => new { profile.Scope, profile.CreatedAt, profile.Id })
			.HasDatabaseName("ix_profiles_staff_created_at_id")
			.HasFilter("\"scope\" = 0");

		builder
			.HasIndex(profile => new { profile.TenantId, profile.Name })
			.IsUnique()
			.HasDatabaseName("ux_profiles_tenant_name")
			// Tenant profile names must be unique per tenant across active rows only.
			.HasFilter("\"scope\" = 1 AND \"is_deleted\" = false");

		builder
			.HasIndex(profile => new { profile.TenantId, profile.Scope, profile.IsDefault })
			.IsUnique()
			.HasDatabaseName("ux_profiles_tenant_default_profile")
			// At most one active default tenant profile can exist per tenant.
			// Soft-deleted defaults are excluded so a replacement default can be created safely.
			.HasFilter(
				"\"scope\" = 1 AND \"project_id\" IS NULL "
				+ "AND \"is_default\" = true AND \"is_deleted\" = false"
			);
	}
}
