using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace PublyApp.Api.Modules.SocialAccounts.Entities;

public sealed class SocialAccountConfiguration : IEntityTypeConfiguration<SocialAccount> {
	public void Configure(EntityTypeBuilder<SocialAccount> builder) {
		// One external platform account may be linked at most once per tenant, and only
		// among active rows (soft-deleted rows free the handle for re-linking).
		builder
			.HasIndex(socialAccount => new { socialAccount.TenantId, socialAccount.Provider, socialAccount.ExternalAccountId })
			.IsUnique()
			.HasDatabaseName("ux_social_accounts_tenant_provider_external_account")
			.HasFilter("\"is_deleted\" = false");

		// List pages filter by tenant + provider first; keep that prefix seekable.
		builder
			.HasIndex(socialAccount => new { socialAccount.TenantId, socialAccount.Provider, socialAccount.Status })
			.HasDatabaseName("ix_social_accounts_tenant_provider_status");

		// Only persisted lifecycle states are valid values for status.
		builder.ToTable(table => table.HasCheckConstraint(
			"CK_SocialAccount_Status",
			"status IN (0, 1, 2)"
		));

		// Only known providers are persistable; new providers extend this list in code.
		builder.ToTable(table => table.HasCheckConstraint(
			"CK_SocialAccount_Provider",
			"provider >= 0"
		));
	}
}
