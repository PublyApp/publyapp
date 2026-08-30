using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PublyApp.Api.Migrations {
	/// <inheritdoc />
	public partial class AddEmailLogEvidenceReplayIndex : Migration {
		/// <inheritdoc />
		protected override void Up(MigrationBuilder migrationBuilder) {
			// #866 round-1 finding 3: the EXPLICIT replay guard on the evidence table.
			// The correlation id is carried on each evidence row and made UNIQUE, so a
			// replayed provider event is refused by THIS index even for a raw-SQL
			// writer that never re-stamps email_log (whose own
			// ux_email_log_provider_event_id remains as a second net).
			migrationBuilder.AddColumn<string>(
					name: "provider_event_id",
					table: "email_log_evidence_events",
					type: "text",
					nullable: true);

			migrationBuilder.CreateIndex(
					name: "ux_email_log_evidence_events_provider_event_id",
					table: "email_log_evidence_events",
					column: "provider_event_id",
					unique: true,
					filter: "provider_event_id IS NOT NULL");
		}

		/// <inheritdoc />
		protected override void Down(MigrationBuilder migrationBuilder) {
			migrationBuilder.DropIndex(
					name: "ux_email_log_evidence_events_provider_event_id",
					table: "email_log_evidence_events");

			migrationBuilder.DropColumn(
					name: "provider_event_id",
					table: "email_log_evidence_events");
		}
	}
}
