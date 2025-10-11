# PublyApp — Staff Backoffice MVP Plan (2–3 Months)

## 1) Project focus & personas

- Audience: owner/operator and collaborators who administer tenants (customers) through the existing staff portal.
- Goal: evolve staff experiences so the internal team can manage tenants, troubleshoot scheduling jobs, and enforce compliance without direct database access.

## 2) Current baseline & gaps

- Backend already exposes staff endpoints under `apps/api/Src/Features/Staff/*` for tenant CRUD, staff lookup, and tenant profile listing, backed by shared `UserAccount` and `Tenant` models.
- Frontend includes `/authed/staff` routes (dashboard, tenants, staff-members) with tables, details, and create flows.
- Gaps: no invitation-centric onboarding or explicit role separation, limited tenant controls (suspend/reactivate, usage snapshots), no impersonation or publish-job tooling, minimal observability, and no surfaced incidents/metrics.

## 3) Staff MVP goals

- Harden staff authentication with invite-based onboarding and explicit Owner/Admin/Support roles.
- Expand tenant administration to include status toggles, onboarding resets, usage snapshots, and tenant profile visibility.
- Provide support tooling: search publish jobs, retry/cancel runs, and impersonate tenant sessions safely.
- Introduce staff management (invite, modify roles, revoke) with comprehensive audit logging.
- Surface operational awareness: dashboards summarizing queue health, failure rates, and system notices, plus Hangfire access for privileged roles.

## 4) Lean feature scope (must-have)

### Backend

- Extend `StaffMember` services to support invitations, role assignments, revocation, and last-login tracking (augment existing `UserAccount` records).
- Add audit logging (`StaffAuditEntry`) capturing actor, action, target, metadata; expose paginated read APIs.
- Enhance `TenantAsStaff` endpoints for suspend/reactivate, onboarding link regeneration, and usage counters (jobs, failures, seats).
- Build support tooling endpoints in a new `SupportAsStaff` area: job lookup (schedule + publish job history), retry/cancel operations wrapping tenant services, impersonation token issuance with Data Protection.
- Create `SystemNotice` endpoints to publish incidents/maintenance banners consumed by staff UI.

### Frontend

- Reuse `apps/front/app/routes/authed/staff` layout; add staff-specific login/invitation acceptance under `apps/front/app/routes/auth`.
- Upgrade tenants pages with status actions, usage tabs, linked tenant profiles (using existing `ProfileAsStaff` API).
- Introduce Support Center routes for job search, retry/cancel controls, impersonation modal, and inline audit trail display.
- Add Staff Management views (list, invite modal, role editor, revoke flow) and wire audit trail drawers for sensitive actions.
- Implement dashboard widgets for job metrics, active incidents, and quick links (Hangfire guarded for Owner/Admin roles).

## 5) Deferred / post-MVP features

- Billing and plan administration, payments reconciliation.
- Custom role matrix with granular permissions and approval workflows.
- SLA dashboards, analytics, customer communication timelines.
- Ticketing integrations, SIEM exports, long-term audit retention.

## 6) Technical plan

### Architecture

- Continue using mono-repo: .NET API in `apps/api`, React + Vite front in `apps/front`.
- Keep staff tables in `MainApiDbContext`; follow existing migrations pattern in `apps/api/Src/Data/DbContext`.
- Maintain route grouping via `RoutePath.Staff.*`; reuse validation helpers and filters already in `apps/api/Src/Lib`.

### Authentication & security

- Layer invitation + magic-link flow onto existing `AccountScope.Staff` accounts; bootstrap Owner via seeding command.
- Issue signed single-use login tokens with Data Protection; store verification logs (IP, user agent) for audits.
- Introduce `RequireStaffRole` endpoint filter and React guards to enforce Owner/Admin/Support access; restrict Hangfire dashboard.

### Data model additions

