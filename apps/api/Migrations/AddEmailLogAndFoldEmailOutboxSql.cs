namespace PublyApp.Api.Migrations;

/// <summary>
/// Immutable data-fold SQL shared by the migration and its transaction/rollback specs.
/// Keep each statement byte-identical: already-generated migrations are append-only.
/// </summary>
public static class AddEmailLogAndFoldEmailOutboxSql {
	// R1 serialization (§4.6). The whole data fold must be atomic *against the legacy
	// dispatcher*, which still claims rows in R1 with its own
	// `UPDATE ... FOR UPDATE SKIP LOCKED` (a ROW EXCLUSIVE table lock). The back-copy/fold
	// read Pending rows without row-locking them and the Cancel is a LATER statement, so
	// without this a dispatcher can claim a row → Processing → send it in the window
	// between the fold reading that row and cancelling it, while the fold job for the same
	// row is ALSO enqueued: the identical invitation sent twice. SHARE ROW EXCLUSIVE
	// conflicts with the dispatcher's ROW EXCLUSIVE, so every claim UPDATE blocks until
	// this migration transaction commits (the lock is transaction-scoped); by then the
	// folded rows are Cancelled and no longer match the dispatcher's `status = Pending`
	// claim predicate. It must be the FIRST fold statement — a lock taken after the first
	// read would not cover the read it needs to protect. Plain SELECTs do not conflict, so
	// unrelated readers are not stalled. (In the real migration the preceding ADD COLUMN
	// already holds the stronger ACCESS EXCLUSIVE; this explicit lock is the sufficient,
	// spec-exercised artefact and documents the invariant on its own.)
	public const string LockOutboxForFold = """
        LOCK TABLE invitation_email_outbox IN SHARE ROW EXCLUSIVE MODE;
        """;

	public const string BackCopyTerminalHistory = """
        INSERT INTO email_log (
            job_id, legacy_outbox_id, kind, recipient, outcome, invitation_id,
            user_id, provider_message_id, request_sha256, attempts, last_error,
            occurred_at, created_at
        )
        SELECT
            NULL,
            o.id,
            o.kind,
            o.email,
            CASE o.status
                -- Sent -> LegacySubmissionUnverified, NEVER Submitted (§4.4/§4.6, R2-3):
                -- the old dispatcher marked rows Sent regardless of provider rejection,
                -- so these rows do not support a "provider accepted" claim.
                WHEN 1 THEN 3   -- Sent      -> LegacySubmissionUnverified
                WHEN 2 THEN 2   -- Failed    -> PermanentlyFailed
                WHEN 4 THEN 1   -- Cancelled -> CancelledIneligible
            END,
            o.invitation_id,
            NULL,
            NULL,
            NULL,
            o.attempt_count,
            -- A stable migration code, NEVER a copy of the legacy text (§4.6, R2-8). The
            -- raw column's diagnostic value is low and it may hold unsanitizable PII or
            -- tokens: regex redaction is best-effort and cannot be proven complete, so the
            -- fold records WHY the row exists rather than what the old dispatcher logged.
            -- A fixed literal per source status; NULL for Sent/Cancelled.
            CASE o.status
                WHEN 2 THEN 'legacy-import:failed'
            END,
            -- Explicit legacy timestamp mapping (§4.6): Sent -> sent_at; Failed /
            -- Cancelled -> updated_at. Deliberately NOT a COALESCE chain: a COALESCE
            -- agrees with this mapping only while non-Sent rows carry a NULL sent_at, and
            -- silently takes the WRONG column the moment one does not (a row the old
            -- dispatcher marked Sent and later re-marked Failed/Cancelled) — the history
            -- would then claim the outcome occurred when the SEND did.
            --
            -- No now() fallback. now() is the MIGRATION's runtime and has nothing to do
            -- with the email: it would stamp every anomalous legacy row as having occurred
            -- at fold time, the same manufactured-history failure R2-3 rejects for
            -- outcomes. The one fallback here is PROVABLE instead: updated_at is NOT NULL
            -- on this table, and the old dispatcher writes sent_at and updated_at in the
            -- same update on send, so for the anomalous Sent row missing its sent_at,
            -- updated_at is a real, bounded upper bound on when that send happened — the
            -- same column §4.6 already mandates for the other two statuses, not a new
            -- concept. Because now() is gone, if updated_at itself were ever absent the
            -- SELECT yields NULL into email_log.occurred_at, which is NOT NULL: an
            -- explicit NULL in INSERT ... SELECT does not take the column default, so the
            -- fold ABORTS the whole transaction loudly rather than inventing a timestamp.
            CASE o.status
                WHEN 1 THEN COALESCE(o.sent_at, o.updated_at)
                ELSE o.updated_at
            END,
            now()
        FROM invitation_email_outbox o
        WHERE o.status IN (1, 2, 4)
          -- Exclude rows the fold moved into job_queue (§4.6, R2). Their outcome is the
          -- new job, not a cancellation, so they are NOT delivery history. Provenance is
          -- read from folded_job_id: a column ONLY step 3 (CancelFoldedPendingRows) ever
          -- writes, set atomically with the Cancel and pointing at the created job. This
          -- is provenance-SAFE where the previous compound marker (status = 4 AND
          -- last_error = the reserved sentinel) was not: last_error is free text the legacy
          -- dispatcher fills with ex.Message and both cancellation paths PRESERVE, so a
          -- genuine cancellation could carry that sentinel string with no fold job behind
          -- it and be silently erased from history. folded_job_id cannot be forged that
          -- way — nothing but this migration writes it. It also OUTLIVES the job: a
          -- successful fold job is deleted before R2's straggler back-copy, but this marker
          -- lives on the source row, so the exclusion is stable on every re-run and for R2.
          -- A live `job_queue EXISTS` check would (wrongly) re-admit the row once its job
          -- had been deleted.
          AND o.folded_job_id IS NULL
        -- Idempotent on the ux_email_log_legacy_outbox_id unique index (§4.4/§4.6): one
        -- historical row per source outbox row. The arbiter repeats the index's own
        -- predicate because that index is partial. This is what makes the copy re-run-safe
        -- for R2's straggler back-copy, where a NOT EXISTS pre-check is not adequate.
        ON CONFLICT (legacy_outbox_id) WHERE legacy_outbox_id IS NOT NULL DO NOTHING;
        """;

