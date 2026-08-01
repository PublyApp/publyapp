using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace PublyApp.Api.Modules.Profiles.Entities;

public sealed class ProfilePermissionConfiguration : IEntityTypeConfiguration<ProfilePermission> {
	public void Configure(EntityTypeBuilder<ProfilePermission> builder) {
		// ProfilePermission is an active-state junction table. The composite key prevents
		// duplicate grants without carrying a surrogate id or soft-delete state.
		builder.HasKey(entity => new { entity.ProfileId, entity.PermissionKey });

		// Cascade from Profile/Permission is appropriate because the junction row has no
		// independent lifecycle once either side of the relationship disappears.
		builder
			.HasOne(entity => entity.Profile)
			.WithMany(profile => profile.ProfilePermissions)
			.HasForeignKey(entity => entity.ProfileId)
			.OnDelete(DeleteBehavior.Cascade);

		builder
			.HasOne(entity => entity.Permission)
			.WithMany(permission => permission.ProfilePermissions)
			.HasForeignKey(entity => entity.PermissionKey)
			.OnDelete(DeleteBehavior.Cascade);
	}
}
