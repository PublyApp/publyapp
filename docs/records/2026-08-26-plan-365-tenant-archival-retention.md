# Tenant archival & data-retention semantics (#365) Implementation Plan

> Lane `wt-365`, 2026-08-26. Outcome (c) of triage: the issue asks for a product/API decision
> document, not a patch. This record IS that decision document, plus bite-sized TDD phases that
> future lanes execute. Each phase lands as its own `Part of #365` PR tracked by its own issue.

**Goal:** Define what "archive", "delete", "restore", and "retain" mean for a tenant and its owned
data, decide them against the eight open questions in #365, and lay out the smallest set of
implementation phases that make those decisions executable and testable — closing the `DEFERRED`
marker that the retired smoke-test checklist pinned on #365 (section `9.4 Tenant
archival/data-retention logic`, status `DEFERRED`, "Tracked by `#365`" in the pre-prune file
`docs/misc/tenant-module-smoke-test-checklist.md`, removed by the docs prunes #988/#1395).

**Current behavior this plan starts from** (all symbols on `develop` at planning time):

- `TenantStatus { Pending = 10, Active = 20, Suspended = 30 }` in
  `apps/api/Modules/Tenants/Entities/Tenant.cs`; no `Archived` value. Soft-delete comes from
  `BaseAttributes.IsDeleted` / `DeletedAt`.
- `Suspend()` / `Reactivate()` are reversible transitions Active↔Suspended.
- `TenantAsStaffService.DeleteTenantAsync` soft-deletes ONLY the tenant row (single
  `ExecuteUpdateAsync` on `IsDeleted`/`DeletedAt`), guarded on `Status == Suspended`. No
  tenant-owned row is touched.
- There is no restore path anywhere; a soft-deleted tenant is unreachable by API.
- The `status` column is guarded by `CK_Tenant_Status` (`status IN (10, 20, 30)`) in
  `TenantConfiguration`.
- Existing retention precedent: `EmailLogRetentionHandler` /
  `EmailPreparedSendsRetentionHandler` in `apps/api/Modules/Messaging/Jobs/` — env-windowed,
  bounded-batch, idempotent system jobs; seeded in `SystemJobDefinitionSeeder` with
  `SystemJobDisableProtection` treating the privacy-control retention cadence as disable-protected.

## Decisions

Each decision answers one of the issue's questions, states alternatives considered, and the
chosen path. These are the normative policy; the phases implement exactly this.

### D1 — There is no distinct `Archived` lifecycle state

**Chosen:** "Archived" is not a `TenantStatus` value. An archived tenant IS a soft-deleted tenant
(`IsDeleted = true`). Staff-facing copy may say "Archived"; the API contract stays `deleted`.

**Alternatives:**

- Add `Archived = 40` to `TenantStatus`: rejected. It overlaps soft-delete (two parallel
  "inactive" truths with undefined precedence: is an archived-but-not-deleted tenant restorable?
  is a deleted tenant different from archived?), forces a `CK_Tenant_Status` migration plus
  wire-contract, filter-validator (`AllowedStatuses` in `FindTenantsAsStaffQueryValidator`),
  front status-filter, and i18n churn on every consumer, and buys zero capability that
  `IsDeleted` does not already express.
- Rename the existing delete action to "Archive": rejected as pure churn — identical semantics,
  new words, broken history in audit logs and specs.

**Consequence:** the retention clock lives on the existing `DeletedAt` column. Zero migrations in
the whole plan (verified: restore and sweeping both work off existing columns).

### D2 — Deletion cascades lazily: owned rows are left untouched, access is cut at the boundaries

**Chosen:** `DeleteTenantAsync` keeps flipping only the tenant row. Tenant-owned data (user
accounts, projects, posts, social accounts, invitations, uploads…) is neither soft- nor
hard-deleted at delete time. Inaccessibility is enforced at the boundaries that already resolve a
tenant: the session/tenant-header auth chain and any worker job acting on tenant-owned rows must
treat a soft-deleted tenant as absent. Phase D pins these boundaries with specs and fixes any gap
found.

**Alternatives:**

- Synchronous cascade soft-delete of every tenant-owned table inside the delete request:
  rejected. Hundreds of tables in one request is neither atomic nor reviewable, doubles the write
  volume, and — decisively — destroys lossless restore (D3), because a cascade would have to be
  undone row-for-row.
- Async sweep that cascades soft-deletes shortly after: rejected for the same restorability
  reason, and it introduces a window where half the data is marked deleted.

