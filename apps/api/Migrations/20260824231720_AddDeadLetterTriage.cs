using System;

using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PublyApp.Api.Migrations {
	/// <inheritdoc />
	public partial class AddDeadLetterTriage : Migration {
		/// <inheritdoc />
		protected override void Up(MigrationBuilder migrationBuilder) {
			migrationBuilder.AddColumn<string>(
					name: "triage_note",
					table: "job_dead_letter",
					type: "text",
					nullable: true);

			migrationBuilder.AddColumn<DateTime>(
					name: "triaged_at",
					table: "job_dead_letter",
					type: "timestamp with time zone",
					nullable: true);

			migrationBuilder.AddColumn<string>(
					name: "triaged_by",
					table: "job_dead_letter",
					type: "text",
					nullable: true);

			migrationBuilder.CreateIndex(
					name: "ix_job_dead_letter_untriaged_missing",
					table: "job_dead_letter",
					column: "failed_at",
					filter: "triaged_at IS NULL AND job_type LIKE 'jobs.missing.%'");
		}

		/// <inheritdoc />
		protected override void Down(MigrationBuilder migrationBuilder) {
			migrationBuilder.DropIndex(
					name: "ix_job_dead_letter_untriaged_missing",
					table: "job_dead_letter");

			migrationBuilder.DropColumn(
					name: "triage_note",
					table: "job_dead_letter");

			migrationBuilder.DropColumn(
					name: "triaged_at",
					table: "job_dead_letter");

			migrationBuilder.DropColumn(
					name: "triaged_by",
					table: "job_dead_letter");
		}
	}
}
