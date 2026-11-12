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

        // FORWARD-ONLY once a post has 2 or more images (#2179): Down recreates the
        // one-live-image-per-post unique index (ux_post_media_assets_live_post_id), which
        // fails as soon as any post holds several live images. Down is only safe while no
        // post has more than one; otherwise fix forward (see the rollback note in
        // docs/deployment/production-deployment-design.md).
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