**Consequence:** restore is lossless by construction (flip the tenant row back; everything is
still there), and physical removal happens exactly once, in the retention sweep (D4).

### D3 — Soft-deleted tenants are restorable, by staff, within the retention window

**Chosen:** a staff-only restore exists: `POST /staff/tenants/{tenantId}/restore` plus bulk
`POST /staff/tenants/bulk-restore`, gated by a NEW permission `tenants.restore` (own grant, not
implied by `tenants.delete`), audited as `tenant.restored`.

Semantics:

- Guard: the tenant row must exist with `IsDeleted = true`. Unknown id → 404
  (`TenantNotFound`); not deleted → 400 with a new `tenant-not-deleted-cannot-restore` response
  key. Expired-and-swept tenants simply no longer exist → 404, which is the honest answer.
- Effect: `IsDeleted = false`, `DeletedAt = null`, `UpdatedAt = now()`. `Status` stays
  `Suspended` — deliberate two-step (restore, then reactivate) so a human consciously re-enables a
  tenant rather than restore implying activation.
- Owned data comes back untouched (D2). Nothing else to restore.
- Bulk variant mirrors `BulkReactivateTenantsAsStaff`: `MustBeRequiredGuidArray` ≤ 100, result
  carries succeeded/failed counts with per-item errors ("not deleted", "not found"), one audit row
  per restored tenant via `LogManyAsync`.
- Race safety: conditional `ExecuteUpdateAsync` with `WHERE is_deleted = true` (same
  race-condition-safe pattern as `DeleteTenantAsync`); zero rows affected → the tenant was
  restored concurrently or is not deletable → map to the typed failure.

**Alternatives:** tenant-scope self-service restore (rejected: a deleted tenant's users must not
be able to resurrect their own workspace — staff decision only); automatic restore on login
(rejected: surprising, unauditable).

### D4 — Hard-delete happens once, after a retention window, by a system sweep job

**Chosen:** a new system job `tenant-retention` (handler in
`apps/api/Modules/Tenants/Jobs/TenantRetentionHandler.cs`, mirroring `EmailLogRetentionHandler`)
physically removes tenants whose `DeletedAt < now() - TENANT_RETENTION_DAYS` (default 90,
env-overridable, D7), in bounded batches, in a deterministic FK-safe order.

- Eligibility: `IsDeleted = true AND DeletedAt < horizon` evaluated in SQL against database time
  with strict `<` (rows exactly AT the horizon survive one more pass) — the exact idempotency
  discipline documented on `EmailLogRetentionHandler`. Active/Suspended tenants are never
  eligible; the sweep only ever looks at soft-deleted rows.
- Ordering: child rows before the tenant row, driven by a hand-maintained
  `TenantOwnedTables` registry (table name + delete statement, dependency-ordered). A schema-drift
  spec queries `information_schema` for every table carrying a `tenant_id` column and FAILS if any
  is missing from `TenantOwnedTables` or from an explicit exclusion list — so a future
  tenant-owned table cannot silently escape erasure. Exclusions: `audit_logs` (D6) and any table
  the sweep handles transitively through its parent.
- One final audit row `tenant.hard_deleted` (Details: tenant code + name + age in days) is
  inserted in the SAME transaction, before the tenant row goes — after the sweep it is the only
  trace, and it satisfies the owner product rule that no destructive event is silent.
- Personal-data-bearing tables (email log, prepared sends) are ALSO covered by their own existing
  retention jobs; the tenant sweep does not wait for them, both clocks run independently, and the
  drift spec accounts for both.
- Anonymize-instead-of-delete: rejected for now. Nothing in the schema requires identity
  preservation (no billing ledger exists; `billing_email` is a contact string that dies with the
  tenant). Physical removal is simpler and strictly stronger. Revisit only if real billing lands.

**Alternatives for cascade mechanics:**

- DB-level `ON DELETE CASCADE` on every tenant-owned FK: rejected — touching every FK of the
  schema in one migration is exactly the unreviewable blast radius this repo avoids; the curated
  registry + drift spec achieves the same completeness with visible ordering.
- One giant `DELETE` per tenant without batching: rejected — long transactions and lock queues;
  batches of ~50 tenants per pass with `FOR UPDATE SKIP LOCKED`, like the messaging sweeps.

### D5 — Suspended tenants keep all data indefinitely

**Chosen:** suspension runs no clock. `Suspended` is an operational, reversible state; only
deletion starts retention. Any "auto-expire suspended tenants" policy is rejected: it would
surprise operators, destroy recoverability, and conflate a moderation action with erasure.

### D6 — Audit logs are append-only and outlive the tenant

