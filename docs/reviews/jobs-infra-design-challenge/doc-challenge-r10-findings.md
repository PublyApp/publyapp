# PR #852 jobs/worker design challenge — Round 10

Reviewed `jobs-worker-infrastructure.md` at `9028313a` in full, followed by a
second cross-reference/state-machine pass over schemas, retention jobs,
observability, build packets, gates, supersession annotations, and the
ratification record. I also inspected the `e733edf7..9028313a` remediation diff
and relevant `origin/feat/633-job-queue-core`,
`origin/feat/634-app-role-quartz`, and `origin/feat/809-email-jobs-fold` blobs
statically. No builds, tests, containers, database operations, checkouts,
source edits, or Obsidian writes were performed.

## Fresh findings

### R10-1 — merge-blocker — the independent DLQ retention sweep can destroy the owner of prepared bytes before their durable cutoff

**Doc:** §3.1 lines 254–258; §4.2 lines 975–983; §4.5 lines 1600–1647;
§7.3 lines 3348–3385.

The new `IN (1, 6)` predicate repairs the hole *while the DLQ row exists*, but
`job-dead-letter-retention` is independently specified as a global
`failed_at` sweep. It has no exclusion for `Present`/`Unclassified` rows and no
ordering or validation relationship with `EMAIL_PREPARED_SEND_RETENTION_DAYS`.
Both windows are operator-configurable.

A valid configuration can therefore delete a status-1/6 DLQ row before its
recorded `external_state_expires_at`. The prepared row immediately becomes an
“orphan,” and the orphan batch then uses `prepared_at +` the **current**
`EMAIL_PREPARED_SEND_RETENTION_DAYS`, not the lost row's durable cutoff. A
subsequent retention change can delete those bytes before the recorded cutoff
or retain them after it. Even with unchanged defaults, sweep ordering can erase
the DLQ row before the prepared sweep can atomically write `Expired` and its
audit evidence. This contradicts prospective retention, the advertised single
authoritative cutoff, and the claim that the 90-day DLQ row remains inspectable
after prepared bytes expire.

This is the same privacy/integrity class as R9-2: one retention job silently
removes the row that makes the other retention job safe.

**Concrete fix:** make `job-dead-letter-retention` ineligible to delete any
unresolved bytes-possible row (`external_state_status IN (1, 6)`) until the
prepared-state transition has resolved it to `Expired`/`Transferred`/another
bytes-impossible state. Do not solve this only with a default-duration
relationship; persisted rows must remain safe across config changes and sweep
ordering. Add adversarial specs with DLQ retention shorter than prepared
retention, both sweep orders, and retention changes in both directions.

### R10-2 — major — the document still claims an exact physical deletion instant that an asynchronous sweep cannot enforce

**Doc:** §4.2 lines 877–888; §4.5 lines 1600–1613, 1631–1633, and
1660–1704; §9 lines 3568–3569; O29 lines 4527–4531.

The SQL makes a row **eligible** when
`external_state_expires_at <= now()`; it does not execute at that instant. The
sweep runs periodically and loops only once invoked. §4.2 itself correctly
mentions “the asynchronous sweep has not reached this row yet,” yet §4.5 says
the displayed cutoff, requeue cutoff, and instant the bytes “actually die” are
one value and “cannot disagree.” O29 similarly says bytes are deleted “at seven
days.” A delayed/failed sweep—or the store outage that produced
`Unclassified` persisting through the cutoff—makes that false.

The **requeue cutoff** is exact because the command gates on the stored clock.
Physical deletion is eventual on the first successful sweep/requeue cleanup at
or after that cutoff. The current document conflates those properties and has
no prepared-sweep last-success/lag signal to bound or expose the difference.

**Concrete fix:** weaken every physical-deletion claim to the property the SQL
enforces; specify the sweep recurrence and an explicit maximum operational lag,
then expose and alert on last successful completion / oldest overdue
status-1-or-6 row. Preserve the stronger exact statement only for requeue
eligibility. Add a spec where the sweep is unavailable through the cutoff and
prove both the fail-closed requeue result and eventual cleanup after recovery.

