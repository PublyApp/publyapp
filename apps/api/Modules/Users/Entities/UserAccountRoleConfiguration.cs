using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace PublyApp.Api.Modules.Users.Entities;

public sealed class UserAccountRoleConfiguration : IEntityTypeConfiguration<UserAccountRole> {
	public void Configure(EntityTypeBuilder<UserAccountRole> builder) {
		// UserAccountRole mirrors the same active-state design. User/role assignment
		// history is tracked via audit logs, while this table stores current membership only.
		builder.HasKey(entity => new { entity.UserAccountId, entity.RoleId });

		builder
			.HasOne(entity => entity.UserAccount)
			.WithMany(account => account.UserAccountRoles)
			.HasForeignKey(entity => entity.UserAccountId)
			.OnDelete(DeleteBehavior.Cascade);

		builder
			.HasOne(entity => entity.Role)
			.WithMany(role => role.UserAccountRoles)
			.HasForeignKey(entity => entity.RoleId)
			.OnDelete(DeleteBehavior.Cascade);
	}
}
