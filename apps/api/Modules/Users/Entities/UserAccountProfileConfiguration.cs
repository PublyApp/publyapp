using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace PublyApp.Api.Modules.Users.Entities;

public sealed class UserAccountProfileConfiguration : IEntityTypeConfiguration<UserAccountProfile> {
	public void Configure(EntityTypeBuilder<UserAccountProfile> builder) {
		// UserAccountProfile mirrors the same active-state design. User/profile assignment
		// history is tracked via audit logs, while this table stores current membership only.
		builder.HasKey(entity => new { entity.UserAccountId, entity.ProfileId });

		builder
			.HasOne(entity => entity.UserAccount)
			.WithMany(account => account.UserAccountProfiles)
			.HasForeignKey(entity => entity.UserAccountId)
			.OnDelete(DeleteBehavior.Cascade);

		builder
			.HasOne(entity => entity.Profile)
			.WithMany(profile => profile.UserAccountProfiles)
			.HasForeignKey(entity => entity.ProfileId)
			.OnDelete(DeleteBehavior.Cascade);
	}
}
