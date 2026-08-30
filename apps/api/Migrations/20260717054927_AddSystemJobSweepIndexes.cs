using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PublyApp.Api.Migrations {
	/// <inheritdoc />
	public partial class AddSystemJobSweepIndexes : Migration {
		/// <inheritdoc />
		protected override void Up(MigrationBuilder migrationBuilder) {
			migrationBuilder.DropIndex(
					name: "IX_sessions_expires_at",
					table: "sessions");

			migrationBuilder.CreateIndex(
					name: "ix_sessions_expires_at_id",
					table: "sessions",
					columns: new[] { "expires_at", "id" });

			migrationBuilder.CreateIndex(
					name: "ix_job_dead_letter_failed_at_id",
					table: "job_dead_letter",
					columns: new[] { "failed_at", "id" });

			migrationBuilder.CreateIndex(
					name: "ix_job_dead_letter_original_job_id",
					table: "job_dead_letter",
					column: "original_job_id");

			migrationBuilder.CreateIndex(
					name: "ix_email_prepared_sends_prepared_at_job_id",
					table: "email_prepared_sends",
					columns: new[] { "prepared_at", "job_id" });

			migrationBuilder.CreateIndex(
					name: "ix_email_log_occurred_at_id",
					table: "email_log",
					columns: new[] { "occurred_at", "id" });

			migrationBuilder.CreateIndex(
					name: "ix_email_log_permanently_failed_occurred_at",
					table: "email_log",
					column: "occurred_at",
					filter: "outcome = 2");
		}

		/// <inheritdoc />
		protected override void Down(MigrationBuilder migrationBuilder) {
			migrationBuilder.DropIndex(
					name: "ix_sessions_expires_at_id",
					table: "sessions");

			migrationBuilder.DropIndex(
					name: "ix_job_dead_letter_failed_at_id",
					table: "job_dead_letter");

			migrationBuilder.DropIndex(
					name: "ix_job_dead_letter_original_job_id",
					table: "job_dead_letter");

			migrationBuilder.DropIndex(
					name: "ix_email_prepared_sends_prepared_at_job_id",
					table: "email_prepared_sends");

			migrationBuilder.DropIndex(
					name: "ix_email_log_occurred_at_id",
					table: "email_log");

			migrationBuilder.DropIndex(
					name: "ix_email_log_permanently_failed_occurred_at",
					table: "email_log");

			migrationBuilder.CreateIndex(
					name: "IX_sessions_expires_at",
					table: "sessions",
					column: "expires_at");
		}
	}
}
