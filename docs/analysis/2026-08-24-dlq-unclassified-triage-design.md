# Chantier #863 — DLQ external prepared-state: schema, Unclassified triage, retention eligibility — design

Date: 2026-08-24. Lane `lane/wt-863`, worktree `.worktrees/wt-863`. Closes #863 (K-1 of the
#852 jobs design §11). Refs #852, #864 (K-2), #865 (K-3), #194.

## 1. The decisive fact: the external-state machinery does not exist in code yet

Issue #863 is written as a delta against R10-1's state ("R10-1 made retention ineligible for
`external_state_status IN (1, 6)`"), but **none of that machinery exists on develop**. Verified
exhaustively on this worktree (`grep -rn "external_state|ExternalStateStatus|Unclassified|
NeverPrepared|PreparedState" apps/api --include=*.cs` → only two comment references; zero hits in
migrations or the model snapshot):

- `job_dead_letter` has **no** `external_state_*` columns (entity `JobDeadLetter`,
  `AppDbContextModelSnapshot.cs`, every migration).
- `job_queue` has **no** `external_prepared_at` marker.
- There is **no** `IExternalStateClassifier`, **no** `job_dead_letter_events` table,
  **no** requeue operation at all (`RequeueDeadLetterAsync` does not exist).
- `DeadLetterRetentionHandler` deletes purely on `failed_at` age — no status predicate.
- `SystemJobDefinitionSeeder.Spec.cs` explicitly says the prepared-state gauges are "blocked on
  the job_dead_letter.external_state_* columns".

The design doc itself anticipates exactly this: §4.2 "Known code-alignment item (R5-2)":
*"The current 633 job_dead_letter table and JobDeadLetter.FromJob have no external_state_*
columns … adding the columns, the CHECK constraints, the dead-letter-time stamp, and the sweep's
atomic Expired transition belongs to the captain's reconciliation round."* That reconciliation has
not happened. **#863 cannot literally revert R10-1's predicate — it must first create the thing
the predicate lives in.**

## 2. Scope ruling (what this chantier builds — and deliberately does not)

The full §4.2/§5.1/§4.5 machinery (marker column, classifier with savepoint-probed store,
requeue + transfer hooks, expiry/resolution/orphan batches) is Phase 2A–4 work spanning several
chantiers. Rebuilding all of it here would be an unreviewable mega-diff and would duplicate other
lanes' scope. But shipping *only* an operator-triage endpoint would be incoherent: there are no
Unclassified rows to triage without the classification that creates them, no events table to
record the resolution in, and no retention exemption for the endpoint's effect to lift.

**Ruling: build the minimal coherent vertical slice of the external-state contract, centred on
K-1's actual deliverable.**

### In scope

1. **Schema (expand-only migration `AddJobDeadLetterExternalState`)**:
   - `job_dead_letter`: `external_state_status integer NOT NULL DEFAULT 0`,
     `external_state_prepared_at timestamptz NULL`, `external_state_expires_at timestamptz NULL`,
     `external_state_expired_at timestamptz NULL`; CHECKs `ck_job_dead_letter_external_state`
     ((status IN (0,3) AND both bounds NULL) OR (status IN (1,2,4,5,6) AND both bounds NOT NULL))
     and `ck_job_dead_letter_expired_at` ((expired_at IS NULL) = (status <> 2)); partial index
     `ix_job_dead_letter_external_state (external_state_status, external_state_expires_at)
     WHERE external_state_status <> 0`. All existing rows backfill to `0 None` via the default —
     correct: today no writer can produce prepared state.
   - `job_dead_letter_events` evidence table exactly as designed (uuidv7 PK, `dead_letter_id`
     FK ON DELETE CASCADE, `event` text, `detected_by` text, `prior_status` int NULL,
     `new_status` int NOT NULL, `details jsonb DEFAULT '{}'`, `occurred_at timestamptz DEFAULT
     now()`) + `ix_job_dead_letter_events_dead_letter (dead_letter_id, occurred_at)`.
     Engine transitions are actor-less; `audit_logs.user_id` is NOT NULL with an FK to users, so
     they must not go there (design §4.2/R10-3).
   - No data migration beyond the default backfill: no sanctioned writer could have produced
     non-zero states before this ships.
