using System;

using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PublyApp.Api.Migrations {
	/// <inheritdoc />
	public partial class AddEmailLogAndFoldEmailOutbox : Migration {
		/// <inheritdoc />
		protected override void Up(MigrationBuilder migrationBuilder) {
			migrationBuilder.CreateTable(
					name: "email_log",
					columns: table => new {
						id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "uuidv7()"),
						job_id = table.Column<Guid>(type: "uuid", nullable: true),
						legacy_outbox_id = table.Column<Guid>(type: "uuid", nullable: true),
						kind = table.Column<int>(type: "integer", nullable: false),
						recipient = table.Column<string>(type: "text", nullable: false),
						outcome = table.Column<int>(type: "integer", nullable: false),
						invitation_id = table.Column<Guid>(type: "uuid", nullable: true),
						user_id = table.Column<Guid>(type: "uuid", nullable: true),
						provider_message_id = table.Column<string>(type: "text", nullable: true),
						request_sha256 = table.Column<string>(type: "text", nullable: true),
						attempts = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
						last_error = table.Column<string>(type: "text", nullable: true),
						evidence_source = table.Column<string>(type: "text", nullable: false, defaultValueSql: "'local'"),
						provider_event_id = table.Column<string>(type: "text", nullable: true),
						occurred_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
						created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()"),
						updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
					},
					constraints: table => {
						table.PrimaryKey("pk_email_log", x => x.id);
					});

			migrationBuilder.CreateTable(
					name: "email_prepared_sends",
					columns: table => new {
						job_id = table.Column<Guid>(type: "uuid", nullable: false),
						envelope = table.Column<string>(type: "jsonb", nullable: false),
						request_sha256 = table.Column<string>(type: "text", nullable: false),
						provider_idempotency_key = table.Column<string>(type: "text", nullable: false),
						prepared_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false, defaultValueSql: "now()")
					},
					constraints: table => {
						table.PrimaryKey("pk_email_prepared_sends", x => x.job_id);
					});

			migrationBuilder.CreateIndex(
					name: "ix_email_log_invitation_id",
					table: "email_log",
					column: "invitation_id",
					filter: "invitation_id IS NOT NULL");

			migrationBuilder.CreateIndex(
					name: "ix_email_log_kind_occurred_at",
					table: "email_log",
					columns: new[] { "kind", "occurred_at" });

			migrationBuilder.CreateIndex(
					name: "ix_email_log_recipient_occurred_at",
					table: "email_log",
					columns: new[] { "recipient", "occurred_at" });

			migrationBuilder.CreateIndex(
					name: "ix_email_log_user_id",
					table: "email_log",
					column: "user_id",
					filter: "user_id IS NOT NULL");

			migrationBuilder.CreateIndex(
					name: "ux_email_log_job_id",
					table: "email_log",
					column: "job_id",
					unique: true,
					filter: "job_id IS NOT NULL");

			// Provider correlation lookup (design §4.4, F3/F20): support/ops resolve a
			// delivery by the provider message id. Partial — only accepted sends carry one.
			migrationBuilder.CreateIndex(
					name: "ix_email_log_provider_message_id",
					table: "email_log",
					column: "provider_message_id",
					filter: "provider_message_id IS NOT NULL");

			// One historical row per source outbox row (design §4.4/§4.6, F4/C3): the
			// arbiter for the back-copy's ON CONFLICT DO NOTHING, which is what makes the
			// fold idempotent and re-run-safe beyond R1's single transaction.
			migrationBuilder.CreateIndex(
					name: "ux_email_log_legacy_outbox_id",
					table: "email_log",
					column: "legacy_outbox_id",
					unique: true,
					filter: "legacy_outbox_id IS NOT NULL");

			// Provider evidence dedup (design §4.4): rejects a concurrent webhook /
			// reconciliation replay of the same provider event.
			migrationBuilder.CreateIndex(
					name: "ux_email_log_provider_event_id",
					table: "email_log",
					column: "provider_event_id",
					unique: true,
					filter: "provider_event_id IS NOT NULL");

			// The email-log-retention age sweep (design §7.3, R5-3). The kind/recipient
			// composites lead with their own column, so neither can serve a scan by age.
			migrationBuilder.CreateIndex(
					name: "ix_email_log_occurred_at",
					table: "email_log",
					column: "occurred_at");

			// The email-prepared-sends-retention sweep scans and orders by prepared_at;
			// the job_id PK cannot serve it (design §4.5, R5-3).
			migrationBuilder.CreateIndex(
					name: "ix_email_prepared_sends_prepared_at",
					table: "email_prepared_sends",
					column: "prepared_at");

			// ---- Expand/contract fold of invitation_email_outbox, Release R1 (design
			// §4.6, F4). This migration runs in a single transaction, so all data steps
			// below are atomic. The old dispatcher/entity SHIP UNCHANGED in R1 as
			// drainers; R2 verifies quiescence and drops the table.
			//
			// Status codes (InvitationEmailOutboxStatus): 0 Pending, 1 Sent, 2 Failed,
			// 3 Processing, 4 Cancelled. Kind values are preserved 1:1 between
			// InvitationEmailKind and EmailKind (TenantInvitation=0, StaffInvitation=1).
			// email_log outcome: 0 Submitted, 1 CancelledIneligible, 2 PermanentlyFailed,
			// 3 LegacySubmissionUnverified.

			// 1. Back-copy GENUINE terminal history only (O6/C3): each Sent/Failed/
			//    genuinely-Cancelled row becomes an email_log row, stamped with
			//    legacy_outbox_id so the copy is idempotent (ON CONFLICT on
			//    ux_email_log_legacy_outbox_id). Legacy `Sent` maps to
			//    LegacySubmissionUnverified, NEVER Submitted (§4.4/§4.6, R2-3): the old
			//    dispatcher marked rows Sent regardless of provider rejection, so those
			//    rows cannot support a "provider accepted" claim.
			//
			//    Rows the fold moved into job_queue are EXCLUDED on the SOLE marker
			//    `folded_job_id IS NULL`: step 3 (CancelFoldedPendingRows) stamps
			//    folded_job_id with the job it created, in the same statement that Cancels
			//    the row, and nothing else ever writes that column — so their outcome is the
			//    new job_queue job, not a cancellation. last_error = 'folded to job_queue'
			//    is an operator-facing note only and is NEVER read by the exclusion (a
			//    genuine cancellation may carry that free text with no fold job behind it).
			//    Ordering alone does not achieve this: step 1 runs before step 3 within this
			//    migration, but the folded_job_id exclusion is what keeps the statement
			//    correct on a re-run and for R2's straggler back-copy, which run with the
			//    marker already committed.
			//
			//    Legacy last_error is NOT copied at all (§4.6, R2-8) — not even redacted.
			//    The fold writes a stable migration code ('legacy-import:failed' for
			//    Failed, NULL otherwise): the raw text's diagnostic value is low and it may
			//    hold unsanitizable PII/tokens, and a regex redaction is best-effort by
			//    construction. Not copying is the categorical form of the §4.4/F20
			//    "bounded + sanitized" contract.
			// 0. Durable fold-lineage marker (§4.6, R1/R2). CancelFoldedPendingRows stamps
			//    it with the job a Pending row was folded into; the back-copy excludes any
			//    row carrying it. ADD COLUMN takes ACCESS EXCLUSIVE on the outbox for the
			//    rest of this single migration transaction — already serializing the fold
			//    against the live dispatcher — but the explicit SHARE ROW EXCLUSIVE lock
			//    below is the artefact the fold specs exercise and is, on its own,
			//    sufficient for that serialization.
			migrationBuilder.AddColumn<Guid>(
					name: "folded_job_id",
					table: "invitation_email_outbox",
					type: "uuid",
					nullable: true);

			// R1 (merge-blocker): serialize the entire data fold against the still-running
			// legacy dispatcher BEFORE the first row is read. Without this, a Pending row
			// can be claimed → Processing → sent by the dispatcher in the window between
			// the fold reading it and cancelling it, while its fold job is also enqueued —
			// the same invitation sent twice. The lock is held to COMMIT.
			migrationBuilder.Sql(AddEmailLogAndFoldEmailOutboxSql.LockOutboxForFold);
			migrationBuilder.Sql(AddEmailLogAndFoldEmailOutboxSql.BackCopyTerminalHistory);

			// 2. Fold PENDING rows (only) into job_queue as email jobs. Payload is built
			//    in SQL to the canonical camelCase wire shape the handlers deserialize
			//    (F2). attempts/next_attempt_at are preserved; email priority (100) and
			//    default max_attempts (10) match the job definitions. idempotency_key =
			//    'fold:<id>' is the source-row marker: under the (job_type,
			//    idempotency_key) unique index a re-run cannot duplicate a fold.
			migrationBuilder.Sql(AddEmailLogAndFoldEmailOutboxSql.FoldPendingRows);

			// 3. Mark the folded PENDING rows Cancelled so the old dispatcher (still
			//    running in R1) can never also send them. Only rows whose fold job now
			//    exists are cancelled — rerun-safe. No row is ever owned by both systems.
			migrationBuilder.Sql(AddEmailLogAndFoldEmailOutboxSql.CancelFoldedPendingRows);

			// 4. A PENDING row with NULL invitation_id (pre-linkage legacy shape; expected
			//    count ZERO) cannot become an id-payload job — route it to email_log as
			//    CancelledIneligible and cancel the source row.
			migrationBuilder.Sql(
					AddEmailLogAndFoldEmailOutboxSql.CancelPendingRowsWithoutInvitation);

			// 5. PROCESSING rows (status = 3) are deliberately UNTOUCHED — they may be
			//    inside a live old-dispatcher send. They drain via the old path in R1; R2
			//    verifies quiescence before dropping the table (design §4.6).
		}

		/// <inheritdoc />
		protected override void Down(MigrationBuilder migrationBuilder) {
			// This is a ONE-WAY data migration and is deliberately IRREVERSIBLE (F1). Fail
			// loudly BEFORE emitting any operation rather than perform a structural rollback
			// that silently corrupts fold provenance.
			//
			// Up() folds each Pending source row O into a new job_queue job J and atomically
			// commits O.status = Cancelled + O.folded_job_id = J.id. A schema-only Down()
			// could drop email_log/email_prepared_sends and folded_job_id, but it can neither
			// restore O to Pending nor un-create J — the fold destroys the Pending source
			// state and cannot un-send. Worse, dropping folded_job_id destroys the ONLY
			// durable provenance marker: a later re-Up() re-adds the column NULL, and
			// BackCopyTerminalHistory (which excludes on folded_job_id IS NULL) then
			// manufactures false CancelledIneligible history for a row whose real outcome is
			// its fold job J. There is no honest structural reversal, so Down() throws.
			throw new NotSupportedException(
					"20260717035428_AddEmailLogAndFoldEmailOutbox is a one-way data migration and "
					+ "cannot be rolled back: it folds Pending invitation_email_outbox rows into "
					+ "job_queue jobs and marks the source rows Cancelled, irreversibly destroying "
					+ "the original Pending state and the folded_job_id provenance. Restore from a "
					+ "pre-migration backup instead of reverting this migration.");
		}
	}
}
