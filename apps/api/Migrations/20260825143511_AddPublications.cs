using System;

using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PublyApp.Api.Migrations {
	/// <inheritdoc />
	public partial class AddPublications : Migration {
		/// <inheritdoc />
		protected override void Up(MigrationBuilder migrationBuilder) {
			migrationBuilder.CreateTable(
					name: "publications",
					columns: table => new {
						id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "uuidv7()"),
						tenant_id = table.Column<Guid>(type: "uuid", nullable: false),
						post_id = table.Column<Guid>(type: "uuid", nullable: false),
						social_account_id = table.Column<Guid>(type: "uuid", nullable: false),
						status = table.Column<int>(type: "integer", nullable: false),
						scheduled_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
						scheduled_time_zone = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
						external_record_id = table.Column<string>(type: "text", nullable: true),
						external_url = table.Column<string>(type: "text", nullable: true),
						last_error = table.Column<string>(type: "text", nullable: true),
						attempts = table.Column<int>(type: "integer", nullable: false),
						idempotency_key = table.Column<string>(type: "text", nullable: false),
						created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
						updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
						is_deleted = table.Column<bool>(type: "boolean", nullable: false),
						deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
					},
					constraints: table => {
						table.PrimaryKey("PK_publications", x => x.id);
						table.CheckConstraint("CK_Publication_Status", "status IN (10, 20, 30, 40, 50)");
						table.ForeignKey(
											name: "FK_publications_posts_post_id",
											column: x => x.post_id,
											principalTable: "posts",
											principalColumn: "id",
											onDelete: ReferentialAction.Cascade);
						table.ForeignKey(
											name: "FK_publications_social_accounts_social_account_id",
											column: x => x.social_account_id,
											principalTable: "social_accounts",
											principalColumn: "id",
											onDelete: ReferentialAction.Restrict);
						table.ForeignKey(
											name: "FK_publications_tenants_tenant_id",
											column: x => x.tenant_id,
											principalTable: "tenants",
											principalColumn: "id",
											onDelete: ReferentialAction.Cascade);
					});

			migrationBuilder.CreateIndex(
					name: "IX_publications_social_account_id",
					table: "publications",
					column: "social_account_id");

			migrationBuilder.CreateIndex(
					name: "ix_publications_status_scheduled_at",
					table: "publications",
					columns: new[] { "status", "scheduled_at_utc" });

			migrationBuilder.CreateIndex(
					name: "ix_publications_tenant_scheduled_at_id",
					table: "publications",
					columns: new[] { "tenant_id", "scheduled_at_utc", "id" });

			migrationBuilder.CreateIndex(
					name: "ux_publications_post_account",
					table: "publications",
					columns: new[] { "post_id", "social_account_id" },
					unique: true,
					filter: "is_deleted = false");
		}

		/// <inheritdoc />
		protected override void Down(MigrationBuilder migrationBuilder) {
			migrationBuilder.DropTable(
					name: "publications");
		}
	}
}