2. **Entity + EF mapping**: extend `JobDeadLetter` with the four columns and add
   `ExternalStateStatus` enum (0 None, 1 Present, 2 Expired, 3 NeverPrepared, 4 Missing,
   5 Transferred, 6 Unclassified — explicit members, no magic strings); new `JobDeadLetterEvent`
   entity + configuration; `DbSet`s in `AppDbContext`.
3. **Retention eligibility + honest reporting**: `DeadLetterRetentionHandler` gains the R10-1/O31
   predicate `external_state_status NOT IN (1, 6)` (bytes-possible rows are exempt until
   resolved), and **counts skipped rows** (age-eligible but bytes-possible), logging one plain-
   words line per pass including the count and cause, so "90-day retention" is never silently
   false. This lands together with the exemption so the starvation class never exists unmanaged.
4. **Operator triage endpoint (the K-1 deliverable)**: staff action
   `POST /staff/dead-letter/{id}/resolve-unclassified` under a new high-gravity permission
   `staff.jobs.dead-letter.resolve` (module Jobs slice permissions). Semantics, fail-closed:
   - Row not found / malformed id → RFC 7807 problem (404/400).
   - Row status ≠ `6 Unclassified` → **409 Conflict**, plain-words cause naming the current
     state (project rule: every failure shows its cause).
   - Status 6 → sets `external_state_status = 4 Missing` (operator asserts absence after
     investigation; the engine never manufactured this claim, a human does), stamps
     `external_state_expired_at = now()`? **No** — expired_at belongs to status 2 only (CHECK);
     the operator path writes status 4 carrying its existing recorded bounds unchanged, plus a
     conditional single-statement transition guarded by `WHERE external_state_status = 6`
     (affected-rows check ⇒ race-safe).
   - Writes one `job_dead_letter_events` row: event
     `dead_letter.external_state.missing`, `detected_by = 'operator'`,
     `prior_status = 6`, `new_status = 4`, details `{ originalJobId, jobType, reason:
     'operator_confirmed_absent', note }` where `note` is an optional operator-supplied bounded
     free-text justification (≤ 500 chars, validated) — the human-readable cause the project
     principle demands, recorded durably.
   - Audit: engine transitions are actor-less, but **this is a staff action with a real actor**
     — it ALSO writes the existing `audit_logs` through `IAuditLogService` (actor, target id,
     details), same split as the design draws for requeue.
   - Once status = 4, the row left `IN (1,6)` and becomes eligible for ordinary age retention
     — the resolution path is complete end-to-end.
5. **Evidence writer seam**: a small internal static helper (`JobDeadLetterEvents`) owning the
   stable event-code constants and the insert shape, so the endpoint, future sweeps, and the
   future classifier share one vocabulary (no magic strings anywhere; codes pinned by spec).
6. **Architecture test pinning the brief's structural requirement**: a spec asserting
   `ExternalStateStatus` has exactly the seven designed members AND that every member maps to a
   documented resolution path entry in a single catalog (`DeadLetterResolutionCatalog`: which
   reader/writer resolves each class — None/NeverPrepared/Missing/Expired/Transferred → age
   retention; Present → prepared-state sweep resolution batch (specified build-grade in the
   design doc, Phase 3 lane); Unclassified → operator triage endpoint). Adding an eighth enum
   member without extending the catalog fails the build — that is the pin.
7. **openapi.json + Kiota client regen** (contract change) + front typecheck gate.

### Out of scope (named, not built)

- `job_queue.external_prepared_at` marker, `IExternalStateClassifier`, probe/savepoint mechanics,
  statuses stamped at dead-letter time (engine still inserts DLQ rows with the default 0 None),
  requeue/transfer hooks, the expiry/resolution/orphan batches of `email-prepared-sends-retention`.
  These belong to the Phase-2A-R/3/4 lanes; this chantier gives them their tables, enums, and
  event vocabulary so they land as deltas, not migrations-of-record.