**Chosen:**

- Every lifecycle mutation writes audit rows: `TenantSuspended` / `TenantDeleted` exist today;
  `TenantRestored` arrives with Phase A; `TenantHardDeleted` arrives with Phase C (written before
  physical removal, same transaction).
- `audit_logs` is EXCLUDED from the sweep (explicit entry in the D4 exclusion list). Audit history
  of a hard-deleted tenant remains queryable in staff audit logs; rows already store denormalized
  context (e.g. `TenantName` in Details, as `DeleteTenantAsStaff` writes today), so the trail
  stays readable even though the tenant lookup 404s.
- Legal/billing retention question resolved by inventory: the only personal-data stores are
  messaging tables with their own windows (kept) and user accounts (removed with the tenant).
  Nothing else needs preserving past the sweep. If legal later demands longer retention of
  specific tables, they move to the exclusion list with a stated reason — a one-line, reviewed
  change.

### D7 — The retention window is env-driven

**Chosen:** `TENANT_RETENTION_DAYS`, read via `AppEnvironment` exactly like
`EMAIL_LOG_RETENTION_DAYS`: FluentValidation bound (>= 7, <= 3650), default 90, documented in
`.env.example` (placeholder quoted), wired wherever the email retention knobs are (compose /
runbook). The sweep runs daily at 03:00 UTC via a `SystemJobDefinitionSeeder` row, and is
registered as disable-protected alongside `email-prepared-sends-retention` — retention is a
privacy control, not housekeeping (K-3 rationale).

No new HTTP rate-limit bucket is created by the sweep; the restore endpoints reuse whatever
bucket Suspend/Reactivate use today (implementer reads `TenantEndpointsForStaff.cs` and matches).

### D8 — Section 9.4's testable requirements live here, and the retired checklist stays retired

The checklist file died in the docs prune; records are write-once and `docs/misc/` is a closed
layout. Resurrecting it would violate the four-directory rule. The acceptance criterion is met on
its second branch — "explicitly linked to this deferred decision" — plus concrete requirements:

| # | Requirement (post-implementation) | Proven by |
| --- | --- | --- |
| R1 | Restoring a soft-deleted tenant clears `IsDeleted`/`DeletedAt`, keeps `Status = Suspended`, and writes `tenant.restored` audit | `RestoreTenantAsStaff.Spec` (Phase A) |
| R2 | Restore refuses unknown (404) and not-deleted (400, `tenant-not-deleted-cannot-restore`) | same spec |
| R3 | Bulk restore processes ≤ 100 ids, reports per-item failures, audits each success | `BulkRestoreTenantsAsStaff.Spec` (Phase A) |
| R4 | Staff list hides deleted tenants unless `include_deleted=true`; detail exposes `deleted_at` for archived rows | `FindTenantsAsStaff.Spec` (Phase B) |
| R5 | A soft-deleted tenant's members cannot act in tenant scope; workers skip its rows | boundary specs (Phase D) |
| R6 | Sweep hard-deletes only tenants beyond the window, with all owned rows, leaving `audit_logs` intact, and writes `tenant.hard_deleted` first | `TenantRetentionHandler.Spec` + drift spec (Phase C) |
| R7 | Window and schedule come from env/seeder, override-able, disable-protected | AppEnvironment validation spec + seeder row (Phase C) |

## Global constraints (every phase, every PR)

1. Repo rules per `AGENTS.md`: vertical slice layout under `Modules/Tenants/`; handlers orchestrate,
   services own DbContext; `Handle` entrypoints; wire types are top-level siblings without `Dto`
   suffix; `[Service]` DI; `{Action}{Domain}Args` records for 3+-param service methods (update
   `ServiceArgsRecordConvention.Spec` assertions if the analyzer demands).
2. Analyzer hard rules: no null-forgiving `!`, no `?? throw`, `is null` guards, no
   suppression/disable comments, braces everywhere, 100-char lines, no `ToLower()` dispatch
   (PUBLY0001–0008).
3. Staff service calls MUST use `*ForStaff*` variants (PUBLY0007) — the new restore methods are
   `RestoreTenantByIdForStaffAsync` / `BulkRestoreTenantsForStaffAsync` shaped accordingly.
4. Errors are RFC 7807 via `TypedProblems.*`; new response keys go into
   `packages/shared-ts/src/lib/i18n/json/response-message.en.json` + `.fr.json` (both languages,
   same shape) followed by `just generate-response-keys`. Plain-word causes everywhere (owner
   product rule 2026-08-22).