### R10-3 — major — “classification-time audit” is still an assertion with no writer in the terminal algorithm

**Doc:** §4.2 lines 722–730 and 779–787; §4.5 lines 1691–1701; §5.1 lines
2287–2310 and 2509–2540; §9 lines 3561 and 3574; §10 lines 3621–3631.

The design repeatedly requires `Unclassified` (and integrity-failure
`Missing`) to be audited. The expiry audit relies on that earlier row to
preserve why status 6 later became status 2, and the dashboard is told to point
operators at the audit trail. But the normative five-step terminal transaction
is: create DLQ entity → classify/apply → optional handler hook → insert DLQ →
fenced delete. No step creates or inserts an `AuditLog`; the classifier returns
only a triple, and the build packet names no classification audit writer,
action, or metadata contract. Tests demanding an audit row do not specify the
mechanism that produces it.

**Concrete fix:** add an explicit engine-owned terminal step that constructs
the classification audit event after applying the triple and inserts it
atomically with the DLQ row. Define stable action codes and safe metadata for at
least `Missing` and `Unclassified`, identify the owning file/service, and test
that DLQ insert, audit insert, and fenced delete commit or roll back together.
The expiry spec must join the classification event by a specified stable key,
not by narrative intent.

### R10-4 — major — `Unclassified` has a gauge but no warning condition or alert route

**Doc:** §5.1 lines 2548–2557; §7.2 lines 3246–3288; §9 lines 3574–3575;
O29 lines 4523–4531.

The sampler adds `dlq_external_state_unclassified` and says Missing and
Unclassified “page differently.” The warning-condition list, however, only
defines `dlq_external_state_missing > 0`. Phase 3's leased webhook path consumes
warning breaches, so merely sampling a second gauge does not create a condition
key, severity, persistence rule, lease window, or notification. The test table
likewise proves only Missing alerting. A fleet-wide store outage can therefore
accumulate status-6 rows without the promised page.

**Concrete fix:** define a separate
`dlq_external_state_unclassified > 0` condition, including its persistence
window, stable `condition_key`, aggregation, recovery behavior, and message.
Wire it through the alert-delivery lease and add a fresh-monitor test plus a
multi-replica one-notification test. It should also carry the overdue-sweep
signal required by R10-2 so an outage persisting through expiry is visible.

### R10-5 — major — the supposedly exact savepoint exception boundary is still an undefined helper

**Doc:** §5.1 lines 2298–2346 and 2533–2546; §9 lines 3561–3562; §10 lines
3621–3631.

The savepoint is the correct enforcing primitive, but
`IsRecoverableStatementError(ex)` is never defined. The table says a live
statement error is contained while `57P01` admin termination is not, even
though both arrive through the shown `PostgresException` catch surface. It also
does not state how cancellation SQLSTATEs such as query cancellation are kept
distinct from a store-integrity anomaly. “Live connection” is a conclusion the
implementation must calculate, not an executable predicate supplied by this
reference.

Consequently an implementer still has to re-derive the most load-bearing part
of O28: which SQLSTATE/severity/connection combinations may be rolled back to
the savepoint and converted to `Unclassified`, and which must escape. The
current two-direction tests cover examples, not the predicate's total contract.

**Concrete fix:** specify the actual classifier predicate: an explicit
allowlist or exhaustive category/denylist over SQLSTATE, severity, cancellation
origin, and connection usability. Name the production helper and add boundary
tests for `42P01`, `42501`, `57P01`, client/host cancellation, command timeout,
lost socket, already-aborted outer transaction, and rollback-to-savepoint
failure. Do not label the table “exact” until those cases map mechanically.

### R10-6 — minor — the Phase 2C gate restates both corrected PREPARE controls in their superseded forms

**Doc:** §9 lines 3556 and 3559; §10 lines 3829–3837.

The detailed specs correctly use `pg_blocking_pids(B)` plus
`pg_stat_activity`, and a pre-committed winner at `now() - interval '1 hour'`.
The authoritative Phase 2C gate still says B is proved blocked “via `pg_locks`”
and retains the false “independent-`now()` → marker != prepared_at” control.
That is current build-order text, not a struck chronological record.

