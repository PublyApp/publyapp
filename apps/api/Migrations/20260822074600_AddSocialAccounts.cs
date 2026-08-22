using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PublyApp.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddSocialAccounts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "social_accounts",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "uuidv7()"),
                    tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
                    provider = table.Column<int>(type: "integer", nullable: false),
                    external_account_id = table.Column<string>(type: "text", nullable: false),
                    display_handle = table.Column<string>(type: "text", nullable: true),
                    protected_credentials = table.Column<string>(type: "text", nullable: false),
                    status = table.Column<int>(type: "integer", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_social_accounts", x => x.id);
                    table.CheckConstraint("CK_SocialAccount_Provider", "provider >= 0");
                    table.CheckConstraint("CK_SocialAccount_Status", "status IN (0, 1, 2)");
                    table.ForeignKey(
                        name: "FK_social_accounts_tenants_tenant_id",
                        column: x => x.tenant_id,
                        principalTable: "tenants",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_social_accounts_tenant_provider_status",
                table: "social_accounts",
                columns: new[] { "tenant_id", "provider", "status" });

            migrationBuilder.CreateIndex(
                name: "ux_social_accounts_tenant_provider_external_account",
                table: "social_accounts",
                columns: new[] { "tenant_id", "provider", "external_account_id" },
                unique: true,
                filter: "\"is_deleted\" = false");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "social_accounts");
        }
    }
}
