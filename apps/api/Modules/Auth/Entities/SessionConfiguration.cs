using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace PublyApp.Api.Modules.Auth.Entities;

public sealed class SessionConfiguration : IEntityTypeConfiguration<Session> {
	public void Configure(EntityTypeBuilder<Session> builder) {
		// Explicit relationships for Session -> User (two FKs to same principal)
		builder
			.Property(session => session.Id)
			.HasDefaultValueSql("uuidv7()");

		builder
			.HasOne(session => session.User)
			.WithMany(user => user.Sessions)
			.HasForeignKey(session => session.UserId)
			.IsRequired();

		builder
			.HasOne(session => session.ImpersonatingStaffUser)
			.WithMany()
			.HasForeignKey(session => session.ImpersonatingStaffUserId)
			.OnDelete(DeleteBehavior.Restrict);
	}
}
