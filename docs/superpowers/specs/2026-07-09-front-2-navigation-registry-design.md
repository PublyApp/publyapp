# front-2 navigation registry — rail module → panel mapping

Date: 2026-07-09 · Status: approved by Radan · Scope: information architecture only (no implementation in this spec; screens go to the Claude design pass first, wiring follows)

## Context

front-2 uses the Gray UI workspace shell: a 48px icon rail plus an optional 272px secondary panel. The legacy app (`apps/front`) used a single sidebar that mixed module switching with in-module navigation, plus tab bars inside Settings and Account. This spec fixes how the legacy surface maps onto the rail/panel paradigm.

A user is either staff-scoped or tenant-scoped (backend invariant), so there are two independent rails. Staff drilling into a tenant (`/staff/tenants/:id/…`) stays on the staff rail; depth is handled by the tenant detail's underline section tabs.

## Model

- **Rail = module switcher.** One icon per product module, never per page. Rail click lands on the module's first panel item (its default destination).
- **Panel = context within the module.** Rendered only when the module has ≥2 items. Auto-collapses on detail/form routes and below 1024px; on mobile the panel is the hamburger drawer (rail hidden).
- Panel items come in two kinds:
  - **destination** — its own route;
  - **view** — a URL filter preset on the module's list route (active state derived from the filter params, not the path).
- **Counts are actionable-only**: a badge appears only where the number is a to-do signal — pending invitations (both scopes) and post drafts. Views and plain destinations get no badge. (Kills the current hardcoded 42/6/4 mock counts.)
- One typed registry (`apps/front-2/src/lib/navigation/route-metadata.tsx`) declares `railItem → panelItems` and drives rail, panels, breadcrumbs, and active states. No route hand-places navigation.

## Staff rail (top → bottom)

| Module | Panel | Items |
|---|---|---|
| Dashboard | none | — |
| Tenants | views | All tenants · Active · Suspended |
| Staff | destinations | All users · Invitations (pending count) · Profiles |
| Audit logs | views | All events · Sign-ins & sessions · User management · Tenant lifecycle · Destructive actions |

Bottom of rail: nothing for now (the current dead settings gear is removed).

## Tenant rail (top → bottom)

| Module | Panel | Items |
|---|---|---|
| Posts | destinations | Calendar · Queue · Drafts (count) · History |
| Members | destinations | Members · Invitations (pending count) · Roles |
| Settings | destinations | General · Workspaces · Integrations · Billing · Security |
| Account (pinned at rail bottom) | destinations | Profile · Security · Notifications |

Notes:
- Members and Roles are promoted out of legacy Settings; tenant invitations become a real page (mirrors the staff side; the API resource already exists).
- Settings keeps: General / Workspaces / Integrations / Billing / Security.
- Account is pinned at the rail bottom: top of rail = the organization's work, bottom = personal.
- Tenant portal / organization picker is a rail-less centered page.

## Contract gaps this creates (design now, wire later)

1. Tenant list status filter param (URL + API) for the Tenants views.
2. Audit-log category filter param for the Audit views.
3. Cheap count queries: pending staff invitations, pending tenant invitations, post drafts.
4. Tenant-scope invitations list page (new page over the existing API resource).

## Next steps

1. Feed this mapping into the Claude design pass (`.dump/claude_design/front2-parity-design-prompt.md` carries it verbatim).
2. After designs land: extend `route-metadata.tsx` to the two-scope registry with the destination/view distinction and actionable counts; implementation gets its own plan then.
