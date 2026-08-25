# Bulk Action UX Conventions

> **MIXED GUIDE — read the split before you follow anything.**
> **Normative:** the bulk-action UX policy (menu items always render, never `disabled` or hidden by
> per-row eligibility, ineligible clicks show an i18n toast, the trigger gates on
> `BULK_ACTION_MAX_COUNT`) and the whole backend contract — batched service queries, batched audit
> logs, and the mutation-hook split try/catch.
> **Not normative:** the MUI component mechanics (`MenuItem`, `sx`, …) and any `apps/old-front` path.
> `apps/old-front` is the retired MUI + React Router v7 app — not deployed, and the owner will not edit
> it again. Build the UI in `apps/front` per [`front/index.md`](front/index.md) and
> [`front/conventions.md`](front/conventions.md). Porting the UI half of this guide is deferred
> to a later wave of the documentation remediation.

> Rules for list-page multi-select bulk actions (revoke, suspend, reactivate, delete, remove, etc.) — both the frontend selection menu and the backend service/handler/audit-log shape.

For the broader list-page surface (search, filters, cursor pagination, selection plumbing), see
[`docs/guides/list-pages-search-filter-cursor-pagination.md`](./list-pages-search-filter-cursor-pagination.md).
For the bulk-body validator pattern (CSV-enum, `maxCount`), see
[`docs/guides/validator-conventions.md`](./validator-conventions.md).

## 1. Scope

Applies to any list page with multi-select row selection that exposes batched mutations. On the
frontend these surfaces live in `*-selection-actions.tsx` files; on the backend they live in
`Bulk*ForStaff*.cs` (or the equivalent tenant-scoped) handlers.

## 2. Frontend: Selection Menu

### MenuItems for bulk actions render unconditionally

Never `disabled`, never conditionally hidden based on per-row eligibility. Discoverability beats
strict gating: hiding the action makes users think it doesn't exist, and disabling without
explanation is just as opaque. The click handler is what enforces eligibility.

```tsx
<MenuItem
    onClick={() => {
        if (eligibleCount === 0) {
            onCloseMenu();
            toast.warning(t('only-pending-invitations-can-be-revoked'));
            return;
        }
        onOpenBulkActionDialog();
    }}
>
    <ListItemText primary={t('revoke-selected')} />
</MenuItem>
```

### Toast messages must come from i18n

Keys are per-action and live in BOTH `common.en.json` and `common.fr.json`. Never hardcode English
strings in the click handler.

Naming:

- Per-action ineligible-click toast: `<action>-no-eligible-rows` or `<action>-disabled-<reason>`
  (e.g. `only-pending-invitations-can-be-revoked`, `bulk-suspend-disabled-no-active-users`).
- Trigger-disabled tooltip when over cap: `bulk-action-max-count-exceeded` (single shared key,
  takes `{ max, count }` interpolation).

### Don't wrap MenuItem in `Tooltip > Box span`

It breaks the ARIA `aria-activedescendant` flow inside MUI `Menu`. If you need to communicate
"why nothing will happen", do it through the click-handler toast, not a wrapper tooltip.

### Trigger button gates on count cap

The "More actions" `IconButton` that opens the menu is the one place where `disabled` is correct —
it gates on `selectedCount > BULK_ACTION_MAX_COUNT` (from `@org/shared-ts/lib/constants`) with a
tooltip explaining the cap. Per-action eligibility never lives on this button.

## 3. Frontend: Mutation Hook

### Split try/catch

Only the mutation call goes inside `try`. Post-processing (`setRowSelection`,
`queryClient.invalidateQueries`, success toast) lives outside.

```ts
let result;
try {
    result = await bulkRevokeStaffInvitations({ invitationIds });
} catch (error) {
    closeDialog();
    toast.error(getFailureMessage(toApiFailure(error), { fallback: t('bulk-revoke-failed') }));
    return;
}

setRowSelection({});
await queryClient.invalidateQueries({ queryKey: [...] });
closeDialog();
toast.success(t('bulk-revoke-succeeded', { count: result.succeededCount }));
```

A thrown error in `setRowSelection` or `invalidateQueries` AFTER the mutation succeeded must NOT
surface as a "failed" toast. Post-processing exceptions are bugs in the hook, not user-visible
failures. As always, derive error text via `getFailureMessage(toApiFailure(error), ...)`.

