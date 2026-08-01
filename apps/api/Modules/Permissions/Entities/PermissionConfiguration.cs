using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

using PublyApp.Api.Data.DbContext;

namespace PublyApp.Api.Modules.Permissions.Entities;

public sealed class PermissionConfiguration : IEntityTypeConfiguration<Permission> {
	public void Configure(EntityTypeBuilder<Permission> builder) {
		EntityConfigurationMarker.Mark(builder);

		// Database-level permission key prefix constraints
		builder.ToTable(table => table.HasCheckConstraint(
			"CK_Permission_Staff_Key_Prefix",
			"(scope = 0 AND key LIKE 'staff.%') OR scope != 0"
		));
		builder.ToTable(table => table.HasCheckConstraint(
			"CK_Permission_Tenant_Key_Prefix",
			"(scope = 1 AND key LIKE 'tenant.%') OR scope != 1"
		));
		builder.ToTable(table => table.HasCheckConstraint(
			"CK_Permission_Project_Key_Prefix",
			"(scope = 2 AND key LIKE 'project.%') OR scope != 2"
		));

		// Translations is runtime-only, explicitly exclude from mapping
		builder.Ignore(permission => permission.Translations);
	}
}