	public const string FoldPendingRows = """
        INSERT INTO job_queue (
            id, job_type, payload, status, priority, attempts, max_attempts,
            next_attempt_at, idempotency_key, created_at, updated_at
        )
        SELECT
            uuidv7(),
            CASE o.kind
                WHEN 0 THEN 'email.tenant-invitation.v1'
                WHEN 1 THEN 'email.staff-invitation.v1'
            END,
            jsonb_build_object('invitationId', o.invitation_id),
            0,
            100,
            o.attempt_count,
            10,
            o.next_attempt_at,
            'fold:' || o.id,
            o.created_at,
            now()
        FROM invitation_email_outbox o
        WHERE o.status = 0
          AND o.invitation_id IS NOT NULL
          AND NOT EXISTS (
              -- Uniqueness is (job_type, idempotency_key): the existence check must
              -- match BOTH, or an unrelated job_type carrying 'fold:<id>' would
              -- suppress this insert while step 3 still Cancels the source row.
              SELECT 1 FROM job_queue jq
              WHERE jq.job_type = CASE o.kind
                      WHEN 0 THEN 'email.tenant-invitation.v1'
                      WHEN 1 THEN 'email.staff-invitation.v1'
                  END
                AND jq.idempotency_key = 'fold:' || o.id
          );
        """;

	public const string CancelFoldedPendingRows = """
        UPDATE invitation_email_outbox o
        SET status = 4,
            -- Durable, provenance-safe fold marker (§4.6, R2): record WHICH job this row
            -- was folded into, in the SAME statement that Cancels it. The back-copy keys
            -- its exclusion on this column, never on last_error free text. Only this
            -- statement writes it, and it lives on the source row, so it outlives the
            -- fold job (deleted on success before R2's straggler back-copy).
            folded_job_id = jq.id,
            -- Operator-facing note only; NOT load-bearing for the back-copy exclusion.
            last_error = 'folded to job_queue',
            updated_at = now()
        FROM job_queue jq
        -- Match the mapped job_type AND the key (see step 2): only Cancel a source row
        -- whose OWN fold job now exists. (job_type, idempotency_key) is uniquely indexed
        -- (ux_job_queue_type_idempotency), so this join matches at most one job per row —
        -- no fan-out, and folded_job_id is unambiguous.
        WHERE jq.job_type = CASE o.kind
                  WHEN 0 THEN 'email.tenant-invitation.v1'
                  WHEN 1 THEN 'email.staff-invitation.v1'
              END
          AND jq.idempotency_key = 'fold:' || o.id
          AND o.status = 0
          AND o.invitation_id IS NOT NULL;
        """;

	public const string CancelPendingRowsWithoutInvitation = """
        INSERT INTO email_log (
            job_id, legacy_outbox_id, kind, recipient, outcome, invitation_id,
            user_id, attempts, last_error, occurred_at, created_at
        )
        SELECT
            NULL, o.id, o.kind, o.email, 1, NULL, NULL, o.attempt_count,
            'pending outbox row had no invitation_id at fold time',
            -- updated_at, with no now() fallback, for the same reason as the back-copy
            -- above: updated_at is NOT NULL on this table, so the fallback was already
            -- unreachable, and now() would date the row to the fold rather than to the
            -- outcome. If it were ever absent, occurred_at's NOT NULL aborts the fold.
            o.updated_at, now()
        FROM invitation_email_outbox o
        WHERE o.status = 0
          AND o.invitation_id IS NULL
        ON CONFLICT (legacy_outbox_id) WHERE legacy_outbox_id IS NOT NULL DO NOTHING;

        UPDATE invitation_email_outbox o
        SET status = 4, last_error = 'folded: no invitation_id', updated_at = now()
        WHERE o.status = 0 AND o.invitation_id IS NULL;
        """;
}
