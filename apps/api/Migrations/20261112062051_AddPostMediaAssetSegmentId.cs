using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PublyApp.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddPostMediaAssetSegmentId : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ux_post_media_assets_live_post_position",
                table: "post_media_assets");

            migrationBuilder.AddColumn<Guid>(
                name: "segment_id",
                table: "post_media_assets",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "ux_post_media_assets_live_post_position",
                table: "post_media_assets",
                columns: new[] { "post_id", "position" },
                unique: true,
                filter: "is_deleted = false AND segment_id IS NULL");

            migrationBuilder.CreateIndex(
                name: "ux_post_media_assets_live_segment_position",
                table: "post_media_assets",
                columns: new[] { "segment_id", "position" },
                unique: true,
                filter: "is_deleted = false AND segment_id IS NOT NULL");

            migrationBuilder.AddForeignKey(
                name: "FK_post_media_assets_post_segments_segment_id",
                table: "post_media_assets",
                column: "segment_id",
                principalTable: "post_segments",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_post_media_assets_post_segments_segment_id",
                table: "post_media_assets");

            migrationBuilder.DropIndex(
                name: "ux_post_media_assets_live_post_position",
                table: "post_media_assets");

            migrationBuilder.DropIndex(
                name: "ux_post_media_assets_live_segment_position",
                table: "post_media_assets");

            migrationBuilder.DropColumn(
                name: "segment_id",
                table: "post_media_assets");

            migrationBuilder.CreateIndex(
                name: "ux_post_media_assets_live_post_position",
                table: "post_media_assets",
                columns: new[] { "post_id", "position" },
                unique: true,
                filter: "is_deleted = false");
        }
    }
}
