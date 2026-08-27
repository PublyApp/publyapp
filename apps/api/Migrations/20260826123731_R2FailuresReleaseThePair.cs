using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PublyApp.Api.Migrations
{
    /// <inheritdoc />
    public partial class R2FailuresReleaseThePair : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ux_publications_post_account",
                table: "publications");

            migrationBuilder.CreateIndex(
                name: "ux_publications_post_account",
                table: "publications",
                columns: new[] { "post_id", "social_account_id" },
                unique: true,
                filter: "is_deleted = false AND status <> 40");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ux_publications_post_account",
                table: "publications");

            migrationBuilder.CreateIndex(
                name: "ux_publications_post_account",
                table: "publications",
                columns: new[] { "post_id", "social_account_id" },
                unique: true,
                filter: "is_deleted = false");
        }
    }
}
