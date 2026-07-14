using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PublyApp.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddUserAccountMembershipUniqueness : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_user_accounts_user_id_tenant_id",
                table: "user_accounts");

            migrationBuilder.DropIndex(
                name: "IX_user_accounts_user_id_tenant_id_project_id_scope",
                table: "user_accounts");

            migrationBuilder.CreateIndex(
                name: "ux_user_accounts_project_active",
                table: "user_accounts",
                columns: new[] { "user_id", "project_id" },
                unique: true,
                filter: "\"scope\" = 2 AND \"is_deleted\" = false");

            migrationBuilder.CreateIndex(
                name: "ux_user_accounts_staff_active",
                table: "user_accounts",
                column: "user_id",
                unique: true,
                filter: "\"scope\" = 0 AND \"is_deleted\" = false");

            migrationBuilder.CreateIndex(
                name: "ux_user_accounts_tenant_active",
                table: "user_accounts",
                columns: new[] { "user_id", "tenant_id" },
                unique: true,
                filter: "\"scope\" = 1 AND \"project_id\" IS NULL AND \"is_deleted\" = false");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ux_user_accounts_project_active",
                table: "user_accounts");

            migrationBuilder.DropIndex(
                name: "ux_user_accounts_staff_active",
                table: "user_accounts");

            migrationBuilder.DropIndex(
                name: "ux_user_accounts_tenant_active",
                table: "user_accounts");

            migrationBuilder.CreateIndex(
                name: "IX_user_accounts_user_id_tenant_id",
                table: "user_accounts",
                columns: new[] { "user_id", "tenant_id" });

            migrationBuilder.CreateIndex(
                name: "IX_user_accounts_user_id_tenant_id_project_id_scope",
                table: "user_accounts",
                columns: new[] { "user_id", "tenant_id", "project_id", "scope" },
                unique: true);
        }
    }
}
