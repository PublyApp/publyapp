using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace PublyApp.Api.Modules.Users.Entities;

public sealed class UserConfiguration : IEntityTypeConfiguration<User> {
	public void Configure(EntityTypeBuilder<User> builder) {
		builder.ToTable(table => {
			table.HasCheckConstraint("CK_User_Email_Lowercase", "email = LOWER(email)");
			// User onboarding is invitation-first; persisted identity states are active or suspended.
			table.HasCheckConstraint("CK_User_Status", "status IN (30, 40)");
		});

		builder
			.HasIndex(user => user.Email)
			.HasDatabaseName("ix_users_email_active")
			.HasFilter("\"is_deleted\" = false");
	}
}
