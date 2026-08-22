using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace PublyApp.Api.Modules.SocialAccounts.Entities;

public sealed class SocialAccountProjectConfiguration : IEntityTypeConfiguration<SocialAccountProject> {
	public void Configure(EntityTypeBuilder<SocialAccountProject> builder) {
		builder.HasKey(link => new { link.SocialAccountId, link.ProjectId });

		builder
			.HasOne(link => link.SocialAccount)
			.WithMany()
			.HasForeignKey(link => link.SocialAccountId)
			.OnDelete(DeleteBehavior.Cascade);

		builder
			.HasOne(link => link.Project)
			.WithMany()
			.HasForeignKey(link => link.ProjectId)
			.OnDelete(DeleteBehavior.Cascade);
	}
}
