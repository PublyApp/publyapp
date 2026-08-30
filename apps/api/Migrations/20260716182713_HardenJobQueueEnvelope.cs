using System;

using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PublyApp.Api.Migrations {
	/// <inheritdoc />
	public partial class HardenJobQueueEnvelope : Migration {
		/// <inheritdoc />
		protected override void Up(MigrationBuilder migrationBuilder) {
			migrationBuilder.DropIndex(
					name: "ix_job_queue_claim",
					table: "job_queue");

			migrationBuilder.DropIndex(
					name: "ux_job_queue_idempotency",
					table: "job_queue");

			migrationBuilder.AlterColumn<int>(
					name: "max_attempts",
					table: "job_queue",
					type: "integer",
					nullable: false,
					defaultValue: 10,
					oldClrType: typeof(int),
					oldType: "integer",
					oldDefaultValue: 8);

			migrationBuilder.AddColumn<Guid>(
					name: "actor_user_id",
					table: "job_queue",
					type: "uuid",
					nullable: true);

			migrationBuilder.AddColumn<string>(
					name: "correlation_id",
					table: "job_queue",
					type: "text",
					nullable: true);

			migrationBuilder.AddColumn<Guid>(
					name: "lock_token",
					table: "job_queue",
					type: "uuid",
					nullable: true);

			migrationBuilder.AddColumn<Guid>(
					name: "tenant_id",
					table: "job_queue",
					type: "uuid",
					nullable: true);

			// F16/C9 requeue lineage (§4.1/§4.2). The requeue OPERATION is Phase 4's,
			// but the columns are the engine's envelope: landing them here keeps that
			// operation a pure code change and keeps FromJob able to copy the chain
			// forward from the moment the engine can dead-letter at all. NULL for
			// every originally-enqueued job, so no backfill exists or is owed.
			migrationBuilder.AddColumn<Guid>(
					name: "requeued_from_dead_letter_id",
					table: "job_queue",
					type: "uuid",
					nullable: true);

			// F16 lineage: fail-clear rather than fabricate. original_job_id was
			// nullable pre-envelope but the engine always wrote it, so a NULL here
			// means manual tampering — abort the migration instead of stamping a
			// Guid.Empty sentinel that would poison requeue lineage forever.
			migrationBuilder.Sql("""
                DO $$
                BEGIN
                    IF EXISTS (SELECT 1 FROM job_dead_letter WHERE original_job_id IS NULL) THEN
                        RAISE EXCEPTION
                            'job_dead_letter has rows with NULL original_job_id; resolve them before applying HardenJobQueueEnvelope';
                    END IF;
                END
                $$;
                """);

			migrationBuilder.AlterColumn<Guid>(
					name: "original_job_id",
					table: "job_dead_letter",
					type: "uuid",
					nullable: false,
					oldClrType: typeof(Guid),
					oldType: "uuid",
					oldNullable: true);

			migrationBuilder.AddColumn<Guid>(
					name: "actor_user_id",
					table: "job_dead_letter",
					type: "uuid",
					nullable: true);

			migrationBuilder.AddColumn<string>(
					name: "correlation_id",
					table: "job_dead_letter",
					type: "text",
					nullable: true);

			// F16 backfill: pre-envelope rows never recorded their original enqueue
			// time; created_at (when the DLQ row was written) is the closest honest
			// value — never a DateTime.MinValue sentinel. Added nullable, backfilled,
			// then tightened to the model's NOT NULL.
			migrationBuilder.AddColumn<DateTime>(
					name: "enqueued_at",
					table: "job_dead_letter",
					type: "timestamp with time zone",
					nullable: true);

			migrationBuilder.Sql(
					"UPDATE job_dead_letter SET enqueued_at = created_at WHERE enqueued_at IS NULL;");

			migrationBuilder.AlterColumn<DateTime>(
					name: "enqueued_at",
					table: "job_dead_letter",
					type: "timestamp with time zone",
					nullable: false,
					oldClrType: typeof(DateTime),
					oldType: "timestamp with time zone",
					oldNullable: true);

			migrationBuilder.AddColumn<string>(
					name: "idempotency_key",
					table: "job_dead_letter",
					type: "text",
					nullable: true);

			migrationBuilder.AddColumn<string>(
					name: "locked_by",
					table: "job_dead_letter",
					type: "text",
					nullable: true);

			// F16 backfill: rows dead-lettered before the envelope existed ran under
			// the engine's original 8-attempt policy — a requeue of such a row gets
			// a usable ceiling, not 0.
			migrationBuilder.AddColumn<int>(
					name: "max_attempts",
					table: "job_dead_letter",
					type: "integer",
					nullable: false,
					defaultValue: 8);

			migrationBuilder.AddColumn<int>(
					name: "priority",
					table: "job_dead_letter",
					type: "integer",
					nullable: false,
					defaultValue: 0);

			migrationBuilder.AddColumn<Guid>(
					name: "tenant_id",
					table: "job_dead_letter",
					type: "uuid",
					nullable: true);

			// Lineage IN (copied forward by JobDeadLetter.FromJob) + lineage OUT
			// (written only by Phase 4's RequeueDeadLetterAsync) — §4.2, F16/C9.
			migrationBuilder.AddColumn<Guid>(
					name: "requeued_from_dead_letter_id",
					table: "job_dead_letter",
					type: "uuid",
					nullable: true);

			migrationBuilder.AddColumn<Guid>(
					name: "requeued_as_job_id",
					table: "job_dead_letter",
					type: "uuid",
					nullable: true);

			migrationBuilder.AddColumn<DateTime>(
					name: "requeued_at",
					table: "job_dead_letter",
					type: "timestamp with time zone",
					nullable: true);

			// Follow the requeue chain backward/forward across re-dead-letterings.
			migrationBuilder.CreateIndex(
					name: "ix_job_dead_letter_requeued_from",
					table: "job_dead_letter",
					column: "requeued_from_dead_letter_id",
					filter: "requeued_from_dead_letter_id IS NOT NULL");

			migrationBuilder.CreateIndex(
					name: "ix_job_queue_claim",
					table: "job_queue",
					columns: new[] { "priority", "next_attempt_at", "created_at", "id" },
					descending: new[] { true, false, false, false },
					filter: "status = 0");

			migrationBuilder.CreateIndex(
					name: "ux_job_queue_type_idempotency",
					table: "job_queue",
					columns: new[] { "job_type", "idempotency_key" },
					unique: true,
					filter: "idempotency_key IS NOT NULL");

			migrationBuilder.AddCheckConstraint(
					name: "ck_job_queue_max_attempts",
					table: "job_queue",
					sql: "max_attempts BETWEEN 1 AND 50");

			migrationBuilder.AddCheckConstraint(
					name: "ck_job_queue_priority",
					table: "job_queue",
					sql: "priority BETWEEN 0 AND 1000");

			// High-churn maintenance (design §4.1, F21): delete-on-success produces
			// sustained dead tuples; default autovacuum triggers scale with table
			// size and lag a small hot table. Aggressive per-table settings +
			// HOT-update headroom.
			migrationBuilder.Sql("""
                ALTER TABLE job_queue SET (
                    autovacuum_vacuum_scale_factor = 0.0,
                    autovacuum_vacuum_threshold    = 500,
                    autovacuum_analyze_scale_factor = 0.0,
                    autovacuum_analyze_threshold   = 500,
                    fillfactor = 90
                );
                """);
		}

		/// <inheritdoc />
		protected override void Down(MigrationBuilder migrationBuilder) {
			migrationBuilder.Sql("""
                ALTER TABLE job_queue RESET (
                    autovacuum_vacuum_scale_factor,
                    autovacuum_vacuum_threshold,
                    autovacuum_analyze_scale_factor,
                    autovacuum_analyze_threshold,
                    fillfactor
                );
                """);

			migrationBuilder.DropIndex(
					name: "ix_job_queue_claim",
					table: "job_queue");

			migrationBuilder.DropIndex(
					name: "ux_job_queue_type_idempotency",
					table: "job_queue");

			migrationBuilder.DropIndex(
					name: "ix_job_dead_letter_requeued_from",
					table: "job_dead_letter");

			migrationBuilder.DropCheckConstraint(
					name: "ck_job_queue_max_attempts",
					table: "job_queue");

			migrationBuilder.DropCheckConstraint(
					name: "ck_job_queue_priority",
					table: "job_queue");

			migrationBuilder.DropColumn(
					name: "actor_user_id",
					table: "job_queue");

			migrationBuilder.DropColumn(
					name: "correlation_id",
					table: "job_queue");

			migrationBuilder.DropColumn(
					name: "lock_token",
					table: "job_queue");

			migrationBuilder.DropColumn(
					name: "tenant_id",
					table: "job_queue");

			migrationBuilder.DropColumn(
					name: "requeued_from_dead_letter_id",
					table: "job_queue");

			migrationBuilder.DropColumn(
					name: "actor_user_id",
					table: "job_dead_letter");

			migrationBuilder.DropColumn(
					name: "correlation_id",
					table: "job_dead_letter");

			migrationBuilder.DropColumn(
					name: "enqueued_at",
					table: "job_dead_letter");

			migrationBuilder.DropColumn(
					name: "idempotency_key",
					table: "job_dead_letter");

			migrationBuilder.DropColumn(
					name: "locked_by",
					table: "job_dead_letter");

			migrationBuilder.DropColumn(
					name: "max_attempts",
					table: "job_dead_letter");

			migrationBuilder.DropColumn(
					name: "priority",
					table: "job_dead_letter");

			migrationBuilder.DropColumn(
					name: "tenant_id",
					table: "job_dead_letter");

			migrationBuilder.DropColumn(
					name: "requeued_from_dead_letter_id",
					table: "job_dead_letter");

			migrationBuilder.DropColumn(
					name: "requeued_as_job_id",
					table: "job_dead_letter");

			migrationBuilder.DropColumn(
					name: "requeued_at",
					table: "job_dead_letter");

			migrationBuilder.AlterColumn<int>(
					name: "max_attempts",
					table: "job_queue",
					type: "integer",
					nullable: false,
					defaultValue: 8,
					oldClrType: typeof(int),
					oldType: "integer",
					oldDefaultValue: 10);

			migrationBuilder.AlterColumn<Guid>(
					name: "original_job_id",
					table: "job_dead_letter",
					type: "uuid",
					nullable: true,
					oldClrType: typeof(Guid),
					oldType: "uuid");

			migrationBuilder.CreateIndex(
					name: "ix_job_queue_claim",
					table: "job_queue",
					columns: new[] { "priority", "next_attempt_at", "created_at" },
					descending: new[] { true, false, false },
					filter: "status = 0");

			// The old index was GLOBALLY unique on idempotency_key; keys legally
			// shared across job types under the new (job_type, key) scoping must be
			// disambiguated deterministically before it can be recreated.
			//
			// Approach: a bounded set-based convergence loop. Each pass, within
			// every duplicate-key group the row with the lowest id (ORDER BY id
			// LIMIT 1 — no min(uuid) aggregate exists) keeps the key and every
			// other row extends its key with its OWN id. A single pass prevents
			// loser-vs-loser collisions but a rewritten key can still equal a
			// PRE-EXISTING unrelated key (e.g. someone enqueued literally
			// 'key:<loser-id>'), so the loop re-runs until a pass rewrites zero
			// rows — i.e. no duplicate keys remain anywhere in the table. Keys
			// strictly grow every pass (a row's id is appended), so cycles are
			// impossible and convergence is guaranteed; the 20-pass bound only
			// guards against pathological hand-crafted suffix chains, where the
			// migration fails clear instead of looping.
			migrationBuilder.Sql("""
                DO $$
                DECLARE
                    rewritten integer;
                    pass integer := 0;
                BEGIN
                    LOOP
                        UPDATE job_queue q
                        SET idempotency_key = q.idempotency_key || ':' || q.id::text
                        WHERE q.idempotency_key IS NOT NULL
                          AND q.id <> (
                              SELECT o.id FROM job_queue o
                              WHERE o.idempotency_key = q.idempotency_key
                              ORDER BY o.id
                              LIMIT 1
                          );
                        GET DIAGNOSTICS rewritten = ROW_COUNT;
                        EXIT WHEN rewritten = 0;
                        pass := pass + 1;
                        IF pass > 20 THEN
                            RAISE EXCEPTION
                                'Could not disambiguate job_queue idempotency keys after 20 passes; resolve manually before downgrading';
                        END IF;
                    END LOOP;
                END
                $$;
                """);

			migrationBuilder.CreateIndex(
					name: "ux_job_queue_idempotency",
					table: "job_queue",
					column: "idempotency_key",
					unique: true,
					filter: "idempotency_key IS NOT NULL");
		}
	}
}
