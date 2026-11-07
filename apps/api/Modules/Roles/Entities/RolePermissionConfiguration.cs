using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace PublyApp.Api.Modules.Roles.Entities;

public sealed class RolePermissionConfiguration : IEntityTypeConfiguration<RolePermission> {
	public void Configure(EntityTypeBuilder<RolePermission> builder) {
		// RolePermission is an active-state junction table. The composite key prevents
		// duplicate grants without carrying a surrogate id or soft-delete state.
		builder.HasKey(entity => new { entity.RoleId, entity.PermissionKey });

		// Cascade from Role/Permission is appropriate because the junction row has no
		// independent lifecycle once either side of the relationship disappears.
		builder
			.HasOne(entity => entity.Role)
			.WithMany(role => role.RolePermissions)
			.HasForeignKey(entity => entity.RoleId)
			.OnDelete(DeleteBehavior.Cascade);

		builder
			.HasOne(entity => entity.Permission)
			.WithMany(permission => permission.RolePermissions)
			.HasForeignKey(entity => entity.PermissionKey)
			.OnDelete(DeleteBehavior.Cascade);
	}
}
