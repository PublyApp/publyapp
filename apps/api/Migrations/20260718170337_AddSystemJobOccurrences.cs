using System;

using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PublyApp.Api.Migrations {
	/// <inheritdoc />
	public partial class AddSystemJobOccurrences : Migration {
		/// <inheritdoc />
		protected override void Up(MigrationBuilder migrationBuilder) {
			migrationBuilder.AddColumn<Guid>(
					name: "schedule_epoch",
					table: "system_job_definitions",
					type: "uuid",
					nullable: false,
					defaultValueSql: "gen_random_uuid()");

			migrationBuilder.CreateTable(
					name: "system_job_occurrences",
					columns: table => new {
						job_key = table.Column<string>(type: "text", nullable: false),
						scheduled_fire_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
						enqueued_job_id = table.Column<Guid>(type: "uuid", nullable: true),
						enqueued_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
					},
					constraints: table => {
						table.PrimaryKey("pk_system_job_occurrences", x => new { x.job_key, x.scheduled_fire_at });
					});

			migrationBuilder.CreateIndex(
					name: "ix_system_job_occurrences_scheduled_fire_at",
					table: "system_job_occurrences",
					column: "scheduled_fire_at");
		}

		/// <inheritdoc />
		protected override void Down(MigrationBuilder migrationBuilder) {
			migrationBuilder.DropTable(
					name: "system_job_occurrences");

			migrationBuilder.DropColumn(
					name: "schedule_epoch",
					table: "system_job_definitions");
		}
	}
}
