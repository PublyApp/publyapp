using System;

using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PublyApp.Api.Migrations {
	/// <inheritdoc />
	public partial class AddUploadAssetsAndBudgets : Migration {
		/// <inheritdoc />
		protected override void Up(MigrationBuilder migrationBuilder) {
			migrationBuilder.CreateTable(
					name: "upload_assets",
					columns: table => new {
						id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "uuidv7()"),
						relative_path = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: false),
						size_bytes = table.Column<long>(type: "bigint", nullable: false),
						content_type = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
						purpose = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
						created_by_user_id = table.Column<Guid>(type: "uuid", nullable: false),
						state = table.Column<int>(type: "integer", nullable: false),
						reference_count = table.Column<int>(type: "integer", nullable: false),
						delete_not_before = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
						created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
						updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
						is_deleted = table.Column<bool>(type: "boolean", nullable: false),
						deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
					},
					constraints: table => {
						table.PrimaryKey("PK_upload_assets", x => x.id);
						table.CheckConstraint("CK_UploadAssets_ReferenceCount", "reference_count >= 0");
						table.CheckConstraint("CK_UploadAssets_SizeBytes", "size_bytes > 0");
						table.CheckConstraint("CK_UploadAssets_State", "state IN (10, 20, 30, 40, 50)");
						table.ForeignKey(
											name: "FK_upload_assets_users_created_by_user_id",
											column: x => x.created_by_user_id,
											principalTable: "users",
											principalColumn: "id",
											onDelete: ReferentialAction.Restrict);
					});

			migrationBuilder.CreateTable(
					name: "upload_budgets",
					columns: table => new {
						id = table.Column<Guid>(type: "uuid", nullable: false),
						scope_kind = table.Column<int>(type: "integer", nullable: false),
						scope_key = table.Column<string>(type: "text", nullable: true),
						max_bytes = table.Column<long>(type: "bigint", nullable: false),
						reserved_bytes = table.Column<long>(type: "bigint", nullable: false),
						committed_bytes = table.Column<long>(type: "bigint", nullable: false)
					},
					constraints: table => {
						table.PrimaryKey("PK_upload_budgets", x => x.id);
						table.CheckConstraint("CK_UploadBudgets_Accounting", "reserved_bytes >= 0 AND committed_bytes >= 0");
						table.CheckConstraint("CK_UploadBudgets_MaxBytes", "max_bytes > 0");
						table.CheckConstraint("CK_UploadBudgets_ScopeKind", "scope_kind IN (10, 20)");
					});

			migrationBuilder.CreateIndex(
					name: "ix_upload_assets_creator_state",
					table: "upload_assets",
					columns: new[] { "created_by_user_id", "state" },
					filter: "is_deleted = false");

			migrationBuilder.CreateIndex(
					name: "ix_upload_assets_state_delete_not_before",
					table: "upload_assets",
					columns: new[] { "state", "delete_not_before" });

			migrationBuilder.CreateIndex(
					name: "ux_upload_assets_relative_path_live",
					table: "upload_assets",
					column: "relative_path",
					unique: true,
					filter: "is_deleted = false");

			migrationBuilder.CreateIndex(
					name: "ux_upload_budgets_scope",
					table: "upload_budgets",
					columns: new[] { "scope_kind", "scope_key" },
					unique: true);

			migrationBuilder.CreateIndex(
					name: "ux_upload_budgets_single_global",
					table: "upload_budgets",
					column: "scope_key",
					unique: true,
					filter: "scope_kind = 10");
		}

		/// <inheritdoc />
		protected override void Down(MigrationBuilder migrationBuilder) {
			migrationBuilder.DropTable(
					name: "upload_assets");

			migrationBuilder.DropTable(
					name: "upload_budgets");
		}
	}
}
