# Audit Log List — Inspect Drawer + Event-Forward Row Design

## Context

The Staff audit logs list (`apps/front/src/routes/authed/staff/audit-logs/list/_parts/staff-audit-logs-table.tsx`) currently presents User as the first column and routes the "view details" affordance through an `solar:eye-bold` icon in the trailing Actions column. Two complaints with that today:

- The eye icon reads as generic "look at this", not as "open the inspector". The action feels orphaned and the semantics are weak.
- The primary identifier (the *event*) is hidden behind the User column. For forensic browsing, the action and event id should lead.

Per the discussion captured during this PR (`feat/280-staff-audit-logs-table-upgrade`, issue #394 in #280), the path forward is twofold:

- **Reframe the row** so the Event column comes first, in two lines (action key + event id), with the action key itself a permalink to `/staff/audit-logs/:id`.
- **Add a list-level "inspect" drawer** that mirrors the detail-page content in a 480px right-anchored drawer, opened from the Actions column. The drawer is URL-bound so the open state is shareable.

The detail page work landed earlier in this PR already produced six reusable building blocks (`AuditLogHero`, `AuditLogActor`, `AuditLogContextGrid`, `AuditLogPayload`, `categorizeAuditAction`, `useAuditLogDetailVariant`). The drawer composes the first four; nothing new needs to be invented for the drawer's body.

## Decision

Two coordinated changes to the list page, no changes to the detail page or any backend:

- **Reorder + reshape the table columns.** `Event` becomes first (action key + event id, 2-line), `User` shifts to second, `Target ID` / `IP address` / `Created at` stay, `Actions` stays last.
- **Add a URL-bound right-side `<Drawer>`** opened from the Actions column. The drawer is anchored to a `?inspect=<logId>` nuqs param so the open state survives reloads and direct links. The drawer's body is a flat Stack of sections (no inner Cards — matches the existing `staff-user-preview-action.tsx` precedent for narrow-width preview drawers) using the same blocks the detail page uses.

The Event-cell click navigates (real `<Link>`); the Actions-cell click opens the drawer (no navigation). Two distinct affordances on the same row.

## Table Column Changes

After the change, the columns in order are:

| # | Column | Cell content |
| --- | --- | --- |
| 1 | `Event` (header text via `t('event')`) | 2-line: primary = action key (monospace, `Link` to `/staff/audit-logs/:id`), secondary = event id (truncated with ellipsis, monospace, `text.secondary`, hover surfaces full value via `<Tooltip>`). |
| 2 | `User` | unchanged (name + email stacked) |
| 3 | `Target ID` | unchanged |
| 4 | `IP address` | unchanged |
| 5 | `Created at` | unchanged |
| 6 | `Actions` | single `<IconButton>` with `solar:list-bold`, tooltip `t('inspect')`, click writes the `?inspect=<logId>` URL param. Replaces the previous `solar:eye-bold` link button. |

Cell rules:

- Event cell primary: rendered as `<Link component={RouterLink} href={…} underline="none">` containing a monospace `<Typography>`. `cmd-click` opens the permalink in a new tab; left-click navigates within the SPA.
- Event cell secondary: id is truncated visually (`overflow: hidden; text-overflow: ellipsis; white-space: nowrap`) and the full id is revealed in a `<Tooltip>` on hover, same shape the existing `TargetIdCell` uses today.
- The Event cell never opens the drawer. The Actions cell button is the sole drawer trigger.
- The Actions cell button is `color="default"`, `size="small"`, with `sx={{ color: 'text.primary' }}` to match the staff-user preview-action precedent. Tooltip placement `top`, arrow.

## Drawer

A new `audit-log-inspect-drawer.tsx` co-located under `audit-logs/list/_parts/`.

- `<Drawer anchor="right">` with the same `slotProps`/`sx` shape used by `staff-user-preview-action.tsx`:
  - `paper.sx`: `width: 480`, `maxWidth: '100%'`, `overflow: 'unset'`
  - root `sx`: `zIndex: theme.zIndex.modal + 1`
  - `slotProps.transition.appear: true`
- A `<DrawerAnchor>` close handle sits on the left edge (consistent with the other preview drawers in `_parts/`). Tooltip text `t('close')`.
- The drawer fetches its own data via the existing `useGetStaffAuditLog` hook, gated on the URL param. List rows carry only `AuditLogListItem` summary fields; the drawer needs `AuditLogDetail` (which has the `details` payload, etc.).
- Loading / error / empty states use the same `<QueryDisplay>` pattern the detail page uses, with drawer-sized variants of the existing Skeleton / Empty / Error slots (small variants — 480px wide).

### Drawer header

A short header block above the inspect content:

- Title row: an overline label (`t('audit-log')`) and the absolute timestamp underneath as a small `text.secondary` line.
- Permalink action: a `<Link component={RouterLink}>` reading `t('open-in-full-page')` (or `t('view-details')` — whichever already exists; reuse over add) with the `eva:external-link-outline` icon at the right edge of the row. Clicking navigates to `/staff/audit-logs/:id` and closes the drawer through normal route change.

### Drawer body

A flat `<Stack spacing={3} sx={{ p: 3, pt: 8 }}>` (the `pt: 8` matches the existing preview-drawer pattern so the DrawerAnchor doesn't sit on top of the first row). Sections in order:

1. `<AuditLogHero auditLog={auditLog} sx={{ p: 0 }} />` — chrome-less hero (category chip + monospace action + timestamp; same block the detail page's `split` and `stacked` variants use).
2. `<AuditLogActor auditLog={auditLog} />` — avatar + name + email.
3. `<AuditLogContextGrid auditLog={auditLog} fields={['ip', 'userAgent', 'targetId', 'eventId']} />` — single-column inside a 480px drawer because the `<Grid>` falls back to `xs=12` at narrow widths.
4. `<AuditLogPayload details={auditLog.details} />` — rendered only when `details` is non-null (the existing block returns `null` otherwise).

No inner Cards. The flat Stack pattern matches the existing preview-drawer precedent (`staff-user-preview-action.tsx`, `staff-profile-preview-drawer.tsx`) and avoids the chrome-on-chrome density that nested Cards produce inside a narrow drawer.

## URL Contract

A new nuqs param scoped to the list page only:

```typescript
const [inspect, setInspect] = useQueryState('inspect', parseAsString);
```

- Action button click → `setInspect(row.id)`. The drawer subscribes to `inspect` and opens whenever it's a non-empty string.
- Drawer close (via `<DrawerAnchor>`, clicking the backdrop, or pressing Escape) → `setInspect(null)`. Clears the param from the URL.
- Drawer permalink click → navigates to `/staff/audit-logs/:id`. The `inspect` param remains in the URL of the list page after navigation away; on return, the drawer reopens. Acceptable.
- Loading the list with a pre-existing `?inspect=<id>` → drawer opens automatically on mount and runs the detail fetch.
- Loading with `?inspect=` (empty) → no drawer. `parseAsString` treats empty as no value.
- Loading with `?inspect=garbage` → drawer opens and the detail query 404s, which the QueryDisplay surfaces as the empty state (same as the detail page's behavior with an unknown id).

The `inspect` param does not collide with the existing filter params (`actions`, `from`, `to`) and is intentionally not propagated through the parent breadcrumb link, the same way the detail page's `variant` param isn't propagated.

## File Structure

**New under `apps/front/src/routes/authed/staff/audit-logs/list/_parts/`:**

| File | Responsibility |
| --- | --- |
| `audit-log-inspect-drawer.tsx` | The `<Drawer>` component. Reads `inspect` via nuqs, runs the detail query when open, renders the header + body, hosts the close affordance. |
| `use-audit-log-inspect.ts` | Thin hook wrapping the nuqs `useQueryState('inspect', parseAsString)`. Exposes `{ inspectedLogId, openInspect(id), closeInspect() }`. |
| `audit-logs-event-cell.tsx` | The new Event column cell — primary action key as `<Link>`, secondary truncated event id with `<Tooltip>`. |
| `audit-logs-inspect-action.tsx` | The Actions cell button (`solar:list-bold` + tooltip) that calls `openInspect(row.id)`. |

**Modified:**

- `staff-audit-logs-table.tsx` — column reorder, swap `ActionCell`/`UserCell` order, drop the eye-icon `ActionsCell`, render `<AuditLogInspectDrawer />` once at the table root, wire the new event/actions cells.

**Possibly new i18n keys (only if not already in the file):**

- `inspect` — EN: "Inspect", FR: "Inspecter" (verify against `packages/shared-ts/lib/i18n/json/common.{en,fr}.json` before adding)
- `event` — EN: "Event", FR: "Événement" (the column header)
- `open-in-full-page` or reuse `view-details` (whichever already exists wins)

The category helper, hero, actor, context-grid, and payload blocks are **reused as-is from the detail page work** — no changes needed to those files.

## Out of Scope

- Final visual polish on the detail page variants — still parked for a separate follow-up.
- Target resolution (resolving `targetId` into a typed entity link).
- Related-events pivots ("all events by this user", "next/previous event in this session").
- Drawer width breakpoints (the 480px constant matches the codebase precedent; tablet/mobile sizing is a separate concern).
- Replacing the detail page route. The detail page stays — the drawer is additive.

## Testing

Frontend-only changes. Run the standard gates:

```bash
just tsc-front
just check-write
just knip
```

Browser smoke:

- Open `/staff/audit-logs`. Confirm column order is Event / User / Target ID / IP / Created at / Actions.
- Click the action key in the Event column → navigates to `/staff/audit-logs/:id` (the detail page). Cmd-click opens in a new tab.
- Click the inspect button (`solar:list-bold`) in the Actions column → drawer slides in from the right, URL gains `?inspect=<id>`. The fetched data populates Hero / Actor / ContextGrid / Payload.
- Close the drawer via the `<DrawerAnchor>`, click outside, or press Escape → URL drops the `inspect` param.
- Reload the page while a drawer is open (`?inspect=<id>` in URL) → drawer reopens on mount with the same content.
- Manually paste `?inspect=<unknown-id>` → drawer opens, shows the empty/404 state.
- Cursor-paginate to the next page → if `?inspect=<id>` is still in the URL, the drawer stays open with its own data even though the row is no longer in the table.
- Verify the drawer body composition is **a single column** (the ContextGrid wraps to xs=12 at narrow widths).
- Verify the permalink inside the drawer header works: click it → navigates to detail page; back button returns to list with drawer state restored (if `inspect` param was preserved).

No new automated tests are required for the drawer components themselves (they are presentational and exercised by tsc + smoke). The `use-audit-log-inspect.ts` hook is small enough that a unit test isn't warranted unless a frontend testing harness lands; rely on type-check + smoke.

## Open Questions

None. Column order, two-line Event cell with action-key-as-link, action-button-only drawer trigger, `?inspect=<id>` URL contract, drawer dimensions (480px right-anchored), and the `solar:list-bold` icon are all settled from the conversation.
