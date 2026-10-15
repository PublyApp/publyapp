using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PublyApp.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddPostMediaAssetPosition : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ux_post_media_assets_live_post_id",
                table: "post_media_assets");

            migrationBuilder.AddColumn<int>(
                name: "position",
                table: "post_media_assets",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateIndex(
                name: "ux_post_media_assets_live_post_position",
                table: "post_media_assets",
                columns: new[] { "post_id", "position" },
                unique: true,
                filter: "is_deleted = false");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ux_post_media_assets_live_post_position",
                table: "post_media_assets");

            migrationBuilder.DropColumn(
                name: "position",
                table: "post_media_assets");

            migrationBuilder.CreateIndex(
                name: "ux_post_media_assets_live_post_id",
                table: "post_media_assets",
                column: "post_id",
                unique: true,
                filter: "is_deleted = false");
        }
    }
}
