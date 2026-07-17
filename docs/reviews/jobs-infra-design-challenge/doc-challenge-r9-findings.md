# PR #852 jobs/worker design challenge — Round 9

Reviewed `jobs-worker-infrastructure.md` at `e733edf7` in full, followed by a
second cross-reference/contradiction pass over headings, section references,
supersession annotations, build packets, tests, and the ratification record. I
also inspected the remediation diff and the relevant branch shapes statically.
No builds, tests, containers, database operations, checkouts, source edits, or
Obsidian writes were performed.

## Fresh findings

### R9-1 — merge-blocker — O25 cannot recover the terminal transaction after its own SQL probe fails

**Doc:** §5.1 lines 2151–2154 and 2323–2340; §9 line 3330; O25 lines
4070–4093.

The classifier deliberately runs its `AnyAsync` probe through the same scoped
`AppDbContext` and terminal transaction. The required residue test then makes
that query fail by pointing it at a dropped table. In PostgreSQL, that SQL error
aborts the transaction. Catching the .NET exception does not restore it, so the
subsequent audit insert, DLQ insert, fenced delete, and commit cannot proceed.
The job rolls back and re-leases—the exact infinite-loop class O25 says is
structurally impossible.

EF Core's automatic savepoint behavior applies around `SaveChanges`; this is a
failing query, and the document specifies no manual savepoint. EF's own
transaction guidance uses an explicit savepoint plus rollback-to-savepoint when
work must continue after failure, and PostgreSQL defines rollback-to-savepoint
as restoring the enclosing transaction to a usable subtransaction state:
[EF Core transactions](https://learn.microsoft.com/en-us/ef/core/saving/transactions),
[PostgreSQL `ROLLBACK TO SAVEPOINT`](https://www.postgresql.org/docs/current/sql-rollback-to.html).

**Concrete fix:** make the probe a named subtransaction: create a savepoint
immediately before it, release it on success, and on a recoverable statement
error roll back to it before constructing/auditing `Missing`. Specify and test
the exact exception boundary. A lost/broken connection or an unrecoverable
outer transaction cannot be converted to `Missing`; document that it follows
ordinary settlement retry. The test must use the real dropped-table error and
prove the DLQ insert and fenced delete commit after rollback to the savepoint.

### R9-2 — merge-blocker — probe-failure `Missing` can retain sensitive prepared bytes for 90 days instead of seven

**Doc:** §4.2 lines 719–725 and 775–795; §4.5 lines 1563–1577 and 1606–1634;
§7.3 lines 3139–3154; §5.1 lines 2327–2340.

O25 maps a failed probe to status `4 Missing`, even though the prepared row may
actually exist. The prepared-send DLQ sweep selects only
`external_state_status = 1` (line 1612). The orphan batch deletes only rows
matching neither a live queue row nor a DLQ row (lines 1565–1575), so the
still-present bytes behind a `Missing` DLQ row are not orphans either. They are
therefore protected until the 90-day DLQ row disappears, contradicting the
seven-day sensitive-byte cap and the prose claim that a matching DLQ protects
bytes “exactly until” its recorded expiry.

This is not theoretical: the mandated dropped-table/transient-probe-failure
residue is exactly a path where classification lacks evidence of absence. It
trades the lease loop for a privacy/retention violation and makes the SQL disagree
with §4.5's normative prose.

**Concrete fix:** represent probe unavailability separately from proven absence
(for example `ProbeFailed`/`Unclassified`, carrying the marker-derived prepared
and expiry bounds). Requeue remains fail-closed, but the prepared-state sweep
must include that state and, when bytes exist at the recorded cutoff, atomically
delete them, stamp `Expired`, and preserve the earlier anomaly in audit history.
Add a control with a forced probe failure while the prepared row really exists;
after the recorded seven-day cutoff the bytes must be gone without waiting for
DLQ retention. If the design insists on reusing `Missing`, the sweep must at
minimum include `status IN (1, 4)` and preserve why status 4 was written.

### R9-3 — major — `Expression<Func<TScratch, Guid>>` does not make “no type-supplied code executes” structural

**Doc:** §5.1 lines 2061–2109 and 2186–2191; §9 line 3303; O24 lines
4028–4069.

The descriptor is materially safer than the deleted writable delegate, but its
advertised property is stronger than its type. C# expression lambdas may contain
method calls, and EF evaluates parameterizable parts on the client while
translating the rest. A selector can close over an object or contain a method
call; the API does not constrain its body to the direct mapped scalar access
`s => s.JobId`. Therefore “no type IL executes,” “a throw has no method body to
live in,” and “the type supplies no code that runs” are not guaranteed by the
signature. The one-time startup query proves only that one evaluation translated
and returned; it neither proves the expression shape nor forbids side effects in
client-evaluated parameter extraction. See the C# language documentation that
explicitly permits method-call expression bodies and EF's client/server
evaluation description:
[C# lambda expressions](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/operators/lambda-expressions),
[EF Core client evaluation](https://learn.microsoft.com/en-us/ef/core/querying/client-eval).

**Concrete fix:** make the descriptor genuinely data-only. Prefer engine metadata
for a required mapped `Guid JobId` member (or an engine-owned interface/property
contract) and build the `EF.Property<Guid>` predicate itself. If the expression
API is retained, validate its tree at composition as exactly a direct
`MemberExpression` rooted at the lambda parameter, with no calls, indexers,
closures, navigation, constructors, invocation nodes, or arbitrary conversions.
Add hostile method-call and captured-instance descriptors that must fail the
shape gate before any query executes.

### R9-4 — major — the post-settlement orphan control still combines mutually exclusive lifecycle shapes

**Doc:** §5.1 lines 2297–2357; §9 line 3327.

Owner A is already inside a valid email handler's PREPARE path, which means this
immutable job type/payload resolved, validated, and reached a handler. The test
then asks the engine to settle that same row “invalid-before-handler.” That shape
exists only for unknown type, JSON failure, or pre-handler payload rejection.
The same stored row cannot simultaneously satisfy both histories, and the text
does not specify an intervening mutation that would make the second history
real. Calling an internal settlement helper with an impossible flag would test a
helper, not the production interleaving the gate claims.

**Concrete fix:** use a production-reachable terminal path that does not need A's
domain lock—for example a dedicated test `TransferExternalEffectState`
registration whose handler-reached terminal hook is lock-free—or explicitly
make this a lower-level fenced-delete mutation test and stop calling it an
invalid-before-handler engine schedule. Preserve the required red control:
returning normally on zero rows must commit the orphan, while the real seam must
rollback it.

### R9-5 — minor — the reclaimed-owner test observes the wrong PostgreSQL lock object

**Doc:** §9 line 3325.

The schedule is now constructible, but the assertion “`pg_locks` … `granted =
false` on that tuple” is not reliable. PostgreSQL stores row locks in the row;
a waiter normally appears in `pg_locks` as waiting on the holder's transaction
ID, not as an ungranted tuple lock. PostgreSQL recommends
`pg_blocking_pids()` for identifying the blocker:
[PostgreSQL `pg_locks`](https://www.postgresql.org/docs/current/view-pg-locks.html).

**Concrete fix:** identify A and B's backend PIDs, assert B is active with a lock
wait and `pg_blocking_pids(B)` contains A; optionally assert B's ungranted
`transactionid` lock. Do not require a tuple-shaped `pg_locks` row.

### R9-6 — minor — the retained independent-`now()` control does not force unequal timestamps

**Doc:** §4.5 lines 1406–1412 and 1508–1519; §9 line 3328.

The control says replacing the row-derived timestamp with an independent
database `now()` yields `marker != prepared_at`. PostgreSQL `now()` is the start
time of the current transaction and does not advance within that transaction,
so a scratch defaulted with `now()` and a later marker-side `now()` in the same
PREPARE transaction normally remain exactly equal. The control does not prove
the main equality assertion is non-vacuous:
[PostgreSQL date/time functions](https://www.postgresql.org/docs/current/functions-datetime.html).

**Concrete fix:** mutate to `clock_timestamp()`/an app timestamp, or pre-create
the conflict winner in an earlier committed transaction and then stamp with the
new transaction's `now()`. State the interleaving that guarantees inequality.

### R9-7 — minor — the cross-job `Standard` marker test claims a caller-identity guarantee the seam does not implement

**Doc:** §4.5 lines 1450–1461; §5.1 lines 2170–2180; §9 line 3329.

The guard proves the **target row's** persisted policy. It does not know the
caller's registration. A `Standard` handler passing another Transfer job's id
and that target's matching token would satisfy the documented guard; passing its
own token with the other id fails before any persisted type is read, so it is not
rejected “on that row's persisted type.” The core invariant—no sanctioned marker
on a Standard target row—still holds, but this extra test and the sentence “a
Standard registration cannot reach writer 1” overclaim caller identity.

**Concrete fix:** limit the invariant/spec to stamping the current Standard
target row, which the persisted-policy guard genuinely rejects. If caller
identity is required, remove `JobId`/`LockToken` from caller-controlled args and
bind the seam to the current engine execution context; otherwise delete the
cross-job case and describe the seam as target-entitlement enforcement.

## R8 finding verification

| Round-8 finding | Grade | Round-9 judgment |
| --- | --- | --- |
| R8-1 — classifier blindness/failure safety | **Mis-absorbed** | The writable payload-bearing delegate is genuinely gone and the seven decision branches are specified. But O24's selector remains executable in shape, O25 cannot continue its PostgreSQL transaction after the mandated SQL error, and probe-failure `Missing` strands possibly-present bytes outside the seven-day sweep. The design says these properties are structural while its specified mechanisms do not deliver them. |
| R8-2 — constructible PREPARE controls | **Weakened** | The main A/B domain-lock schedule is now feasible, and the no-token control now demonstrates stale bytes adopted under B rather than inventing an orphan. The separate orphan control still uses an impossible valid-handler/invalid-before-handler history, and its lock-observation detail targets the wrong `pg_locks` object. |
| R8-3 — marker invariant enforcement and phase ownership | **Absorbed** | `IExternalPreparedMarker`, ambient-transaction enforcement, persisted target-policy lookup, fenced write, rollback-before-throw, and 2A-R ownership are mechanisms. The core target-row invariant holds. R9-7 narrows an additional caller-identity overclaim; it does not undo the absorbed target-policy fix. |
| R8-4 — marker timestamp summaries | **Weakened** | Current normative prose consistently derives the marker from the committed scratch row and marks the old O20 wording superseded. The retained non-vacuity control still relies on the false premise that two same-transaction PostgreSQL `now()` calls differ. |
| R8-5 — fourth-capability placement summary | **Absorbed** | §8, §10, and the current R8 ratification entry identify the descriptor, engine classifier, startup checks, and 2A-R/2C ownership. The later R7-labelled chronological paragraph still uses its historical “classifier” wording, but §11 explicitly says chronological entries preserve that round's state; it is not current authority. |

## Decision rulings and author self-catches

- **O24:** accept the direction and the stated expressiveness cost; reject the
  claim that the current `Expression<>` signature completes enforceability. A
  direct-member shape gate or data-only mapped-property descriptor is required.
- **O25:** accept fail-closed terminal classification over an infinite lease
  loop, but reject the current mechanism. It needs recoverable transaction
  isolation (savepoint) and a retention-safe durable state for “probe failed;
  bytes unknown.” Mapping every failure directly to `Missing` is not sound.
- **O26:** accept. Reading the target's persisted type under lock, fencing the
  update, and rolling back before every throw make the target-row entitlement
  real. The extra lock cost and order are honestly stated. R9-7 only removes a
  caller-identity claim the mechanism never needed for target integrity.
- **Self-caught direct `job_queue` write:** closed. The handler calls an
  engine-owned seam and 2A-R owns it; F15 is preserved.
- **Self-caught invented contract-violation branch:** closed. Marker-set
  Standard/unregistered rows fit the CHECK as audited `Missing` without coupling
  the engine to an email retention variable.
- **Self-caught rollback-by-promise defect:** closed for `StampAsync`; the seam
  rolls back before throwing. This does not cure R9-1, which is a different
  query-error path inside terminal settlement.
- **Self-caught stale chronological claim:** the R7 wording is marked historical
  and the current R8 entry states descriptor-not-delegate. The current sections
  are clear.
- **Self-caught diff-count correction:** the document's net change is +484 lines
  (`682` insertions, `198` deletions); the corrected count is accurate.
- The prompt does not identify the content of self-caught draft items 2, 4, 5,
  and 7, and the pre-submit draft is not an artifact available for static
  comparison. I found no additional live-section regression attributable to
  them, but I cannot independently grade unseen draft-only changes.

## Attacked and held

- The R8-2 primary reclaimed-owner schedule is now possible: A does not lock
  `job_queue` before B's reclaim, B then waits on A's domain lock, and A's stale
  token loses before scratch can commit.
- The no-token control now breaks the mechanism it says it breaks: A's bytes can
  commit under B's ownership. It no longer falsely calls that state an orphan.
- On `ON CONFLICT DO NOTHING`, the marker uses the conflict winner's persisted
  `prepared_at`; stale owners cannot move the marker or commit scratch when the
  fence is enforced.
- Marker NULL/set, policy, and store-existence branches form a total six-status
  model for ordinary successful probes. `NeverPrepared` is no longer inferred
  from scratch absence, and the marker is carried across transfer.
- Startup capability pairing is total: Transfer requires both transfer hook and
  descriptor; Standard permits neither; catalog/definition/handler closure
  remains fail-closed.
- 2A-R owns the marker seam, descriptor, classifier, gate, and terminal order;
  2C-R1 only registers the email store and calls the seam. The captain-alignment
  gaps are flagged as code lag, not misrepresented as shipped behavior.
- The global lock orders remain acyclic across definition/occurrence,
  DLQ/prepared, and PREPARE's domain/scratch/queue ordering.
- O18's epoch reversal, prospective expiry, R1→R2 rollout boundary, LISTEN
  topology, APP_ROLE composition, migration role pinning, alert delivery
  honesty, and the previously accepted C8 shutdown semantics remain internally
  consistent in the current sections.

CHALLENGE: NOT MERGE-READY (2 merge-blockers, 2 majors)
