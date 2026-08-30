using System;

using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PublyApp.Api.Migrations {
	/// <inheritdoc />
	public partial class AddJobQueue : Migration {
		/// <inheritdoc />
		protected override void Up(MigrationBuilder migrationBuilder) {
			migrationBuilder.CreateTable(
					name: "job_dead_letter",
					columns: table => new {
						id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "uuidv7()"),
						original_job_id = table.Column<Guid>(type: "uuid", nullable: true),
						job_type = table.Column<string>(type: "text", nullable: false),
						payload = table.Column<string>(type: "jsonb", nullable: false),
						attempts = table.Column<int>(type: "integer", nullable: false),
						last_error = table.Column<string>(type: "text", nullable: true),
						failed_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
						created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
					},
					constraints: table => {
						table.PrimaryKey("pk_job_dead_letter", x => x.id);
					});

			migrationBuilder.CreateTable(
					name: "job_queue",
					columns: table => new {
						id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "uuidv7()"),
						job_type = table.Column<string>(type: "text", nullable: false),
						payload = table.Column<string>(type: "jsonb", nullable: false, defaultValueSql: "'{}'"),
						status = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
						priority = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
						attempts = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
						max_attempts = table.Column<int>(type: "integer", nullable: false, defaultValue: 8),
						next_attempt_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
						locked_until = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
						locked_by = table.Column<string>(type: "text", nullable: true),
						last_error = table.Column<string>(type: "text", nullable: true),
						idempotency_key = table.Column<string>(type: "text", nullable: true),
						created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
						updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
					},
					constraints: table => {
						table.PrimaryKey("pk_job_queue", x => x.id);
					});

			migrationBuilder.CreateIndex(
					name: "ix_job_dead_letter_job_type",
					table: "job_dead_letter",
					columns: new[] { "job_type", "failed_at" });

			migrationBuilder.CreateIndex(
					name: "ix_job_queue_claim",
					table: "job_queue",
					columns: new[] { "priority", "next_attempt_at", "created_at" },
					descending: new[] { true, false, false },
					filter: "status = 0");

			migrationBuilder.CreateIndex(
					name: "ix_job_queue_reclaim",
					table: "job_queue",
					column: "locked_until",
					filter: "status = 1");

			migrationBuilder.CreateIndex(
					name: "ux_job_queue_idempotency",
					table: "job_queue",
					column: "idempotency_key",
					unique: true,
					filter: "idempotency_key IS NOT NULL");
		}

		/// <inheritdoc />
		protected override void Down(MigrationBuilder migrationBuilder) {
			migrationBuilder.DropTable(
					name: "job_dead_letter");

			migrationBuilder.DropTable(
					name: "job_queue");
		}
	}
}
