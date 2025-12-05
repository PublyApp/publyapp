# PublyApp — Staff Backoffice MVP Plan (2–3 Months)

**Last Updated:** December 5, 2025
**Status:** Week 1 Complete ✅ | Week 2 In Progress 🚀

---

## 1) Project focus & personas

- Audience: owner/operator and collaborators who administer tenants (customers) through the existing staff portal.
- Goal: evolve staff experiences so the internal team can manage tenants, troubleshoot scheduling jobs, and enforce compliance without direct database access.

## 2) Current baseline & gaps

### ✅ **Week 1 Completed (December 2025)**
- **Unified Invitation System**: Single `Invitation` table with scope discriminator (Staff/Tenant/Project)
- **Owner Bootstrap**: Environment-driven owner account creation with Admin level
- **Staff Profiles**: Three profiles seeded (Owner, Admin, Support) using existing Profile system
- **Audit Logging**: Complete `AuditLog` entity with `AuditLogService` tracking all staff actions
- **Session-Based Impersonation**: Extended `Session` entity with impersonation metadata and service layer
- **System Notices**: Entity structure ready for operational alerts
- **Full API**: 7 endpoints (4 authenticated staff, 3 anonymous) with handlers
- **Complete Frontend**: Invitation acceptance page, staff invitation management UI, bulk creation

