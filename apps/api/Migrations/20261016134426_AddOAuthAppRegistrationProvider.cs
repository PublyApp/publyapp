using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PublyApp.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddOAuthAppRegistrationProvider : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ux_oauth_app_registrations_live_host",
                table: "oauth_app_registrations");

            migrationBuilder.AddColumn<int>(
                name: "provider",
                table: "oauth_app_registrations",
                type: "integer",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.CreateIndex(
                name: "ux_oauth_app_registrations_live_host",
                table: "oauth_app_registrations",
                columns: new[] { "host", "provider" },
                unique: true,
                filter: "is_deleted = false");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ux_oauth_app_registrations_live_host",
                table: "oauth_app_registrations");

            migrationBuilder.DropColumn(
                name: "provider",
                table: "oauth_app_registrations");

            migrationBuilder.CreateIndex(
                name: "ux_oauth_app_registrations_live_host",
                table: "oauth_app_registrations",
                column: "host",
                unique: true,
                filter: "is_deleted = false");
        }
    }
}