- K-2 (#864, Missing-row acknowledgement-before-retention) — adjacent but separately filed; the
  triage endpoint's shape (status-guarded conditional transition + operator event) is exactly the
  primitive K-2 will need.
- Any front UI. The client types regenerate; surfaces come later.

## 3. Design decisions and their costs

| # | Question | Decision | Cost stated |
|---|---|---|---|
| D1 | Build full classifier machinery vs minimal vertical slice? | Minimal slice above. The issue's fix direction ("operator resolution writing detected_by='operator'") is fully delivered; the reprobe variant needs the probe that doesn't exist. | Until the classifier lane lands, nothing writes status 6, so the endpoint guards an empty class. That is correct sequencing, not dead code: the schema, guard rails (CHECKs), retention exemption, alert semantics, and resolution path land atomically, so the first real Unclassified row already has its exit. |
| D2 | Why does triage stamp `4 Missing` rather than a new status? | The issue says "classify → one of the existing classes, or resolve with a recorded reason". Stamping an existing class reuses the whole downstream contract (retention eligibility, future requeue rejection `PreparedStateAnomaly`, dashboard counting) instead of inventing an eighth state the design never ratified. | An operator who wrongly asserts absence converts an unknown-presence row into a proven-absent claim. Mitigated by the permission being separate + high-gravity, the mandatory event recording who claimed what and why (note field), and audit_logs carrying the actor. |
| D3 | Retention skip reporting: log line or metric? | Structured log line (count + window + cause) from the handler per pass. Metrics/gauges are the observability lane's territory (EMAIL_PREPARED_SWEEP_MAX_LAG_MINUTES is still blocked on the marker column, out of scope). | A muted log pipeline hides skips; acceptable because the count is also derivable from SQL (`status IN (1,6) AND failed_at < horizon`) and the architecture spec pins it. |
| D4 | Endpoint route home | New `Routes.Jobs` partial (`/staff/jobs/dead-letter/...`)? The repo convention is `/staff/<resource>` roots (audit-logs precedent) — route root `/staff/dead-letter`, tag "Staff Dead Letters", module Jobs owns it. Handler named per scope guard: `ResolveUnclassifiedDeadLetterForStaff`. | One more top-level staff resource family; consistent with AuditLogs precedent. |
| D5 | Events insert mechanism | Parameterless-entity AddAsync via the shared helper inside the handler's DbContext transaction (endpoint path is one SaveChanges transaction; raw-SQL not needed at these volumes). Stable string constants live in the helper; a spec pins the exact wire values. | None material. |
| D6 | Permission key style | Repo uses dot-separated lowercase keys with translations (`audit_logs.list`). Adopt `jobs.dead_letter.resolve` → seeded `staff.jobs.dead_letter.resolve`, EN+FR translations, aggregated into `StaffScopePermissions.Jobs` (new `JobsPermissionsForStaff : ISlicePermissions`) so reflection seeding picks it up automatically. | Staff profiles gain one more assignable permission; harmless pre-UI. |

## 4. TDD plan (paired RED/GREEN proofs for the PR body)

Integration specs over Testcontainers Postgres (real DB, direct-invocation for the handler,
HTTP-level for the endpoint):

1. `DeadLetterRetentionHandlerSpec` additions (RED first): rows at status 0 beyond horizon are
   deleted; rows at 1/6 beyond horizon are KEPT and the pass reports the skip count; a resolved
   (→4) row beyond horizon is deleted again. Paired proof: revert the production predicate hunk →
   RED (status-6 row deleted), restore → GREEN.
2. `ResolveUnclassifiedDeadLetterForStaffSpec` (RED first): happy path 200, status flips 6→4,
   event row exists with detected_by='operator'/prior 6/new 4/note persisted; 404 unknown id;
   409 on status 0 (cause names the state); 403 without the permission; audit_logs row written
   with actor; concurrent-double-resolve second call → 409. Paired proof: revert handler hunk →
   RED (route 404 / assertion failures), restore → GREEN.
3. Migration/snapshot sync asserted by `just build-api` + template-clone boot in the suite.
4. `DeadLetterResolutionCatalogSpec` (architecture pin, pure unit): enum membership == catalog
   coverage, exact event-string values pinned.

## 5. Gates (as CI runs them)

- `~/ai-orchestration-playbook/tools/heavy.sh just build-api` then targeted
  `heavy.sh dotnet test --filter` for touched specs; full API suite once at the end.
- `just ci-drift`; `just check-write` (lint/format); snapshot-in-sync via build.
- Contract changed ⇒ `just generate-client` ⇒ `pnpm --filter front typecheck`.
- Front files untouched ⇒ no front test run required (verification policy).

## 6. Delivery

Small conventional commits: docs(design) → feat(api) migration+entities → test/api specs (RED
proof commit noted in body) → feat(api) endpoint+permission → chore(client) regen. Push
`lane/wt-863`; PR body carries `Closes #863`, implementer/reviewer lines, paired-proof
transcripts, honest Unverified section. Print `DONE <sha>` last.