**Concrete fix:** make the gate cite the detailed specs without rephrasing, or
replace both summaries with the corrected blocker observation and deterministic
one-hour-offset mutation.

### R10-7 — minor — the cleanup prose says a later reader resolves `Unclassified`, while every specified reader deliberately leaves it unresolved

**Doc:** §4.2 lines 860–879; §4.5 lines 1718–1729.

Requeue rejects status 6 without probing or writing. The sweep changes status 6
only when its join finds and deletes bytes; if the row is absent it leaves status
6 untouched. Nevertheless §4.5 says “any later reader stamps `4 Missing`” and
that the sweep resolves the ambiguity. Neither is true for `Unclassified`.

**Concrete fix:** state that only a `Present` reader stamps Missing on absence;
an absent status-6 row intentionally remains Unclassified until explicit operator
triage. If automatic reclassification is desired, specify a real reprobe path
and its savepoint/audit semantics.

## R9 finding verification

| Round-9 finding | Grade | Round-10 judgment |
| --- | --- | --- |
| R9-1 — caught probe error left the terminal transaction aborted | **Weakened** | The named savepoint and rollback-to-savepoint genuinely restore the transaction for contained statement errors, and the real `42P01` red control is strong. The required “exact exception boundary” remains an undefined `IsRecoverableStatementError` policy (R10-5). |
| R9-2 — probe-failure `Missing` stranded sensitive bytes | **Mis-absorbed** | `6 Unclassified`, the CHECK, and `status IN (1, 6)` correctly cover the direct hole. But the document calls that predicate the enforcing artifact while the independent DLQ retention sweep can delete the predicate's owning row first, recreating early/late retention and audit loss (R10-1); it also still overclaims exact physical deletion (R10-2). |
| R9-3 — executable expression defeated structural blindness | **Absorbed** | The selector is deleted. `ExternalStateStore<TScratch>(TimeSpan Retention)` has no code-bearing member; the engine owns the EF predicate, uses `IgnoreQueryFilters()`, and the startup gate enforces the deliberately narrow one-`Guid JobId` model shape. |
| R9-4 — impossible post-settlement orphan schedule | **Absorbed** | The dedicated Transfer registration with a lock-free hook creates a production-reachable schedule. The main run and return-on-zero mutation break exactly the claimed rowcount-or-rollback property. |
| R9-5 — wrong PostgreSQL lock observation | **Weakened** | The detailed spec correctly uses backend PIDs, `pg_blocking_pids`, and `pg_stat_activity`. The Phase 2C gate still repeats the obsolete `pg_locks` summary (R10-6). |
| R9-6 — same-transaction `now()` control was vacuous | **Weakened** | The detailed replacement uses a pre-committed timestamp one hour earlier and is deterministic. The Phase 2C gate still mandates the superseded independent-`now()` control (R10-6). |
| R9-7 — caller identity overclaim | **Absorbed** | The invariant is now target entitlement only. A Standard target is rejected by persisted policy; the cross-job case is correctly attributed to the token fence, and caller authentication is explicitly not claimed. |

## Weakened-claim audit

| Author-reported claim change | Judgment |
| --- | --- |
| 1. Absolute “classification cannot fail settlement” narrowed to recoverable statement errors | **Direction accepted, mechanism incomplete.** The savepoint makes the narrowed property possible, but the undefined recovery predicate prevents the boundary from being build-grade (R10-5). |
| 2. “No type IL executes” deleted with the expression; “no field can carry code” retained | **True.** The record's only value member is `TimeSpan`; registration cannot smuggle a delegate/expression through this descriptor. Engine and EF code still execute, but the document no longer denies that. |
| 3. “A Standard registration cannot reach writer 1” withdrawn | **True after narrowing.** The surviving target-row guarantee is exactly what the persisted-type guard enforces. |
| 4. “Rejected on that job's persisted type” corrected to fence-first rejection | **True.** Guard 2's zero-row fenced read fires before another target's type can be read. |
| 5. “Matching DLQ protects bytes exactly until recorded expiry” fixed in SQL | **Still false.** The prepared sweep reads the right boundary, but `job-dead-letter-retention` may delete the matching row first, and a periodic sweep cannot guarantee deletion at the exact instant (R10-1/R10-2). |
| 6. Integrity-failure rows have no registered store and claim no retention cap | **True.** Marker-set Standard/unregistered rows are conservative zero-length-window anomalies; the document now states the residue instead of pretending a store sweep exists. |