### 📋 **Remaining Gaps**
- Limited tenant controls (suspend/reactivate, usage snapshots) - **Target: Week 2**
- No active impersonation UI (backend ready) - **Target: Week 2**
- No publish-job tooling - **Target: Week 3-4**
- Minimal system notice UI (entity exists) - **Target: Week 2**
- No Hangfire integration for privileged roles - **Target: Week 4**
- Endpoint authorization gaps (Issue #80, #87) - **Target: Week 2 start**

## 3) Staff MVP goals

- ✅ **[DONE]** Harden staff authentication with invite-based onboarding and explicit Owner/Admin/Support roles.
- 🚧 **[WEEK 2]** Expand tenant administration to include status toggles, usage snapshots, and enhanced visibility.
- ⏭️ **[WEEK 3-4]** Provide support tooling: search publish jobs, retry/cancel runs, and impersonate tenant sessions safely.
- ✅ **[DONE - Partial]** Introduce staff management (invite complete, role modification pending).
- ⏭️ **[WEEK 2-3]** Surface operational awareness: dashboards summarizing queue health, failure rates, and system notices.

## 4) Lean feature scope (must-have)

### Backend

- ✅ **[DONE]** Unified `Invitation` system supporting Staff/Tenant/Project scopes with token-based acceptance.
- ✅ **[DONE]** Audit logging (`AuditLog`) capturing actor, action, target, metadata with `AuditLogService`.
- ✅ **[DONE]** Session-based impersonation infrastructure via extended `Session` entity.
- 🚧 **[WEEK 2]** Enhance tenant endpoints for suspend/reactivate and usage counters (jobs, failures, users).
- 🚧 **[WEEK 2]** Complete endpoint authorization (TenantAuthFilter, permission checks).
- ⏭️ **[WEEK 3-4]** Build support tooling endpoints: job lookup, retry/cancel operations, active impersonation flow.
- 🚧 **[WEEK 2]** Create `SystemNotice` CRUD endpoints for incidents/maintenance banners.

### Frontend

- ✅ **[DONE]** Invitation acceptance page at `/auth/accept-invitation` with token validation.
- ✅ **[DONE]** Staff invitation management at `/authed/staff/invitations` with bulk creation.
- 🚧 **[WEEK 2]** Fix TypeScript errors in tenant management module (Issue #94).
- 🚧 **[WEEK 2]** Upgrade tenants pages with status actions, usage tabs, and activity timelines.
- 🚧 **[WEEK 2]** Implement active impersonation UI (modal, banner, session management).
- 🚧 **[WEEK 2]** System notices management page and active notice banner component.
- 🚧 **[WEEK 2]** Audit log viewer with filtering and export functionality.
- ⏭️ **[WEEK 3-4]** Support Center routes for job search, retry/cancel controls.
- ⏭️ **[WEEK 3-4]** Dashboard widgets for job metrics and system health.

## 5) Deferred / post-MVP features

- Billing and plan administration, payments reconciliation.
- Custom role matrix with granular permissions and approval workflows.
- Magic-link authentication (using password login for MVP).
- SLA dashboards, analytics, customer communication timelines.
- Ticketing integrations, SIEM exports, long-term audit retention.

## 6) Technical plan

### Architecture (Updated with Week 1 Learnings)

- ✅ **Unified Entity Pattern**: Single tables with scope discriminators (`Invitation`, `Profile`, `UserAccount`).
- ✅ **Database-Generated UUID v7**: All Guid PKs use `BaseAttributes` with PostgreSQL UUID v7 generation.
- ✅ **Minimal Seeding Principle**: Seeders create structure only, not relationships.
- ✅ **Session Extension Pattern**: Reuse existing `Session` entity for impersonation (no new token table).
- Continue using mono-repo: .NET API in `apps/api`, React + Vite front in `apps/front`.
- Keep staff tables in `MainApiDbContext`; follow existing migrations pattern.
- Maintain route grouping via `RoutePath.Staff.*`.

### Authentication & security

- ✅ **[DONE]** Token-based invitation flow with hashed tokens stored in unified `Invitation` table.
- ✅ **[DONE]** Owner bootstrapped via environment variables during seeding.
- ✅ **[DONE]** Profile-based role system using existing `UserAccountProfile` (no separate role table).
- 🚧 **[WEEK 2]** Enforce `TenantAuthFilter` authorization logic (Issue #87).
- 🚧 **[WEEK 2]** Complete endpoint permission checks (Issue #80).
- ⏭️ **[WEEK 4]** Add `RequireStaffRole` endpoint filter for granular access control.
- ⏭️ **[WEEK 4]** Restrict Hangfire dashboard to Owner/Admin roles.

### Data model additions (Actual Implementation)

**✅ Implemented in Week 1:**
- `Invitation` (unified): Id, Email, Scope (Staff/Tenant/Project), TenantId, ProjectId, Token, ExpiresAt, AcceptedAt, IsRevoked, InvitedByUserId, ProfileId
- `InvitationProfile` (junction): InvitationId, ProfileId (composite PK, supports multi-profile invites)
- `AuditLog`: Id, UserId, Action, TargetId, Details (JSON), IpAddress, UserAgent, CreatedAt
- `SystemNotice`: Id, Severity (Info/Warning/Critical), Title, Message, StartsAt, ExpiresAt, CreatedByStaffId
- `Session` (extended): IsImpersonation, ImpersonatingStaffUserId, ImpersonationReason, ImpersonationExpiresAt

**📋 Not Created (Better Alternatives Used):**
- ~~`StaffInvitation`~~ → Used unified `Invitation` table with `Scope = Staff`
- ~~`StaffRoleAssignment`~~ → Reused existing `Profile` + `UserAccountProfile` system
- ~~`StaffImpersonationToken`~~ → Extended existing `Session` entity instead
- ~~`StaffAuditEntry`~~ → Generic `AuditLog` entity for all system-wide auditing

### Infrastructure

- ✅ **[DONE]** Token generation and validation in `InvitationService`.
- 🚧 **[WEEK 2]** Email service integration for invitation delivery (deferred for MVP).
- ⏭️ **[WEEK 4]** Schedule Hangfire jobs to expire invitations/impersonation tokens.
- ✅ **[DONE]** Structured audit logging with IP/user agent capture via `AuditLogService`.

## 7) UI / UX plan

### ✅ **Completed (Week 1)**
- Invitation acceptance flow: Token validation → Form submission → Account creation → Session
- Staff invitation management: Create (single/bulk), list, revoke, status tracking
- Base staff portal navigation maintained

### 🚧 **Week 2 Focus**
- **Tenants Module**: Fix TypeScript errors (Issue #94), add suspend/reactivate actions, usage metrics tab, activity timeline
- **Impersonation**: Modal with reason input, active session banner, time remaining display, end session button
- **System Notices**: CRUD interface at `/authed/staff/notices`, severity-based banner component
- **Audit Logs**: Viewer page with filters (user, action, date range), export button, inline displays

### ⏭️ **Week 3-4 Focus**
- Support Center: Job search interface, retry/cancel buttons, impersonation from support context
- Dashboard: Metrics cards (active/suspended tenants, job failure rate), quick links, system health

## 8) Week-by-week plan (UPDATED - Current Progress)

### ✅ **Week 1: Invitation & Audit Foundations** [COMPLETE]
**Delivered:** Unified invitation system, owner bootstrap, staff profiles, audit logging, impersonation infrastructure, system notice entity, complete frontend for invitations.

**What Changed from Original Plan:**
- ✅ Better: Used unified `Invitation` table instead of separate `StaffInvitation`
- ✅ Better: Reused `Profile` system instead of creating `StaffRoleAssignment`
- ✅ Better: Extended `Session` instead of creating `StaffImpersonationToken`
- ✅ Enhanced: Completed full frontend (not originally planned for Week 1)
- ⏭️ Deferred: Magic-link authentication (using password login)

---

### 🚧 **Week 2: Tenant Management & Active Impersonation** [IN PROGRESS]
**Focus:** Make staff portal operationally useful with tenant administration and impersonation UI.

**Backend Tasks:**
1. Fix tenant authorization (Issue #87 - `TenantAuthFilter`)
2. Implement tenant suspend/reactivate with audit logging
3. Create tenant usage aggregation service (count users, projects, schedules)
4. Add impersonation start/end endpoints (service already exists)
5. System notice CRUD endpoints
6. Audit log query endpoints with filters

**Frontend Tasks:**
1. **Fix Issue #94**: Resolve TypeScript errors in tenant management module
2. Enhance tenant list: Status badges, quick actions, usage columns
3. Tenant details tabs: Overview, Usage, Activity, Users
4. Impersonation modal: Reason input, duration selector, start button
5. Impersonation banner: Active session display, time remaining, end button
6. System notices management page and banner component
7. Audit log viewer with filtering and export

**Acceptance Criteria:**
- Staff can suspend/reactivate tenants from UI with audit trail
- Tenant usage metrics displayed accurately
- Staff can start/end impersonation sessions with active banner
- System notices can be created, edited, and displayed
- Audit logs are viewable, filterable, and exportable
- All TypeScript errors in tenant module resolved

---

### ⏭️ **Week 3: Support Tooling Backend**
**Focus:** Job search, retry/cancel operations, dashboard metrics.

**Tasks:**
1. Create `SupportAsStaff` feature area with job search endpoints
2. Implement schedule retry/cancel operations (wrap existing services)
3. Build dashboard metrics aggregation API
4. Add background cleanup jobs for expired sessions/invitations
5. Integration tests for support operations

**Acceptance Criteria:**
- API can locate jobs by tenant/schedule ID
- Retry/cancel operations respect tenant boundaries
- Metrics API returns accurate tenant/job statistics

---

### ⏭️ **Week 4: Support Center UI & Dashboard**
**Focus:** Job management interface, dashboard widgets, Hangfire integration.

**Tasks:**
1. Build job search interface at `/authed/staff/support`
2. Implement retry/cancel buttons with audit toasts
3. Create dashboard widgets for metrics cards
4. Integrate Hangfire dashboard with role guards (Owner/Admin)
5. Add quick links and system health indicators

**Acceptance Criteria:**
- Support staff can search, inspect, and act on jobs
- Dashboard displays live metrics and system health
- Hangfire accessible only to authorized roles

---

### ⏭️ **Week 5: Staff Management Enhancements**
**Focus:** Role management, last login tracking, invitation resend.

**Tasks:**
1. Add last login timestamp tracking to sessions
2. Build role change UI (using existing Profile assignment system)
3. Implement staff revocation flow with audit capture
4. Add invitation resend functionality
5. Create staff detail drawer with history

**Acceptance Criteria:**
- Owner/Admin can modify staff roles via UI
- Last login displayed on staff list
- Revoked staff cannot access system
- Audit trail captures all role changes

---

### ⏭️ **Week 6: Polish & Advanced Features**
**Focus:** Email notifications, advanced audit features, UX improvements.

**Tasks:**
1. Integrate email service for invitation delivery
2. Advanced audit log features (detailed views, multi-entity export)
3. Responsive design improvements across staff portal
4. Error handling and loading state refinements
5. User feedback optimization (toasts, confirmations)

**Acceptance Criteria:**
- Invitations delivered via email automatically
- Audit logs support complex filtering and export
- Staff portal works seamlessly on all devices

---

### ⏭️ **Week 7: Testing & Quality Assurance**
**Focus:** Comprehensive testing, security review, performance optimization.

**Tasks:**
1. Implement Issue #60: API endpoint tests and Playwright E2E tests
2. Conduct security review addressing Issues #80, #87
3. Add rate limiting to critical endpoints (Issue #57)
4. Performance optimization (caching, query optimization)
5. Load testing for staff operations

**Acceptance Criteria:**
- All tests pass locally and in CI
- Security review findings addressed
- Rate limits behave correctly
- Performance meets targets

---

### ⏭️ **Week 8: Hardening & Production Prep**
**Focus:** Documentation, deployment, final QA.

**Tasks:**
1. Complete operational documentation (runbooks, env variables)
2. Prepare deployment checklist and migration guide
3. Final security audit (CSRF, XSS, session fixation)
4. Smoke test all staff workflows end-to-end
5. Prepare release notes and changelog

**Acceptance Criteria:**
- Documentation complete and accurate
- Deployment checklist validated on staging
- All security findings resolved
- Staff portal production-ready

---

## 9) Acceptance criteria

### ✅ **Achieved (Week 1)**
- ✅ Only invited staff can authenticate via token-based invitations
- ✅ Owner account created automatically via environment bootstrap
- ✅ Every staff action (invitation creation/acceptance/revocation) records audit entry
- ✅ Invitation system supports multiple profiles per invitation
- ✅ Frontend provides complete invitation management experience

### 🚧 **Week 2 Targets**
- Staff can suspend/reactivate tenants from UI without DB access
- Staff can view tenant usage metrics (users, projects, schedules)
- Staff can impersonate tenant sessions with audit trail and time limits
- System notices can be created and displayed with severity indicators
- Audit logs are viewable, filterable, and exportable from UI
- All endpoint authorization gaps closed (Issues #87, #80)

### ⏭️ **Remaining for MVP**
- Support operators can locate jobs, review attempts, retry/cancel
- Dashboard surfaces current incidents and job health
- Hangfire reachable only to authorized roles
- All staff workflows have comprehensive test coverage

## 10) Risks & mitigations

- **Unauthorized access**: ✅ Token-based invitations implemented; 🚧 Complete endpoint authorization (Week 2).
- **Impersonation misuse**: ✅ Session-based with expiry; 🚧 Add reason capture and UI controls (Week 2).
- **Scope creep**: ✅ Deferred magic-link auth, billing, analytics; maintain focus on operations.
- **TypeScript errors blocking progress**: 🚧 Fix Issue #94 as part of Week 2 tenant improvements.
- **Security gaps**: 🚧 Address Issues #80, #87 in Week 2 before expanding features.
- **UI inconsistency**: ✅ Reusing component library; continue pattern in Week 2+.

## 11) Mapping to current codebase

### ✅ **Week 1 Implementation**
- Backend: `apps/api/Src/Modules/Shared/Invitations/`, `apps/api/Src/Modules/Staff/AuditLogs/`, `apps/api/Src/Modules/Staff/SystemNotice/`
- Extended: `apps/api/Src/Modules/Shared/Auth/Session.cs` (impersonation fields)
- Seeders: `apps/api/Src/Modules/Shared/Users/UserSeeder.cs`, `UserAccountSeeder.cs`, `StaffProfileSeeder.cs`
- Frontend: `apps/front/app/routes/auth/accept-invitation/`, `apps/front/app/routes/authed/staff/invitations/`
- Services: `InvitationService`, `AuditLogService`, `ImpersonationService` registered in DI

### 🚧 **Week 2 Plan**
- Backend: Enhance `apps/api/Src/Modules/Staff/TenantsAsStaff/` with suspend/reactivate/usage
- Backend: Add `TenantAuthFilter` authorization (Issue #87)
- Frontend: Fix `apps/front/app/routes/authed/staff/tenants/` TypeScript errors (Issue #94)
- Frontend: Add tenant status controls, usage tabs, impersonation UI
- New: `apps/api/Src/Modules/Staff/SystemNotice/` CRUD endpoints
- New: `apps/front/app/routes/authed/staff/notices/` management page

---

## 12) Progress Tracking

| Week | Status | Completion | Key Deliverables |
|------|--------|-----------|------------------|
| Week 1 | ✅ Complete | 100% | Invitations, Audit, Impersonation infra, Frontend |
| Week 2 | 🚧 In Progress | 0% | Tenant mgmt, Impersonation UI, Notices, Audit viewer |
| Week 3 | ⏭️ Planned | 0% | Support tooling backend, Dashboard metrics |
| Week 4 | ⏭️ Planned | 0% | Support Center UI, Hangfire, Dashboard widgets |
| Week 5 | ⏭️ Planned | 0% | Staff role management, Last login tracking |
| Week 6 | ⏭️ Planned | 0% | Email integration, Advanced features, Polish |
| Week 7 | ⏭️ Planned | 0% | Testing, Security review, Performance |
| Week 8 | ⏭️ Planned | 0% | Documentation, Deployment prep, Final QA |

**Overall Progress:** 12.5% (1/8 weeks) | **Estimated Completion:** Late February 2026

---

**Next Action:** Fix Issue #94 (TypeScript errors in tenant module) and begin Week 2 tenant management improvements! 🚀
