# PublyApp — Staff Backoffice MVP Implementation Guide (Solo Developer)

## 0. Baseline review & setup (Week 0)

- Inventory existing staff capabilities: review `apps/api/Src/Features/Staff/{TenantAsStaff,StaffMember,ProfileAsStaff}` services, the `RoutePath.Staff` definitions, and `/authed/staff` React routes (dashboard, tenants, staff-members).
- Confirm current authentication flow for staff uses shared `UserAccount` records; document gaps (no invitations, limited role data, no impersonation).
- Define Owner bootstrap secrets (`STAFF_OWNER_EMAIL`, `STAFF_OWNER_BOOTSTRAP_CODE`) and configure transactional email (SendGrid/SES) for magic-link delivery.
- Ensure Data Protection key ring path already used by tenant side is shared; provision dev/test buckets for impersonation tokens if persisted externally.
- Capture baselines: run existing staff UI smoke test, list current database tables (`UserAccount`, `Tenant`, `Profile`) to confirm migration order.

---

## Week 1: Invitation & role data foundations

**Objectives**: Extend data model for invitations/roles and seed Owner account.

**Tasks**:
1. Add new entities (`StaffInvitation`, `StaffRoleAssignment`, `StaffAuditEntry`, `StaffImpersonationToken`, `SystemNotice`) under `apps/api/Src/Features/Staff/Entities` and register them in `MainApiDbContext`.
2. Create EF migration (`pnpm --dir apps/api migrate:add AddStaffBackofficeFoundations`) and apply to dev DB; include seeding changes in `apps/api/Src/Data/Seeder.cs` to create Owner from env bootstrap.
3. Implement signing utilities in a new `StaffAuthService` using Data Protection for invite + login tokens, plus hashing helper for DB persistence.
4. Write unit tests covering token round-trip and expiration edge cases.

**Acceptance Criteria**:
- Migration applies cleanly; owner bootstrap CLI/script creates Owner user with `AccountScope.Staff`.
- Token helpers produce single-use payloads recorded in DB with hashed reference.

---

## Week 2: Authentication flows & middleware hardening

**Objectives**: Ship invite issuance/consumption endpoints and session middleware updates.

**Tasks**:
1. Add endpoints in `apps/api/Src/Features/Staff/Auth` (new folder) for invite creation (`POST /staff/invitations` Owner-only), invite status, magic-link request (`POST /staff/login/request-link`), and consumption (`POST /staff/login/consume`).
2. Update `StaffMemberService` to record last login timestamps and enforce soft-deleted/suspended checks.
3. Implement `StaffAuthenticationMiddleware` (or extend existing session middleware) to set staff principal with attached role claims pulled from `StaffRoleAssignment`.
4. Frontend: create `/auth/staff/login` and `/auth/staff/invite` pages using existing design system; connect to new APIs.
5. Add Cypress/Playwright test that covers invite email stub, link consumption, landing in staff dashboard.

**Acceptance Criteria**:
- Owner can invite staff; invitee logs in via emailed link and receives session cookie/JWT.
- Unauthenticated or insufficient-role requests to `/authed/staff/*` redirect to login.

---

## Week 3: Tenant administration enhancements (backend)

**Objectives**: Expand tenant APIs for operational control and usage insights.

**Tasks**:
1. Extend `TenantAsStaffService` for suspend/reactivate, onboarding link regeneration, and usage aggregation (counts from schedules/publish jobs, active profiles).
2. Add endpoints: `PATCH /staff/tenants/{id}/status`, `POST /staff/tenants/{id}/reset-onboarding`, `GET /staff/tenants/{id}/usage`.
3. Hook `ProfileAsStaffService` to filter by active/inactive and expose summary counts.
4. Emit audit entries for each mutation via the new `StaffAuditService`.
5. Write integration tests covering suspend/reactivate, ensuring tenant-scoped operations update correctly.

**Acceptance Criteria**:
- API returns usage snapshot JSON; suspend/reactivate toggles propagate to `Tenant` entity.
- Corresponding audit entries stored with actor + metadata.

---

## Week 4: Tenant administration UI upgrades

**Objectives**: Expose new controls within staff portal.

**Tasks**:
1. Update `apps/front/app/routes/authed/staff/tenants/list` to show status, usage columns, and filter options.
2. Enhance tenant detail drawer (`.../tenants/details`) with tabs (Overview, Usage, Profiles, Activity); wire new API endpoints.
3. Implement suspend/reactivate/reset onboarding actions with optimistic UI and inline audit callouts.
4. Add usage graphs (bar/line) using existing chart components; fallback to empty states when data absent.
5. Add React Query cache updates + tests to confirm UI state syncs.

