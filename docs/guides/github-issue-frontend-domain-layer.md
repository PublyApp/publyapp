# GitHub Issue Draft: Frontend Domain Layer

**Title**

Frontend: introduce `lib/domain` layer and extract business rules

**Context**

We want a clear separation between:
- `app/routes/**` = UI glue + pages
- `app/lib/react-query/**` = server-state fetching/caching
- `app/lib/zustand/**` = client/UI state
- `app/lib/domain/**` = pure product rules (permissions, workflow decisions, derived calculations, DTO normalization)

Rules and docs:
- `AGENTS.md` (Frontend Domain Layer section)
- `docs/front/domain-layer.md`
- `docs/front/domain-layer-inventory.md`

**Problem**

Business/product rules are currently embedded in pages/components (status interpretation, allowed actions, permission transforms). This creates:
- Duplication across screens
- Inconsistent behavior over time
- Harder refactors when UI/data fetching changes

**Proposal**

Adopt `apps/front/app/lib/domain/**` as the single home for pure product rules and incrementally extract existing duplicated rules into feature modules (starting with invitations + user status).

**Scope (initial)**

Start with:
1. Invitations (derive status + allowed actions)
2. User/member statuses (derive status category + allowed actions)
3. Permissions DTO normalization for staff profile creation (pure mapper)

Defer:
- Full authorization/permissions system on the frontend (beyond simple helpers)
- Any API shape changes / Kiota regeneration

**Acceptance Criteria**

- New domain rules are documented and discoverable:
  - `AGENTS.md` updated with domain-layer rules
  - `docs/front/domain-layer.md` exists
  - `docs/front/domain-layer-inventory.md` exists
- At least one real feature uses domain functions (no behavior change):
  - Invitations pages call domain rules for status/action decisions
  - User status mapping is centralized and reused by at least 2 screens
- Domain modules stay pure:
  - No imports from React/router/query/zustand/components

**Task Breakdown**

- [ ] Create initial domain modules (pure TS):
  - [ ] `features/shared/invitations/*` (derive invitation status; action eligibility decisions)
  - [ ] `features/shared/users/status/*` (derive user status category; action eligibility decisions)
  - [ ] `features/staff/permissions/mappers/*` (normalize permissions API DTO -> module slices)
- [ ] Refactor UI to consume domain rules (no functional changes):
  - [ ] `apps/front/app/routes/authed/tenant/settings/invitations/tenant-settings-invitations-page.tsx`
  - [ ] `apps/front/app/routes/authed/staff/invitations/details/staff-invitation-details-page.tsx`
  - [ ] `apps/front/app/routes/authed/staff/staff-members/list/parts/staff-members-table.tsx`
  - [ ] (Optional) other user-status screens in inventory
- [ ] Add barrel exports for ergonomic imports:
  - [ ] `apps/front/app/lib/domain/index.ts`
  - [ ] `apps/front/app/lib/domain/features/**/index.ts`

**Implementation Notes**

- Domain functions should return stable codes (e.g. `ALREADY_REVOKED`, `EXPIRED`) rather than translated strings.
- UI translates via `t(code)` and maps semantic categories to MUI colors locally.
- Keep `react-query` hooks thin: fetching only; any reusable normalization can live in domain mappers.

