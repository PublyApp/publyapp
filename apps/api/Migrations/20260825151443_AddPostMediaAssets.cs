using System;

using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PublyApp.Api.Migrations {
	/// <inheritdoc />
	public partial class AddPostMediaAssets : Migration {
		/// <inheritdoc />
		protected override void Up(MigrationBuilder migrationBuilder) {
			migrationBuilder.CreateTable(
					name: "post_media_assets",
					columns: table => new {
						id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "uuidv7()"),
						tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
						post_id = table.Column<Guid>(type: "uuid", nullable: false),
						relative_path = table.Column<string>(type: "text", nullable: false),
						content_type = table.Column<string>(type: "text", nullable: false),
						alt_text = table.Column<string>(type: "text", nullable: true),
						width_px = table.Column<int>(type: "integer", nullable: false),
						height_px = table.Column<int>(type: "integer", nullable: false),
						size_bytes = table.Column<long>(type: "bigint", nullable: false),
						uploaded_by_user_id = table.Column<Guid>(type: "uuid", nullable: false),
						created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
						updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
						is_deleted = table.Column<bool>(type: "boolean", nullable: false),
						deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
					},
					constraints: table => {
						table.PrimaryKey("PK_post_media_assets", x => x.id);
						table.ForeignKey(
											name: "FK_post_media_assets_posts_post_id",
											column: x => x.post_id,
											principalTable: "posts",
											principalColumn: "id",
											onDelete: ReferentialAction.Cascade);
						table.ForeignKey(
											name: "FK_post_media_assets_tenants_tenant_id",
											column: x => x.tenant_id,
											principalTable: "tenants",
											principalColumn: "id",
											onDelete: ReferentialAction.Cascade);
					});

			migrationBuilder.CreateIndex(
					name: "ix_post_media_assets_tenant_post",
					table: "post_media_assets",
					columns: new[] { "tenant_id", "post_id" });

			migrationBuilder.CreateIndex(
					name: "ux_post_media_assets_live_post_id",
					table: "post_media_assets",
					column: "post_id",
					unique: true,
					filter: "is_deleted = false");
		}

		/// <inheritdoc />
		protected override void Down(MigrationBuilder migrationBuilder) {
			migrationBuilder.DropTable(
					name: "post_media_assets");
		}
	}
}
