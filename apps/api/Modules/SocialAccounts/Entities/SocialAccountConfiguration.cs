using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace PublyApp.Api.Modules.SocialAccounts.Entities;

public sealed class SocialAccountConfiguration : IEntityTypeConfiguration<SocialAccount> {
	public void Configure(EntityTypeBuilder<SocialAccount> builder) {
		builder.ToTable(table => {
			table.HasCheckConstraint("CK_SocialAccount_Status", "status IN (10, 20, 30)");
			table.HasCheckConstraint(
				"CK_SocialAccount_DefaultVisibility",
				"default_visibility IN (0, 1, 2)"
			);
		});

		builder
			.Property(account => account.DefaultVisibility)
			.HasDefaultValue(SocialPostVisibility.Public)
			.HasSentinel(SocialPostVisibility.Public);

		builder
			.HasIndex(account => new { account.TenantId, account.Provider, account.ExternalAccountId })
			.IsUnique()
			.HasFilter("is_deleted = false")
			.HasDatabaseName("ix_social_accounts_tenant_provider_external");

		builder
			.HasOne(account => account.Tenant)
			.WithMany()
			.HasForeignKey(account => account.TenantId)
			.OnDelete(DeleteBehavior.Cascade);
	}
}