5. Endpoint metadata: route constants in `Routes.Tenants.cs`, `.WithPermission([...])` on every
   route, rate-limit policy matched to the sibling suspend/reactivate routes, no route constraints
   (Guid.TryParse → 400 malformed / 404 missing).
6. Permissions are additive grants: `tenants.restore` is seeded like its siblings; nobody gets it
   implicitly.
7. TDD per task: RED (new spec fails for the right reason) → GREEN → commit. No `test.skip`, no
   retries. Integration specs run against real Postgres via `ApiFixture`, co-located `*.Spec.cs`,
   `ItShould{Expected}{Connector}{Scenario}` names.
8. After any contract change: `just build-api && just generate-client && pnpm --filter front
   typecheck`; regenerated client committed; second regen produces zero diff.
9. Migrations: NONE expected anywhere in this plan (D1 consequence). If an implementer discovers
   one is needed, it goes through `just db-add` + the expand/contract gate and the plan record is
   superseded — not silently edited.

## Phases

Dependencies: A ← B (front restore needs the API). C and D are independent of A/B. E closes every
lane. Each phase = one issue, one lane, one PR (`Part of #365`).

### Phase A — Restore (API)

**Issue:** created at plan delivery. Files: `TenantPermissionsForStaff` (add `RESTORE`),
`AuditLog` (add `TenantRestored`), `AuditActionsRegistry.Spec` (extend with one new `[Fact]`
asserting the new action key — RED step), `TenantAsStaffService`
(`RestoreTenantByIdForStaffAsync`, `BulkRestoreTenantsForStaffAsync` + result unions),
handlers `RestoreTenantAsStaff` / `BulkRestoreTenantsAsStaff` + co-located specs,
`Routes.Tenants.cs` (`/{tenantId}/restore`, `/bulk-restore`), `TenantEndpointsForStaff.cs`,
response keys EN/FR, response-keys regen.

RED anchor (runs before any production edit):

```csharp
[Fact]
public void ItShouldExposeTheTenantRestoreAuditAction() {
    AuditActionsRegistry.All.Should().Contain("tenant.restored");
}
```

Endpoint spec skeleton (real cases, `ApiFixture` style of `DeleteTenantAsStaffSpec`):

```csharp
[Fact] public async Task ItShouldRestoreSoftDeletedTenantKeepingSuspendedStatus() { }
[Fact] public async Task ItShouldClearDeletedAtAndKeepUpdatedAtFreshOnRestore() { }
[Fact] public async Task ItShouldReturnNotFoundForUnknownTenantId() { }
[Fact] public async Task ItShouldReturnBadRequestWhenTenantIsNotDeleted() { } // 400 tenant-not-deleted-cannot-restore
[Fact] public async Task ItShouldRejectStaffWithoutRestorePermission() { }    // 403
[Fact] public async Task ItShouldWriteTenantRestoredAuditRow() { }
[Fact] public async Task ItShouldWinTheRaceWhenTwoRestoresRunConcurrently() { } // second sees not-deleted
```

Service contract: `RestoreTenantResult { Success(Tenant), NotFound, NotDeleted }` discriminated
union; conditional `ExecuteUpdateAsync(set IsDeleted=false, DeletedAt=null) WHERE Id = $1 AND
IsDeleted = true`; zero rows → re-read to distinguish `NotFound` vs `NotDeleted`.

Bulk: mirror `BulkReactivateTenantsAsync` shape exactly (distinct ids ≤ 100, per-item outcome,
`LogManyAsync` audit per success).

### Phase B — Archived-tenant visibility + restore UX (staff front)

**Files:** `FindTenantsAsStaff.cs` (query param `include_deleted`, snake_case wire name, validator
true/false; service drops the `!IsDeleted` predicate when set — note: existing partial indexes
exclude deleted rows, acceptable at archive volumes; document in the handler), staff tenant
detail/list DTO exposing `deleted_at` for archived rows, client regen; front staff tenants page:
archived toggle + "Archived" badge + restore action gated on `tenants.restore`, i18n keys EN/FR in
the page's existing namespace, component tests, e2e spec for the archive→restore flow (tag per
`docs/guides/e2e-tags.md`; CI front-e2e is the evidence).

RED anchors:

```typescript
// find-tenants search params / hook test
it("serializes include_deleted only when true", () => { /* … */ });
```

```tsx
// component test
it("shows the restore action for a holder of tenants.restore", () => { /* … */ });
it("hides the restore action without the permission", () => { /* … */ });
```

