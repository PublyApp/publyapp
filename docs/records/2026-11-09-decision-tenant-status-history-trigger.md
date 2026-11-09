# Decision — record organisation lifecycle transitions with a database trigger

Date: 2026-11-09. Status: accepted (owner decision on the « no invented past » baseline; captain
decision to keep the trigger and govern it). Issue #2349, PR #2367.

## Context

The staff dashboard shows « active organisations per day ». A past daily count cannot be derived
from `tenants` alone: the table holds only the current status, so the curve needs a history of
transitions.

Nine code paths change a tenant's status, through three mechanisms:

| Mechanism | Examples |
| --- | --- |
| Tracked entity + `SaveChanges` | invitation acceptance activation (`InvitationAcceptanceService`), generic `Remove()` soft delete (`AppDbContext`) |
| `ExecuteUpdateAsync` | suspend / reactivate / soft delete (`TenantAsStaffService`), bulk actions |
| Raw `UPDATE` / `UPDATE … RETURNING` | bulk suspend / reactivate / delete (`TenantAsStaffService`) |

Plus the seeders, and every future path. The bug this feature fixes is a forgotten write; an
explicit write per path is nine edits, each forgettable, and a service-level dual write cannot be
*inside* the transaction of the `ExecuteUpdateAsync` / raw `UPDATE` paths without threading a
`DbContext` transaction through all of them.

## Decision

A single `AFTER` trigger on `tenants` writes one `tenant_status_history` row per transition, in the
same transaction as the change:

```
CREATE TRIGGER tenants_record_status_history
AFTER INSERT OR UPDATE OF status, is_deleted OR DELETE ON tenants
FOR EACH ROW EXECUTE FUNCTION record_tenant_status_history();
```

The function maps the write to `TenantLifecycleStatus` (10 Pending / 20 Active / 30 Suspended /
40 Deleted — the first three equal `TenantStatus`, pinned by a spec), uses `clock_timestamp()` (not
`now()`, which is the transaction start), and short-circuits an update that changes neither watched
column.

### What it covers

- **INSERT** — a created organisation enters the curve.
- **UPDATE OF `status`** — suspend / reactivate, single and bulk.
- **UPDATE OF `is_deleted`** — soft delete (`40`) and a restore (the status it returns with).
- **DELETE** — a hard delete writes a terminal `40` row so the organisation leaves the curve
  instead of staying frozen at its last status. `AppDbContext.ForceHardDelete` and specs do emit
  real `DELETE FROM tenants`.
- **No-op updates** — a name/logo/notes update does not even fire the trigger (`UPDATE OF`), and
  an update that rewrites the same values is short-circuited by the function's guard.

`TRUNCATE tenants` fires no row trigger and is not used anywhere in the application or the test
infrastructure (`just db-reset` drops and re-migrates the whole database). It is out of scope; a
future truncate path must clear `tenant_status_history` itself.

### No foreign key, on purpose

`tenant_status_history.tenant_id` carries no FK to `tenants`, like `audit_logs.target_id`:

- a hard delete must keep its terminal history row (the curve would otherwise forget the tenant
  ever existed), so a `ON DELETE CASCADE` is exactly wrong;
- the pagination specs rewrite `tenants.id` (`FindTenantsAsStaffSpec._SwapTenantIdsAsync`), which a
  plain FK would reject.

The cost is explicit: a rewritten `tenants.id` leaves past rows keyed to the old id (they are
mis-attributed to a tenant that no longer exists, and the DELETE arm does not clean them). That is
a test-helper concern today, and the alternative — bending the production schema around a spec —
was rejected in review. The DELETE arm plus this record replace the FK as the integrity story.

## How to verify the trigger exists

- `apps/api/Modules/Tenants/Entities/TenantStatusHistory.Spec.cs` asserts the trigger is installed,
  enabled, calls `record_tenant_status_history`, and its definition carries
  `AFTER INSERT OR UPDATE OF status, is_deleted OR DELETE`. The same spec drives every transition
  kind and asserts the resulting status sequence.
- `dotnet ef migrations has-pending-model-changes` and `AppDbContextModelSnapshot` model the TABLE
  only; they cannot see a dropped trigger. A database restored from a schema-only dump (or built
  with `EnsureCreated` from the model) has the table and no trigger — the spec above is the check
  that catches it.
- Manually: `SELECT pg_get_triggerdef(oid) FROM pg_trigger WHERE tgname = 'tenants_record_status_history';`

## Baseline (no invented past)

The migration writes ONE baseline row per existing tenant, dated `now()` at migration time with the
status it holds then. Nothing is dated at the tenant's creation: history before the migration is
unknown, not approximated. The series exposes `recordedSince` (the earliest recorded transition) so
the front shows the days before it as empty, with « Historique enregistré depuis le {{date}} » /
« History recorded since {{date}} ».

`apps/api/Migrations/AddTenantStatusHistory.Spec.cs` migrates a throwaway database up to the
previous migration, seeds active/suspended/soft-deleted tenants, applies this migration and asserts
one baseline row each, dated at migration time.
