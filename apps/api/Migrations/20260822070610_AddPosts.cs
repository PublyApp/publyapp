using System;

using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PublyApp.Api.Migrations {
	/// <inheritdoc />
	public partial class AddPosts : Migration {
		/// <inheritdoc />
		protected override void Up(MigrationBuilder migrationBuilder) {
			migrationBuilder.CreateTable(
					name: "posts",
					columns: table => new {
						id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "uuidv7()"),
						tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
						project_id = table.Column<Guid>(type: "uuid", nullable: true),
						body = table.Column<string>(type: "text", nullable: false),
						status = table.Column<int>(type: "integer", nullable: false),
						created_by_user_id = table.Column<Guid>(type: "uuid", nullable: false),
						created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
						updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
						is_deleted = table.Column<bool>(type: "boolean", nullable: false),
						deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
					},
					constraints: table => {
						table.PrimaryKey("PK_posts", x => x.id);
						table.ForeignKey(
											name: "FK_posts_projects_project_id",
											column: x => x.project_id,
											principalTable: "projects",
											principalColumn: "id",
											onDelete: ReferentialAction.SetNull);
						table.ForeignKey(
											name: "FK_posts_tenants_tenant_id",
											column: x => x.tenant_id,
											principalTable: "tenants",
											principalColumn: "id",
											onDelete: ReferentialAction.Cascade);
						table.ForeignKey(
											name: "FK_posts_users_created_by_user_id",
											column: x => x.created_by_user_id,
											principalTable: "users",
											principalColumn: "id",
											onDelete: ReferentialAction.Restrict);
					});

			migrationBuilder.CreateIndex(
					name: "IX_posts_created_by_user_id",
					table: "posts",
					column: "created_by_user_id");

			migrationBuilder.CreateIndex(
					name: "IX_posts_project_id",
					table: "posts",
					column: "project_id");

			migrationBuilder.CreateIndex(
					name: "ix_posts_tenant_created_at_id",
					table: "posts",
					columns: new[] { "tenant_id", "created_at", "id" });

			migrationBuilder.CreateIndex(
					name: "ix_posts_tenant_project_id",
					table: "posts",
					columns: new[] { "tenant_id", "project_id" });

			migrationBuilder.AddCheckConstraint(
					name: "CK_Post_Status",
					table: "posts",
					sql: "status IN (10, 20, 30)");
		}

		/// <inheritdoc />
		protected override void Down(MigrationBuilder migrationBuilder) {
			migrationBuilder.DropTable(
					name: "posts");
		}
	}
}
