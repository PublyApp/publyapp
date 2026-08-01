using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace PublyApp.Api.Modules.Invitations.Entities;

public sealed class InvitationProfileConfiguration : IEntityTypeConfiguration<InvitationProfile> {
	public void Configure(EntityTypeBuilder<InvitationProfile> builder) {
		// Configure InvitationProfile junction table
		builder.HasKey(entity => new { entity.InvitationId, entity.ProfileId });

		builder
			.HasOne(entity => entity.Invitation)
			.WithMany(invitation => invitation.InvitationProfiles)
			.HasForeignKey(entity => entity.InvitationId)
			.OnDelete(DeleteBehavior.Cascade);

		builder
			.HasOne(entity => entity.Profile)
			.WithMany()
			.HasForeignKey(entity => entity.ProfileId)
			.OnDelete(DeleteBehavior.Restrict);
	}
}
