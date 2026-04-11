using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MainApi.Migrations
{
    /// <inheritdoc />
    public partial class ProfilePermissionUniqueIndex : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_profile_permissions_profile_id_permission_key",
                table: "profile_permissions");

            migrationBuilder.CreateIndex(
                name: "IX_profile_permissions_profile_id_permission_key",
                table: "profile_permissions",
                columns: new[] { "profile_id", "permission_key" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_profile_permissions_profile_id_permission_key",
                table: "profile_permissions");

            migrationBuilder.CreateIndex(
                name: "IX_profile_permissions_profile_id_permission_key",
                table: "profile_permissions",
                columns: new[] { "profile_id", "permission_key" });
        }
    }
}