## Decision rulings and author self-catches

- **O27:** accept. Removing the expression is stronger and simpler than keeping
  an allowlisted expression walker. The rejected tree-validation fallback was
  technically viable, but the rejection is not evasive: a data-only record is a
  smaller enforcing surface. The single-`Guid JobId` limitation and future Epic-D
  engine-change cost are stated honestly.
- **O28:** accept the savepoint and the narrowed scope. A separate connection
  would lose the terminal transaction's observation/order, so rejecting it is
  sound. R10-5 requires the promised narrow boundary to become executable; it
  does not invalidate the savepoint decision.
- **O29:** accept a distinct `Unclassified` state and reject reuse of `Missing`.
  “Absent” and “unknown” demand different operations, metrics, and incident
  response; merging them would make the Missing gauge ambiguous. The seven-value
  decision table and CHECK are total. R10-1/R10-2/R10-4 are integration defects
  around retention and paging, not an argument to collapse the state.
- **Expression-tree fallback rejection:** sound. An exhaustive denylist is
  fragile; a tiny direct-member allowlist could work, but it buys expressiveness
  the current system does not need and is still weaker than carrying no code.
- **Missing-reuse fallback rejection:** sound. Widening the sweep to
  `IN (1, 4)` would retain privacy safety but destroy the operational distinction
  between proven loss and unknown presence.
- **Seven-row count / seventh-value corrections:** closed. The decision table
  has seven rows and the enum has values 0–6.
- **Translation-failure correction:** closed. Client translation failure is no
  longer mislabeled as a `PostgresException` or claimed to abort the transaction.
- **`IgnoreQueryFilters()` self-catch:** closed. A global entity filter cannot
  make a present prepared row look absent to the engine-built probe.

## Attacked and held

- The savepoint—not the catch—restores PostgreSQL transaction usability after
  contained statement errors. The dropped-table/no-savepoint mutation is a
  meaningful red control.
- The descriptor is genuinely data-only, and its EF-model gate prevents every
  registrable shape except one mapped `Guid JobId` primary key. No type-supplied
  executable classification surface remains.
- The seven-state model is total under its stated writer branches. Status 6
  carries real marker-derived bounds, satisfies the CHECK, rejects requeue
  fail-closed, and is not conflated with proven absence.
- The prepared-sweep CTE itself preserves DLQ→prepared lock order. Under a
  surviving DLQ row, concurrent requeue and sweep serialize without a reverse
  acquisition, and `DELETE → UPDATE → audit INSERT` makes `Expired` evidence
  honest for rows it actually purges.
- The production-reachable orphan schedule no longer combines incompatible
  handler histories. Its no-token, return-on-zero, and fixed-timestamp controls
  each mutate one mechanism and fail for the stated reason.
- Target entitlement is now the only marker authorization claim, and the
  persisted-type guard plus token fence enforce it. Caller identity is not
  smuggled back into the prose.
- The 633/634 gaps—descriptor/classifier/marker, epoch/catalog, cron misfire,
  lease-alignment work—remain explicitly labeled as captain-alignment items.
  The 809 compound fold marker and old-dispatcher claim predicate match the
  branch artifact; its remaining fold gaps are also labeled rather than claimed
  shipped.
- O18's schedule-epoch reversal, C8 shutdown semantics, prospective schedule
  revisions, R1→R2 quiescence, APP_ROLE composition, LISTEN broadcast topology,
  migration role pinning, and at-least-once alert delivery remain consistent and
  were not reopened.

CHALLENGE: NOT MERGE-READY (1 merge-blockers, 4 majors)