## 4. Backend: Endpoint Shape

- Route: `POST /staff/<resource>/bulk-<action>` (kebab-case, see `RoutePath.cs`).
- Body: `{ <entity>Ids: ["...", "..."] }`.
- Validator: `minCount: 1` (empty array → `422`) and `maxCount: 100` (matches
  `BULK_ACTION_MAX_COUNT`). Add a comment on both sides referencing the other so the next
  reviewer can see they're intentionally paired.
- Response: partial-success contract — `{ succeededCount, failedCount, failedItems: [{ id, reason }] }`.
  Never throw on partial failures; the client needs the breakdown to update its row state.

## 5. Backend: Service Implementation

### Single SELECT, tracker mutation, single SaveChanges

A naive `foreach (id) { service.RevokeAsync(id); }` issues `N` SELECTs and `N` `SaveChangesAsync`
round-trips — at `N = 100` that's catastrophic. The canonical shape:

```csharp
var rows = await _dbContext.Invitation
    .Where(inv => requestedIds.Contains(inv.Id) && inv.Scope == InvitationScope.Staff)
    .ToListAsync(cancellationToken);
var foundById = rows.ToDictionary(inv => inv.Id);
var failedItems = new List<BulkInvitationFailedItem>();
var succeededIds = new List<Guid>();

foreach (var id in requestedIds) {
    if (!foundById.TryGetValue(id, out var inv)) {
        failedItems.Add(new(id, "not-found"));
        continue;
    }
    if (inv.Status is InvitationStatus.Accepted) {
        failedItems.Add(new(id, "already-accepted"));
        continue;
    }
    inv.Status = InvitationStatus.Revoked;
    succeededIds.Add(id);
}

await _dbContext.SaveChangesAsync(cancellationToken);
```

### Side-effects belong in a private helper

If the per-item public method has side-effects (token invalidation, downstream events, notification
dispatch), refactor those into a private helper that operates on a tracked entity, and call the
helper from the loop. Don't lose the side-effect by inlining only the field write.

### Handler dedupes IDs

The service contract assumes distinct IDs; downstream redundant dedup is wasteful.

```csharp
var requestedIds = body.GetIds().Distinct().ToList();
```

## 6. Backend: Audit Logs

Audit logs go through `IAuditLogService.LogManyAsync` (one INSERT for the batch) and are wrapped in
try/catch so a logging hiccup never fails a user-visible response that already succeeded.

```csharp
try {
    await auditLogService.LogManyAsync(
        succeededIds.Select(id => new CreateAuditLogArgs(...)).ToList(),
        cancellationToken
    );
} catch (Exception ex) {
    _logger.LogError(ex, "Failed to write audit logs for bulk revoke");
}
```

This is observability isolation: the endpoint has already committed; an audit failure is a logging
concern. The broader "no `N×SELECT` in hot paths" rule from
[`docs/guides/csharp-coding-standards.md`](./csharp-coding-standards.md) applies here too — use
`LogManyAsync`, not a loop of `LogAsync`.

## 7. Constants

| Side | Constant | Source |
|------|----------|--------|
| Frontend | `BULK_ACTION_MAX_COUNT = 100` | `packages/shared-ts/src/lib/constants.ts` |
| Backend | validator `maxCount: 100` | per-handler body validator |

The two MUST stay in sync. Comment on both sides referencing the other.

## 8. Reference Implementation

Cite as canonical when in doubt:

- Frontend selection menu (archived): `docs/records/2026-08-22-review-old-front-staff-tenant-users-screens.md` (old path `apps/old-front/src/routes/authed/staff/invitations/list/_parts/staff-invitations-selection-actions.tsx`)
- Frontend mutation hook (archived): `docs/records/2026-08-22-review-old-front-staff-tenant-users-screens.md` (old path `apps/old-front/src/routes/authed/staff/invitations/list/_parts/use-staff-invitation-bulk-revoke.ts`)
- Backend handler: `apps/api/Modules/Invitations/Handlers/Staff/BulkRevokeStaffInvitations.cs`
- Backend service method: `InvitationService.BulkRevokeStaffInvitationsAsync` in
  `apps/api/Modules/Invitations/Services/InvitationService.cs`
- Batched audit-log API: `AuditLogService.LogManyAsync`
