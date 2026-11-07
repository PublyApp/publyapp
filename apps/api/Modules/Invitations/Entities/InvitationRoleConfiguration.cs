using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace PublyApp.Api.Modules.Invitations.Entities;

public sealed class InvitationRoleConfiguration : IEntityTypeConfiguration<InvitationRole> {
	public void Configure(EntityTypeBuilder<InvitationRole> builder) {
		// Configure InvitationRole junction table
		builder.HasKey(entity => new { entity.InvitationId, entity.RoleId });

		builder
			.HasOne(entity => entity.Invitation)
			.WithMany(invitation => invitation.InvitationRoles)
			.HasForeignKey(entity => entity.InvitationId)
			.OnDelete(DeleteBehavior.Cascade);

		builder
			.HasOne(entity => entity.Role)
			.WithMany()
			.HasForeignKey(entity => entity.RoleId)
			.OnDelete(DeleteBehavior.Restrict);
	}
}
