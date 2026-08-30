using System;

using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PublyApp.Api.Migrations {
	/// <inheritdoc />
	public partial class AddSystemJobDefinitions : Migration {
		/// <inheritdoc />
		protected override void Up(MigrationBuilder migrationBuilder) {
			migrationBuilder.CreateTable(
					name: "system_job_definitions",
					columns: table => new {
						id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "uuidv7()"),
						job_key = table.Column<string>(type: "text", nullable: false),
						cron_expression = table.Column<string>(type: "text", nullable: false),
						is_enabled = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
						description = table.Column<string>(type: "text", nullable: true),
						last_enqueued_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
						created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
						updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
						is_deleted = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
						deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
					},
					constraints: table => {
						table.PrimaryKey("pk_system_job_definitions", x => x.id);
					});

			migrationBuilder.CreateIndex(
					name: "ux_system_job_definitions_job_key",
					table: "system_job_definitions",
					column: "job_key",
					unique: true,
					filter: "is_deleted = false");
		}

		/// <inheritdoc />
		protected override void Down(MigrationBuilder migrationBuilder) {
			migrationBuilder.DropTable(
					name: "system_job_definitions");
		}
	}
}
