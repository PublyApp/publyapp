using System;

using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PublyApp.Api.Migrations {
	/// <inheritdoc />
	public partial class AddEmailLogEvidenceEvents : Migration {
		/// <inheritdoc />
		protected override void Up(MigrationBuilder migrationBuilder) {
			migrationBuilder.CreateTable(
					name: "email_log_evidence_events",
					columns: table => new {
						id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "uuidv7()"),
						email_log_id = table.Column<Guid>(type: "uuid", nullable: false),
						@event = table.Column<string>(name: "event", type: "text", nullable: false),
						actor_kind = table.Column<string>(type: "text", nullable: false),
						actor_id = table.Column<string>(type: "text", nullable: false),
						prior_outcome = table.Column<int>(type: "integer", nullable: false),
						new_outcome = table.Column<int>(type: "integer", nullable: false),
						details = table.Column<string>(type: "jsonb", nullable: false),
						occurred_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
					},
					constraints: table => {
						table.PrimaryKey("pk_email_log_evidence_events", x => x.id);
						table.ForeignKey(
											name: "fk_email_log_evidence_events_email_log_id",
											column: x => x.email_log_id,
											principalTable: "email_log",
											principalColumn: "id",
											onDelete: ReferentialAction.Cascade);
					});

			migrationBuilder.CreateIndex(
					name: "ix_email_log_evidence_events_email_log_id",
					table: "email_log_evidence_events",
					columns: new[] { "email_log_id", "occurred_at" });

			// Actor invariants at the database level (#866 round-1): even a raw-SQL writer
			// cannot persist an unnamed or out-of-vocabulary author. Mirrors the
			// EmailLogActor constructor invariants.
			migrationBuilder.Sql("""
                ALTER TABLE email_log_evidence_events
                    ADD CONSTRAINT ck_email_log_evidence_events_actor_kind
                    CHECK (actor_kind IN ('provider_webhook', 'provider_reconciliation')),
                    ADD CONSTRAINT ck_email_log_evidence_events_actor_id
                    CHECK (length(actor_id) > 0 AND length(actor_id) <= 512);
                """);
		}

		/// <inheritdoc />
		protected override void Down(MigrationBuilder migrationBuilder) {
			migrationBuilder.DropTable(
					name: "email_log_evidence_events");
		}
	}
}
