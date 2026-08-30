using System;

using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PublyApp.Api.Migrations {
	/// <inheritdoc />
	public partial class AddJobDeadLetterExternalState : Migration {
		/// <inheritdoc />
		protected override void Up(MigrationBuilder migrationBuilder) {
			migrationBuilder.AddColumn<DateTime>(
					name: "external_state_expired_at",
					table: "job_dead_letter",
					type: "timestamp with time zone",
					nullable: true);

			migrationBuilder.AddColumn<DateTime>(
					name: "external_state_expires_at",
					table: "job_dead_letter",
					type: "timestamp with time zone",
					nullable: true);

			migrationBuilder.AddColumn<DateTime>(
					name: "external_state_prepared_at",
					table: "job_dead_letter",
					type: "timestamp with time zone",
					nullable: true);

			migrationBuilder.AddColumn<int>(
					name: "external_state_status",
					table: "job_dead_letter",
					type: "integer",
					nullable: false,
					defaultValue: 0);

			migrationBuilder.CreateTable(
					name: "job_dead_letter_events",
					columns: table => new {
						id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "uuidv7()"),
						dead_letter_id = table.Column<Guid>(type: "uuid", nullable: false),
						@event = table.Column<string>(name: "event", type: "text", nullable: false),
						detected_by = table.Column<string>(type: "text", nullable: false),
						prior_status = table.Column<int>(type: "integer", nullable: false),
						new_status = table.Column<int>(type: "integer", nullable: false),
						details = table.Column<string>(type: "jsonb", nullable: false),
						occurred_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
					},
					constraints: table => {
						table.PrimaryKey("pk_job_dead_letter_events", x => x.id);
						table.ForeignKey(
											name: "fk_job_dead_letter_events_dead_letter_id",
											column: x => x.dead_letter_id,
											principalTable: "job_dead_letter",
											principalColumn: "id",
											onDelete: ReferentialAction.Cascade);
					});

			migrationBuilder.CreateIndex(
					name: "ix_job_dead_letter_external_state",
					table: "job_dead_letter",
					column: "external_state_status",
					filter: "external_state_status <> 0");

			migrationBuilder.AddCheckConstraint(
					name: "ck_job_dead_letter_external_state_bounds",
					table: "job_dead_letter",
					sql: "(external_state_status IN (0, 3) AND external_state_prepared_at IS NULL AND external_state_expires_at IS NULL AND external_state_expired_at IS NULL) OR (external_state_status IN (1, 2, 4, 5, 6) AND external_state_prepared_at IS NOT NULL AND external_state_expires_at IS NOT NULL)");

			migrationBuilder.AddCheckConstraint(
					name: "ck_job_dead_letter_external_state_expired_at",
					table: "job_dead_letter",
					sql: "(external_state_status = 2 AND external_state_expired_at IS NOT NULL) OR (external_state_status <> 2 AND external_state_expired_at IS NULL)");

			migrationBuilder.AddCheckConstraint(
					name: "ck_job_dead_letter_external_state_status",
					table: "job_dead_letter",
					sql: "external_state_status IN (0, 1, 2, 3, 4, 5, 6)");

			migrationBuilder.CreateIndex(
					name: "ix_job_dead_letter_events_dead_letter_id",
					table: "job_dead_letter_events",
					columns: new[] { "dead_letter_id", "occurred_at" });
		}

		/// <inheritdoc />
		protected override void Down(MigrationBuilder migrationBuilder) {
			migrationBuilder.DropTable(
					name: "job_dead_letter_events");

			migrationBuilder.DropIndex(
					name: "ix_job_dead_letter_external_state",
					table: "job_dead_letter");

			migrationBuilder.DropCheckConstraint(
					name: "ck_job_dead_letter_external_state_bounds",
					table: "job_dead_letter");

			migrationBuilder.DropCheckConstraint(
					name: "ck_job_dead_letter_external_state_expired_at",
					table: "job_dead_letter");

			migrationBuilder.DropCheckConstraint(
					name: "ck_job_dead_letter_external_state_status",
					table: "job_dead_letter");

			migrationBuilder.DropColumn(
					name: "external_state_expired_at",
					table: "job_dead_letter");

			migrationBuilder.DropColumn(
					name: "external_state_expires_at",
					table: "job_dead_letter");

			migrationBuilder.DropColumn(
					name: "external_state_prepared_at",
					table: "job_dead_letter");

			migrationBuilder.DropColumn(
					name: "external_state_status",
					table: "job_dead_letter");
		}
	}
}
