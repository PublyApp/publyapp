using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PublyApp.Api.Migrations {
	/// <inheritdoc />
	public partial class SocialAccountPartialUniqueIndex : Migration {
		/// <inheritdoc />
		protected override void Up(MigrationBuilder migrationBuilder) {
			migrationBuilder.DropIndex(
					name: "ix_social_accounts_tenant_provider_external",
					table: "social_accounts");

			migrationBuilder.CreateIndex(
					name: "ix_social_accounts_tenant_provider_external",
					table: "social_accounts",
					columns: new[] { "tenant_id", "provider", "external_account_id" },
					unique: true,
					filter: "is_deleted = false");
		}

		/// <inheritdoc />
		protected override void Down(MigrationBuilder migrationBuilder) {
			migrationBuilder.DropIndex(
					name: "ix_social_accounts_tenant_provider_external",
					table: "social_accounts");

			migrationBuilder.CreateIndex(
					name: "ix_social_accounts_tenant_provider_external",
					table: "social_accounts",
					columns: new[] { "tenant_id", "provider", "external_account_id" },
					unique: true);
		}
	}
}
