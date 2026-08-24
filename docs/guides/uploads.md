# Uploads: admission control and asset lifecycle

Standing rules for storage admission (#807 F1) and the first-class upload asset
table with atomic reference transitions (#807 F5). Source of truth for behaviour;
the implementation lives in `apps/api/Infrastructure/Storage/UploadAdmissionService.cs`
and `apps/api/Modules/Uploads/`.

## Why this exists

The pre-#807 flow counted in-flight bytes in a process-local counter (lost on
restart, wrong across the two deployed processes) and cleaned replaced logos with
an inline `AnyAsync(...)`-then-delete probe. Both shapes had a read-check-write
window: a restart resurrected capacity already spent, and a concurrent re-reference
could lose its blob to a delete that observed zero references a moment too early.
Both guarantees now live in Postgres, enforced by tuple locks — not in process
memory.

## Data model

### `upload_budgets` — config-shaped accounting rows

| Column | Meaning |
| --- | --- |
| `scope_kind` | `10` = Global, `20` = CreatorUser (check constraint `CK_UploadBudgets_ScopeKind`) |
| `scope_key` | NULL for Global, staff user id for CreatorUser |
| `max_bytes` | Ceiling for this scope |
| `reserved_bytes` | Bytes held by open reservations |
| `committed_bytes` | Bytes of durably stored blobs |

A unique index on `(scope_kind, scope_key)` with `NULLS NOT DISTINCT` guarantees
exactly one global row. Rows are **config, not data**: they are seeded idempotently
(`ON CONFLICT DO NOTHING`) from environment variables at first admission, so an
operator-tuned `max_bytes` survives while missing rows self-heal.

### `upload_assets` — one row per admitted blob

Columns: `relative_path` (unique over **live** rows via partial index),
`size_bytes` (> 0 check), `content_type`, `purpose` (snake_case bucket,
e.g. `staff_upload`), `created_by_user_id` (real FK — every byte has an owner),
`state`, `reference_count` (>= 0 check), `delete_not_before`.

Lifecycle (`UploadAssetState`, stored numerically with gaps for future states):

```
Reserved(10) → Stored(20) → Referenced(30) → Orphaned(40) → Deleted(50)
                    ↑______________|
```

All transitions happen inside transactions. `Reserved` rows account their bytes in
`reserved_bytes`; `Stored`/later rows in `committed_bytes` — whatever failure path
led there, the column invariant holds.

### The sweeper: `upload-orphan-reclaim`

Physical deletion NEVER happens inline. The only deleter is the
`upload-orphan-reclaim` background job (`UploadOrphanReclaimerHandler`, jobs module,
registered for both `APP_ROLE=api` and `APP_ROLE=worker`), scheduled hourly at :20
(cron `"0 20 * * * ?"`). Each pass:

1. **Blob-first batch:** selects up to 200 candidates (`state = Orphaned`,
   `reference_count = 0`, `delete_not_before <= NOW()`, not touched for 5+ minutes)
   and deletes each blob through `IFileStorage`. A blob that reports it survived
   leaves its row fully accounted and just gets `updated_at` bumped — a 5-minute
   retry backoff, never an unaccounted byte.
2. **Atomic SQL sweep:** one statement re-states EVERY eligibility predicate under
   `FOR UPDATE SKIP LOCKED` on the asset row (the final TOCTOU recheck), flips the
   row to `Deleted`, and decrements `committed_bytes` by `size_bytes` on the global
   AND creator budget rows in the same statement.
3. **Stale reservations:** `Reserved` rows untouched past
   `UPLOAD_STALE_RESERVATION_TTL_MINUTES` are hard-deleted in a second CTE of the
   same statement, releasing their `reserved_bytes` — the crash-recovery path that
   makes a rolled-back reservation indistinguishable from an abandoned one.
4. **Stored-orphan retention:** unreferenced `Stored` rows (the fail-soft "blob
   MAY exist" path) older than `UPLOAD_STORED_ORPHAN_TTL_MINUTES` join the same
   sweep: confirmed blob removal flips them to `Deleted` and releases their
   committed bytes; a surviving blob leaves them accounted behind the retry
   backoff.
5. **Audit:** each reclaimed asset writes a best-effort
   `upload.asset.deleted` audit entry carrying the cause (grace window expired,
   zero references).

An acquire racing the sweep must wait on the tuple lock; if it commits first, the
sweep's restated predicate no longer matches and the blob stays. This is what makes
the release→reacquire race unlosable.

## Admission (F1): reserve atomically BEFORE the file is opened

`IUploadAdmissionService.BeginReservationAsync(staffUserId, bytes, purpose)`:

1. Opens ONE `Serializable` transaction.
2. Seeds any missing budget rows for the global scope and this creator.
3. Adds `bytes` to `reserved_bytes` with a **conditional UPDATE**
   (`max_bytes - reserved_bytes - committed_bytes >= bytes`). Zero rows updated =
   refused; the rejection carries the exhausted scope plus used/requested/max so the
   RFC 7807 response can name the cause in plain words.
4. Inserts the `upload_assets` row in `Reserved` state inside the same transaction.
5. Returns an `UploadAdmissionScope` that OWNS the transaction: Postgres holds the
   budget-row locks until the scope resolves, so no concurrent admission can act on
   stale numbers.

There is no read-check-write window left to race; concurrent admissions serialise
on the budget tuples. Serializable aborts (SQLSTATE `40001`/`40P01`) are retried
with randomised exponential backoff inside the service — a serialization failure is
a scheduling event, never an admission verdict surfaced to the caller.

Fail-closed: a missing or unreadable budget row rejects admission instead of
admitting unbounded bytes.

### Resolving a reservation

- **Commit** (blob durably written and audited): `MarkCommitPending()` then
  `CommitAsync()` flips the asset to `Stored`, moves `reserved_bytes` →
  `committed_bytes` on both scopes, commits.
- **Failure with confirmed cleanup**: disposing the scope (or `FailAsync(releaseBudget: true)`)
  rolls back — reservation and asset row vanish, bytes return to both budgets.
- **Failure where the blob MAY exist**: `FailAsync(releaseBudget: false)` keeps the
  bytes accounted for as a `Stored` orphan rather than releasing capacity this
  deployment cannot bound.

## References (F5): atomic acquire/release, no TOCTOU delete

`IUploadAssetReferenceService` runs single conditional UPDATE statements against the
caller's `AppDbContext`, so they join the caller's ambient transaction and commit
atomically with the entity write (tenant logo replace/clear, avatars):

- **Acquire** (`TryAddReferenceAsync`): `reference_count + 1`, state → `Referenced`,
  clears `delete_not_before`. Allowed only from `Stored`/`Referenced` live rows —
  the state predicate is part of the UPDATE's WHERE clause, so check and increment
  are one step on the locked tuple.
- **Release** (`TryReleaseReferenceAsync`): decrements; when the count reaches zero
  the row transitions to `Orphaned` with `delete_not_before = NOW() +
  UPLOAD_ORPHAN_GRACE_DAYS`.
- A missing asset row is NOT an error: URLs persisted before this table existed
  (and absolute http(s) URLs) legitimately have no row; the transition reports
  `false` and callers proceed best-effort.
- **Fail-soft commit** (`CommitAsync` failure or `FailAsync(releaseBudget: false)`):
  bytes stay accounted as an unreferenced `Stored` row — the sweeper's
  `UPLOAD_STORED_ORPHAN_TTL_MINUTES` retention window is what eventually reclaims
  them, so no failure path leaks capacity forever.

Physical deletion NEVER happens inline. The sweeper is the only
deleter: it may remove a blob only after `delete_not_before` AND a final
`reference_count == 0` recheck under the row lock. An acquire that commits after a
release's predicate ran must wait on the tuple lock, so "zero references" observed
by anyone can never hide an in-flight re-reference. See the sweeper section above
for the job's identity, schedule, and stale-reservation recovery.

## Environment variables

| Variable | Default | Meaning |
| --- | --- | --- |
| `UPLOAD_MAX_BYTES` | `2000000` | Per-request file size cap (request validation) |
| `UPLOAD_GLOBAL_MAX_BYTES` | `1073741824` | Global durable byte budget |
| `UPLOAD_PER_STAFF_MAX_BYTES` | `104857600` | Per-creator durable byte budget |
| `UPLOAD_ORPHAN_GRACE_DAYS` | `7` | Grace period before sweeper deletion |
| `UPLOAD_STALE_RESERVATION_TTL_MINUTES` | `60` | Age at which an abandoned `Reserved` row is hard-deleted and its hold released (1–10080) |
| `UPLOAD_STORED_ORPHAN_TTL_MINUTES` | `1440` | Retention window for unreferenced `Stored` rows before the sweeper reclaims them (5–20160) |
| `UPLOAD_RATE_LIMIT_PERMIT_LIMIT` / `UPLOAD_RATE_LIMIT_WINDOW_SECONDS` | `20` / `60` | Endpoint rate limit (see [api-rate-limiting.md](api-rate-limiting.md)) |

Deployed values come from the PaaS secrets configuration; see
[`production-deploy-runbook.md`](../deployment/production-deploy-runbook.md).

## Proof (specs)

- `UploadAdmissionService.Spec.cs` — boundary refusal, per-creator independence,
  release-on-failure, durability across fresh instances, and two parallel-context
  storms (creator-bound and global-bound) proving no over-admission against real
  Postgres.
- `UploadAssetReferenceService.Spec.cs` — deterministic two-context TOCTOU proofs
  (a probe transition must BLOCK behind an open transaction holding the row, then
  re-evaluate), post-orphan acquire refusal, and a parallel storm conserving counts.
- `CreateStaffUpload.Failure.Spec.cs` / `UploadAdmissionEndpoint.Spec.cs` — HTTP-level
  failure paths and transparent problem details.
- `UploadOrphanReclaimerHandler.Spec.cs` — real-blob reclamation releasing both
  scopes, audit-with-cause, grace-window/retention-window and referenced-row
  protection (the locked final recheck), stale-reservation hard delete,
  idempotence, the blob-survives backoff path, and the lowered-ceiling recovery
  scenario (refuse → reclaim → admit again) against real Postgres.
- `UploadBudgetAccounting.Spec.cs` — the accounting invariant:
  `committed_bytes == Σ size_bytes over live Stored+ rows` holds before and after
  the ONLY legitimate decreaser runs, globally and per creator.

The concurrency specs go red against the pre-F5 read-then-write shape (verified on
a scratch revert); they are the paired proof that the guarantee is real.