UI conventions: state components (`state-view`/`state-surface`) for the archived empty state;
mutation errors via `getFailureMessage(toApiFailure(error), …)`; bulk selection menu items always
render (ineligible clicks toast) per the bulk-action UX guide.

### Phase C — Retention sweep (hard delete)

**Files:** `AppEnvironment.cs` (`TENANT_RETENTION_DAYS`, default 90, validated ≥ 7 / ≤ 3650),
`.env.example` (quoted placeholder), compose/workflows/runbook touch-points matching the email
retention knobs, `apps/api/Modules/Tenants/Jobs/TenantRetentionHandler.cs` +
`TenantRetentionHandler.Spec.cs`, `TenantOwnedTables.cs` (ordered registry) +
`TenantOwnedTableDrift.Spec.cs` (information_schema completeness check),
`AuditLog` (`TenantHardDeleted`), `SystemJobDefinitionSeeder` (daily 03:00 UTC row,
disable-protected registration like `email-prepared-sends-retention`).

Handler algorithm (per pass): select batch of eligible ids `FOR UPDATE SKIP LOCKED`; per tenant,
in ONE transaction: insert `tenant.hard_deleted` audit row → delete owned rows in registry order →
delete tenant row; structured log line per tenant (id, code, days past delete). Strict `<`
horizon; re-runs pick up the next batch (idempotent).

Drift spec core (RED before the registry exists — it fails on the missing registry itself, then
guards forever):

```csharp
[Fact]
public async Task ItShouldCoverEveryTenantIdColumnInTheSweepRegistryOrExclusions() {
    // information_schema.columns WHERE column_name = 'tenant_id'
    // minus TenantOwnedTables entries minus exclusions must be empty.
}
```

Handler spec cases:

```csharp
[Fact] public async Task ItShouldHardDeleteExpiredTenantWithAllOwnedRows() { }
[Fact] public async Task ItShouldKeepTenantsWithinTheRetentionWindow() { }
[Fact] public async Task ItShouldNeverTouchActiveOrSuspendedTenants() { }
[Fact] public async Task ItShouldWriteTheHardDeletedAuditRowBeforeRemoval() { }
[Fact] public async Task ItShouldLeaveAuditLogRowsIntact() { }
[Fact] public async Task ItShouldSweepInBatchesAcrossPasses() { }
```

### Phase D — Boundary guarantees for deleted tenants (verification-first)

Verification-first phase: write the pinning specs BEFORE any fix; each RED discovered is fixed in
the same task (minimal guard + spec). Cases:

- Tenant-scope session/auth against a soft-deleted tenant is refused (the tenant-header/session
  middleware chain treats it as absent) — spec on the auth boundary.
- A worker job processing a tenant-owned row (publishing path) skips rows whose tenant is
  soft-deleted — spec; if a gap exists, add the cheapest existence guard at the job boundary.
- Staff list/detail default-hiding is already covered by Phase B specs (R4).

If any discovery exceeds a small guard (e.g. sessions must be invalidated en masse), open a
`follow-up lv2` issue instead of growing this phase.

### Phase E — Contract, gates, delivery (per implementing lane)

`just build-api && just generate-client && pnpm --filter front typecheck` after contract changes;
commit regenerated client (second regen zero diff); `pnpm --filter front test`; `just knip`;
`just react-doctor --scope files --blocking warning`; `just ci`; full `just test-api` under
`heavy.sh` quoting totals in the PR body; paired RED evidence (`.dump/proof-red.md`, md5
before/after around the disabled mechanism) and one adversarial mutation named in the PR body —
for Phase A the natural mutation is dropping the `IsDeleted = true` guard in the restore UPDATE
(the not-deleted refusal test must go red); for Phase C it is removing the strict-<
horizon comparison (the within-window test must go red).

## Acceptance criteria mapping (#365)

- [x] "Section 9.4 has a concrete testable requirement or is explicitly linked to this deferred
  decision" — D8 (requirements table R1–R7 + the retired-checklist provenance above).
- [x] "The tenant lifecycle/data-retention policy is documented" — D1–D7.
- [x] "Any required backend changes are planned with integration-test coverage" — Phases A/C/D
  with named spec cases.
- [x] "Any required frontend behavior is planned, including labels, disabled states, and
  restore/archive actions" — Phase B.

## Open questions for the owner (non-blocking)

1. Is 90 days the right default retention? Legal/billing input welcome; changing it is one env
   var, no code.
2. Should an export-before-erasure (tenant data dump) exist? Out of scope here; flagged as a
   potential `follow-up lv2` if wanted.
3. Long-term: when real billing lands, revisit the anonymize-vs-delete choice in D4/D6.
