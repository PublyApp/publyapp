# Front-2 ↔ old front — feature-parity status

Dated snapshot: **2026-07-11** (swept from `apps/front/src/routes.ts` + `_tree/*` vs
`apps/front-2/src/routes.ts` + `src/lib/navigation/route-metadata.tsx`). Update this file when an
area changes state; `parity-contract.md` stays the per-decision design log.

## Scope decision (2026-07-11, Radan)

Work now focuses on **two slices only**, design-first (Claude Design canvas → handoff → build):

1. **Auth slice** — login redesign + the missing flows (signup, verify-email, reset-password,
   accept-invitation).
2. **Staff tenants slice** — tenant detail (all tabs; current build does not match the intended
   design) + a redesigned tenant-creation page.

Everything else below stays inventory, not commitment.

## Parity matrix

| Old-front area | Front-2 status | Notes |
|---|---|---|
| Auth: login | DONE (redesign pending) | `routes/login.tsx`; visual redesign requested 2026-07-11 |
| Auth: signup / verify-email / reset-password / accept-invitation | **MISSING** | accept-invitation is a functional dead end: staff can send invitations nobody can accept in front-2 |
| Marketing (home, pricing, legal ×3, about, contact, security, blog, changelog) | **MISSING** | only a placeholder `/`; several pages flag-gated in old front too |
| Staff dashboard | PARTIAL | routes exist; overview/activity/reports are placeholder panels |
| Staff tenants (list, new, detail, edit, users, invitations, profiles) | DONE (redesign pending) | detail tabs + creation page flagged for redesign 2026-07-11 |
| Staff tenant tabs: activity / usage / billing | MISSING | flag-gated OFF in old front as well — low priority |
| Staff global tenant-users (detail + organizations) | **MISSING** | front-2 only has tenant-scoped users |
| Staff staff-users (list, detail, edit) | DONE | front-2 richer: permissions/activity/settings sub-tab routes |
| Staff invitations (list, new, detail) | DONE | |
| Staff profiles (list, new, detail + users) | DONE | |
| Staff audit-logs (list + detail) | **MISSING** | rail/panel nav declared → renders 404 |
| Tenant scope (portal, organizations, posts ×4, settings ×7, account ×3) | **MISSING** | rail nav declared → all 404; single biggest chunk |

Front-2-only additions (no old-front equivalent): dedicated edit routes, staff-user detail sub-tab
routes, `/field-validation` demo.

## Cross-cutting systems

| System | Old front | Front-2 |
|---|---|---|
| Toasts | **sonner** (`components/snackbar/`, mounted in `root.tsx`; `toast.success/error/warning`, one `toast.promise`) | **none** — bulk-action ineligible-click uses an inline banner in `tenants.tsx`; shared primitive is agreed, queued |
| Forms | RHF + zod, 18 MUI field wrappers incl. date-picker, phone, autocomplete, code, upload | RHF + zod, HeroUI field set (text/email/select/switch/checkbox-group); missing fields land with the screens that need them |
| Image/upload primitive | `components/image/image.tsx` + `rhf-upload` | **none** (avatars only) — needed before tenant scope |
| Theme / dark | MUI CSS-vars theme | Zustand `ui-store` + `.dark` class, persisted; healthy |
| i18n | i18next (server+client) | i18next SSR-loaded in `__root.tsx`; healthy |
| Error views | `AppErrorView` system | ported + unified (`state-view.tsx`); healthy |
| Tables | MUI DataGrid + MRT + TanStack | custom `DataTable` + cursor pagination; healthy |
| URL state | nuqs | custom `table-search-params.ts`; healthy |
| Charts / realtime | none | none — nothing to port |

## Count badges (blocked on contract)

All four staff list endpoints return cursor pages only (`Data` + `NextCursor`,
`Lib/CursorPaginatedResult.cs`) — **no total exists anywhere**. Real badge totals need either a
`TotalCount` on each list result (a `COUNT(*)` keyset pagination deliberately avoids) or dedicated
lightweight count endpoints, then `just generate-client` + query wiring.

⚠️ Until then: `route-metadata.tsx` hardcodes `count: 6` (invitations), `count: 3` (posts-drafts),
`count: 2` (members-invitations) — fabricated data by the owner's own standard; drop the static
counts rather than ship invented numbers.