- `StaffInvitation`: Id, Email, Role, TokenHash, ExpiresAt, AcceptedAt, InvitedBy.
- `StaffRoleAssignment`: StaffUserId, Role (Owner/Admin/Support), CreatedAt, RevokedAt.
- `StaffAuditEntry`: Id, StaffUserId, ActionType, TargetType, TargetId, Metadata(Json), CreatedAt.
- `StaffImpersonationToken`: Id, TenantId, StaffUserId, ExpiresAt, Reason, TokenHash.
- `SystemNotice`: Id, Severity, Message, StartsAt, ExpiresAt, CreatedByStaffId, plus dismissal link table for per-user state.

### Infrastructure

- Extend existing email service for magic-link delivery; centralize templates in shared mailer utilities if available.
- Schedule Hangfire jobs to expire invitations/impersonation tokens and prune stale notices.
- Leverage structured logging already in place; forward audit events to central storage.

## 7) UI / UX plan

- Maintain staff navigation (Dashboard, Tenants, Support, Staff, Notices) using current layout components.
- Dashboard: metrics cards (active tenants, suspended tenants, job failure rate), latest incidents list, quick links (Hangfire, support search).
- Tenants: table with filters, detail drawer tabs (Overview, Usage, Profiles, Activity); action bar for suspend/reactivate/reset onboarding.
- Support Center: searchable list by tenant/post/job id, detail panel with attempts/history, buttons for retry/cancel, impersonation modal requiring reason.
- Staff Management: table with avatars/roles, invite modal capturing role, inline role change, revoke confirmation capturing audit reason.
- System Notices: top-level banner for active incidents, notices page with history and dismiss controls per user.

## 8) Week-by-week plan (suggested 8-week cadence)

1. **Access & invitations** — design invitation tables, seed Owner CLI, implement backend endpoints and email delivery for invites/magic links.
2. **Auth UX & guards** — build staff login/invite pages, session persistence, and enforce role guards in API + front.
3. **Tenant administration upgrades** — extend APIs for suspend/reactivate/reset onboarding/usage; update front tenants list/detail to consume new data.
4. **Audit logging foundation** — implement audit entity, instrument existing staff endpoints, expose audit feed API + base UI drawer.
5. **Support tooling backend** — create job search/retry/cancel/impersonation endpoints, integrate with publish pipeline, add notice CRUD.
6. **Support Center UI** — build job search interface, impersonation modal, Hook Hangfire link with guards, connect audit trail sidebar.
7. **Staff management & notices UI** — invite modal, role management, revoke flow, notices banner/list, finalize dashboard metrics.
8. **Hardening & QA** — apply rate limiting, add integration/E2E tests, perform security review, document operations.

## 9) Acceptance criteria

- Only invited staff authenticate; Owner retains exclusive destructive capabilities.
- Staff can suspend/reactivate tenants, view usage, and reset onboarding without DB access.
- Support operators locate jobs, review attempts, retry/cancel, and impersonate tenants with audit coverage.
- Every staff action records an audit entry retrievable via UI/export.
- Dashboard surfaces current incidents and job health; Hangfire reachable only to authorized roles.

## 10) Risks & mitigations

- **Unauthorized access**: enforce single-use magic links, short expirations, alert on role changes.
- **Impersonation misuse**: require reason capture, short-lived tokens, automatic expiry cleanup.
- **Scope creep**: keep MVP focused on operations; defer billing/analytics to later phase.
- **UI inconsistency**: reuse component library and design tokens to avoid divergent styling.

## 11) Mapping to current codebase

- Backend: extend existing staff feature folders (`StaffMember`, `TenantAsStaff`, `ProfileAsStaff`) and add new ones (`SupportAsStaff`, `AuditAsStaff`, `SystemNotice`) under `apps/api/Src/Features/Staff`.
- Update `MainApiDbContext` and migrations with new tables; reuse seeding approach in `apps/api/Src/Data/Seeder.cs`.
- Frontend: evolve `apps/front/app/routes/authed/staff/*` pages; add staff auth/invite flows under `apps/front/app/routes/auth`.
- Shared: leverage permission filters in `apps/api/Src/Lib/Filters`, constants in `RoutePath`, and design components in `apps/front/app/components`.