**Acceptance Criteria**:
- Staff can change tenant status from UI and see immediate feedback.
- Usage tab displays counts matching backend data; activity tab shows latest audit entries.

---

## Week 5: Support tooling backend

**Objectives**: Introduce job search/backoffice controls and impersonation service.

**Tasks**:
1. Create `SupportAsStaff` feature folder with endpoints: job search (`POST /staff/support/jobs/search`), schedule retry/cancel, and impersonation issuance (`POST /staff/support/impersonation`).
2. Integrate with existing scheduling/publishing services to reuse validation and idempotency checks.
3. Implement `StaffImpersonationToken` persistence and background cleanup job.
4. Extend audit logging to cover impersonation issuance and manual retries.
5. Add unit/integration tests verifying retry respects tenant boundaries and impersonation tokens expire correctly.

**Acceptance Criteria**:
- API can locate jobs by tenant or schedule id and trigger retry/cancel with proper responses.
- Impersonation token endpoint returns signed short-lived link recorded in DB.

---

## Week 6: Support Center UI & Hangfire integration

**Objectives**: Deliver Support Center experience leveraging new endpoints.

**Tasks**:
1. Add `/authed/staff/support` route with search panel, results table, and detail drawer showing attempts/errors timeline.
2. Implement retry/cancel buttons calling new APIs; show audit toast on success.
3. Build impersonation modal requiring reason input, success banner linking to tenant app in new tab with token query param.
4. Surface Hangfire dashboard link with role guard (Owner/Admin) and sign-in propagation.
5. Add UI integration tests covering search + retry + impersonation flows.

**Acceptance Criteria**:
- Support staff can search, inspect, and act on jobs from UI.
- Hangfire link available only for authorized roles and opens within authenticated session.

---

## Week 7: Staff management & system notices

**Objectives**: Manage staff lifecycle and display incidents/metrics on dashboard.

**Tasks**:
1. Update staff list routes (`/authed/staff/staff-members/list`) to display role chips, last login, invitation status, with actions for role change/revoke.
2. Implement invite modal hooking into Week 2 APIs, with success/resend flows.
3. Create System Notices CRUD UI under `/authed/staff/notices` plus banner component consumed by dashboard layout.
4. Build dashboard widgets pulling metrics (active tenants, suspended tenants, last 7-day failure rate) via new metrics endpoint.
5. Ensure audit drawer available for role changes and notice publication.

**Acceptance Criteria**:
- Owner/Admin can invite, update roles, revoke staff and see audit trail.
- Dashboard surfaces live metrics and latest notices; notices can be dismissed per user.

---

## Week 8: Hardening, QA, and observability

**Objectives**: Finalize reliability, monitoring, and documentation.

**Tasks**:
1. Add rate limiting to invite/login endpoints; ensure suspicious activity triggers alerts/logs.
2. Implement audit export endpoint (CSV/JSON) with filters; add download button in UI.
3. Expand automated test suite: backend integration for impersonation expiry, frontend E2E for tenant suspension + support retry.
4. Conduct security review (CSRF, XSS, session fixation); verify cookies flagged `Secure`/`HttpOnly` and same-site policies correct.
5. Update operational docs (runbooks, env variable tables) and prepare release checklist.

**Acceptance Criteria**:
- Tests pass locally and in CI; rate limits behave as expected.
- Security review findings addressed; documentation ready for launch.

---

## Testing & verification cues

- **Backend**: xUnit/NUnit tests for auth services, invitation expiration, tenant usage aggregation, impersonation tokens. Use `WebApplicationFactory` integration suites for critical endpoints.
- **Frontend**: React Testing Library for components (tenants detail, support drawer) and Cypress/Playwright journeys (invite acceptance, job retry).
- **Manual**: Dry-run staff workflows (invite → login → suspend tenant → retry job → impersonate) against staging DB; verify audit log entries created per action.
- **Monitoring**: Add structured logging for staff actions and confirm dashboards capture new metrics.

---

## Deployment checklist

- Add env vars: `STAFF_MAGIC_LINK_SECRET`, `STAFF_LOGIN_LINK_BASE_URL`, SMTP credentials, `STAFF_SESSION_COOKIE_NAME`, `STAFF_IMPERSONATION_TOKEN_TTL_MINUTES`.
- Run migrations and seed Owner in staging/production prior to enabling routes.
- Configure email service (domain verification, templates) and test message deliverability.
- Update Dokploy manifests to include staff portal build outputs and ensure API exposes new endpoints.
- Verify staff portal served via HTTPS; confirm cookies set with `Secure`, `HttpOnly`, and appropriate `SameSite` policies; smoke test Hangfire access via staff portal.
