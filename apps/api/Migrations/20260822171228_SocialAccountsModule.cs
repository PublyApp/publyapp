using System;

using Microsoft.EntityFrameworkCore.Migrations;

using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace PublyApp.Api.Migrations {
	/// <inheritdoc />
	public partial class SocialAccountsModule : Migration {
		/// <inheritdoc />
		protected override void Up(MigrationBuilder migrationBuilder) {
			migrationBuilder.CreateTable(
					name: "data_protection_keys",
					columns: table => new {
						Id = table.Column<int>(type: "integer", nullable: false)
									.Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
						FriendlyName = table.Column<string>(type: "text", nullable: true),
						Xml = table.Column<string>(type: "text", nullable: true)
					},
					constraints: table => {
						table.PrimaryKey("PK_data_protection_keys", x => x.Id);
					});

			migrationBuilder.CreateTable(
					name: "social_accounts",
					columns: table => new {
						id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "uuidv7()"),
						tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
						provider = table.Column<int>(type: "integer", nullable: false),
						external_account_id = table.Column<string>(type: "text", nullable: false),
						display_handle = table.Column<string>(type: "text", nullable: false),
						credential_type = table.Column<int>(type: "integer", nullable: false),
						protected_credentials = table.Column<string>(type: "text", nullable: false),
						status = table.Column<int>(type: "integer", nullable: false),
						last_success_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
						last_error = table.Column<string>(type: "text", nullable: true),
						created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
						updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
						is_deleted = table.Column<bool>(type: "boolean", nullable: false),
						deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
					},
					constraints: table => {
						table.PrimaryKey("PK_social_accounts", x => x.id);
						table.CheckConstraint("CK_SocialAccount_Status", "status IN (10, 20, 30)");
						table.ForeignKey(
											name: "FK_social_accounts_tenants_tenant_id",
											column: x => x.tenant_id,
											principalTable: "tenants",
											principalColumn: "id",
											onDelete: ReferentialAction.Cascade);
					});

			migrationBuilder.CreateTable(
					name: "social_account_projects",
					columns: table => new {
						social_account_id = table.Column<Guid>(type: "uuid", nullable: false),
						project_id = table.Column<Guid>(type: "uuid", nullable: false),
						created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
						updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
					},
					constraints: table => {
						table.PrimaryKey("PK_social_account_projects", x => new { x.social_account_id, x.project_id });
						table.ForeignKey(
											name: "FK_social_account_projects_projects_project_id",
											column: x => x.project_id,
											principalTable: "projects",
											principalColumn: "id",
											onDelete: ReferentialAction.Cascade);
						table.ForeignKey(
											name: "FK_social_account_projects_social_accounts_social_account_id",
											column: x => x.social_account_id,
											principalTable: "social_accounts",
											principalColumn: "id",
											onDelete: ReferentialAction.Cascade);
					});

			migrationBuilder.CreateIndex(
					name: "IX_social_account_projects_project_id",
					table: "social_account_projects",
					column: "project_id");

			migrationBuilder.CreateIndex(
					name: "ix_social_accounts_tenant_provider_external",
					table: "social_accounts",
					columns: new[] { "tenant_id", "provider", "external_account_id" },
					unique: true);
		}

		/// <inheritdoc />
		protected override void Down(MigrationBuilder migrationBuilder) {
			migrationBuilder.DropTable(
					name: "data_protection_keys");

			migrationBuilder.DropTable(
					name: "social_account_projects");

			migrationBuilder.DropTable(
					name: "social_accounts");
		}
	}
}
